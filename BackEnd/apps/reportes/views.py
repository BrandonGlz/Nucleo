import hmac
import time
from datetime import timedelta

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dispositivos.models import Dispositivo
from apps.reportes import agente, aprendizaje, graficas, ia, pdf, puente, servicios
from apps.reportes.models import PreguntaAgente, ProgramacionReporte, Reporte
from apps.reportes.serializers import (
    ProgramacionReporteSerializer,
    ReporteSerializer,
    SolicitudReporteSerializer,
)
from common import roles
from common.permissions import PermisoPorRol
from common.scoping import areas_visibles, dispositivos_visibles


class ReporteViewSet(viewsets.ReadOnlyModelViewSet):
    """Reportes con IA. Se piden con ``POST``; el texto lo redacta la IA a partir de
    las cifras que calcula el backend, y se descargan en PDF con ``pdf/``."""

    serializer_class = ReporteSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)

    def get_queryset(self):
        usuario = self.request.user
        consulta = Reporte.objects.filter(organizacion_id=usuario.organizacion_id)
        if usuario.rol_id != roles.ADMIN and usuario.area_id:
            consulta = consulta.filter(area_id=usuario.area_id)
        return consulta.select_related("organizacion", "area")

    def create(self, request):
        entrada = SolicitudReporteSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        areas = areas_visibles(request.user)
        area = None
        if datos.get("area") is not None:
            area = areas.filter(pk=datos["area"]).first()
            if area is None:
                raise ValidationError({"area": "El área no existe o no está a su alcance."})
        elif request.user.rol_id != roles.ADMIN and request.user.area_id:
            area = areas.filter(pk=request.user.area_id).first()

        try:
            reporte = servicios.generar_reporte(
                request.user.organizacion,
                area,
                datos["periodo_inicio"],
                datos["periodo_fin"],
                Reporte.Origen.MANUAL,
                usuario=request.user,
            )
        except ia.IANoDisponible as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(reporte).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="pdf")
    def descargar_pdf(self, request, pk=None):
        reporte = self.get_object()
        respuesta = HttpResponse(pdf.construir(reporte), content_type="application/pdf")
        respuesta["Content-Disposition"] = f'attachment; filename="reporte-{reporte.num}.pdf"'
        return respuesta


class ProgramacionReporteViewSet(viewsets.ModelViewSet):
    """Reportes periódicos: frecuencia, área (o toda la organización) y destinatarios.

    Los genera y envía por correo la tarea ``generar_reportes_programados``.
    """

    serializer_class = ProgramacionReporteSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)

    def get_queryset(self):
        usuario = self.request.user
        consulta = ProgramacionReporte.objects.filter(organizacion_id=usuario.organizacion_id)
        if usuario.rol_id != roles.ADMIN and usuario.area_id:
            consulta = consulta.filter(area_id=usuario.area_id)
        return consulta

    def perform_create(self, serializer):
        usuario = self.request.user
        serializer.save(organizacion=usuario.organizacion, creada_por=usuario)


class PreguntaAgenteSerializer(serializers.Serializer):
    pregunta = serializers.CharField(max_length=500)
    dispositivo = serializers.IntegerField()
    # Pregunta anterior de la conversación, para seguimientos como «¿y la gráfica?».
    anterior = serializers.CharField(max_length=500, required=False, allow_blank=True)
    # La web precarga las sugerencias: no son peticiones del usuario ni cuentan como repetidas.
    precarga = serializers.BooleanField(required=False, default=False)


class AgenteView(APIView):
    """Agente IA: hay uno por dispositivo y responde con los datos de ese dispositivo.

    Lo usan administradores, supervisores y analistas; un operador, solo si tiene
    ``acceso_agente`` y sobre el dispositivo que tiene asignado.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.rol_id not in roles.TODOS or not request.user.puede_usar_agente:
            raise PermissionDenied("No tienes acceso a Nico AI.")
        entrada = PreguntaAgenteSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        dispositivo = (
            dispositivos_visibles(request.user)
            .select_related("estado_dispositivo")
            .filter(pk=entrada.validated_data["dispositivo"])
            .first()
        )
        if dispositivo is None:
            raise NotFound("El dispositivo no existe o no está a su alcance.")
        original = entrada.validated_data["pregunta"]
        pregunta = agente.con_contexto(original, entrada.validated_data.get("anterior", ""))
        # El ESP32 del dispositivo es el puente de su agente: sin él, el agente no responde.
        if not puente.activo(dispositivo):
            return Response(
                {
                    "detail": f"Nico AI no está disponible: {dispositivo.nombre} no está activo.",
                    "inactivo": True,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        inicio = time.monotonic()
        precarga = entrada.validated_data.get("precarga", False)
        repetida = None if precarga else self._repetida(request.user, dispositivo, original)
        raras, limpio = agente.sin_sentido(original)
        aviso = ""
        if raras and puente.del_dominio(limpio) and len(limpio.split()) >= 2:
            # Lo tecleado al azar se ignora y se responde el resto, avisando qué se ignoró.
            aviso = f"Ignoré «{raras[0][:30]}», que no entendí. "
            original = limpio
            pregunta = agente.con_contexto(limpio, entrada.validated_data.get("anterior", ""))
            raras = []
        fuera = agente.fuera_de_alcance(dispositivo, original)
        if repetida is not None:
            r, via, extra = repetida
        elif raras:
            texto = (
                f"No entendí «{raras[0][:30]}». Escribe tu pregunta de nuevo, por ejemplo: «¿cómo "
                "está la temperatura?» o «la última medición del aire»."
            )
            r, via, extra = {"texto": texto}, PreguntaAgente.Via.NO_ENTENDIDA, {}
        elif fuera:
            r, via, extra = {"texto": fuera}, PreguntaAgente.Via.NO_ENTENDIDA, {}
        elif not agente.es_espanol(original):
            # Solo español: otra lengua no se procesa ni pasa por la IA.
            r, via, extra = {"texto": agente.SOLO_ESPANOL}, PreguntaAgente.Via.NO_ENTENDIDA, {}
        elif agente.pide_futuro(original):
            # Del futuro no hay lecturas: no se responde ni se pronostica.
            texto = (
                f"No puedo responder sobre el futuro: solo trabajo con las lecturas ya "
                f"registradas de {dispositivo.nombre}. Pregúntame por hoy o por días pasados."
            )
            r, via, extra = {"texto": texto}, PreguntaAgente.Via.NO_ENTENDIDA, {}
        else:
            r, via, extra = self._resolver(request.user, dispositivo, pregunta)
        if pregunta != original:
            # Dependió de la pregunta anterior (seguimiento o corrección): no entra al banco.
            extra["datos"] = {**extra.get("datos", {}), "contexto": True}
        if precarga:
            extra["datos"] = {**extra.get("datos", {}), "precarga": True}
        registro = aprendizaje.registrar(
            request.user,
            dispositivo,
            original,
            via,
            r.get("texto", ""),
            tema=agente._tema(pregunta) or "",
            milisegundos=round((time.monotonic() - inicio) * 1000),
            **extra,
        )
        if aviso:
            r = {**r, "texto": aviso + r.get("texto", "")}
        return Response({**r, "registro": registro.num, "via": via})

    # Repetir la misma petición seguida no cambia la respuesta: la 2.ª devuelve lo ya enviado
    # (sin IA ni consultas nuevas) y desde la 3.ª se omite, para no gastar tokens ni memoria.
    VENTANA_REPETIDA = timedelta(minutes=15)

    def _repetida(self, usuario, dispositivo, pregunta):
        normalizada = aprendizaje.normalizar(pregunta)
        recientes = PreguntaAgente.objects.filter(
            usuario=usuario,
            dispositivo=dispositivo,
            fecha__gte=timezone.now() - self.VENTANA_REPETIDA,
        ).order_by("-fecha", "-num")[:5]
        iguales = []
        for registro in recientes:  # solo cuentan las seguidas: otra pregunta corta la racha
            if registro.datos.get("precarga"):
                continue
            if registro.pregunta_normalizada != normalizada:
                break
            iguales.append(registro)
        if not iguales:
            return None
        Via = PreguntaAgente.Via
        if len(iguales) == 1:
            previo = iguales[0]
            r = {"texto": previo.respuesta}
            # La gráfica o comparativa se vuelve a armar con las reglas (sin IA ni tokens).
            if graficas.pide_comparativa(pregunta):
                r = graficas.comparativa(usuario, dispositivo, pregunta)
            elif graficas.pide_grafica(pregunta):
                r = graficas.grafica(usuario, dispositivo, pregunta)
            r["texto"] = (
                "Repetiste la misma petición; te envío lo mismo que te respondí hace un "
                f"momento:\n\n{previo.respuesta}"
            )
            return r, Via.REPETIDA, {"datos": {"repeticion": 2}}
        texto = (
            f"Omito esta petición: es la {len(iguales) + 1}.ª vez seguida que la haces y la "
            "respuesta no va a cambiar; repetirla solo consumiría recursos sin un fin. Si "
            "necesitas algo distinto, cambia la variable, el periodo o lo que quieres ver."
        )
        return {"texto": texto}, Via.REPETIDA, {"datos": {"repeticion": len(iguales) + 1}}

    def _resolver(self, usuario, dispositivo, pregunta, ruteada=False):
        """Respuesta, cómo se resolvió y datos para el registro. En orden: comparativa, gráfica,
        reporte, respuesta aprendida, IA (solo para explicar, opinar o recomendar) y
        predefinida."""
        Via = PreguntaAgente.Via
        # Comparativas y gráficas sueltas van antes que el reporte: «solo la gráfica del reporte»
        # o «compara el reporte de esta semana» no generan un reporte completo.
        if graficas.pide_comparativa(pregunta):
            return graficas.comparativa(usuario, dispositivo, pregunta), Via.PREDEFINIDA, {}
        if graficas.pide_grafica(pregunta):
            return graficas.grafica(usuario, dispositivo, pregunta), Via.PREDEFINIDA, {}
        if agente.pide_reporte(pregunta):
            return agente.generar_reporte(usuario, dispositivo, pregunta), Via.PREDEFINIDA, {}
        tema = agente._tema(pregunta)
        if tema is None:
            return self._sin_tema(usuario, dispositivo, pregunta, ruteada)
        r = agente.responder(dispositivo, pregunta)
        if not puente.pide_ia(pregunta):
            return r, Via.PREDEFINIDA, {}
        explicado = agente.explicar(dispositivo, pregunta)
        if explicado is not None:
            return explicado, Via.PREDEFINIDA, {}
        datos = agente.datos_de(dispositivo, pregunta)
        aprendida, texto = aprendizaje.buscar(dispositivo, pregunta, tema, datos)
        if texto:
            return {**r, "texto": texto}, Via.BANCO, {"datos": datos, "aprendida": aprendida}
        if puente.con_puente(dispositivo):
            texto, tokens = puente.redactar(dispositivo, pregunta, r["texto"], datos)
            if texto:
                return {**r, "texto": texto}, Via.IA, {"datos": datos, **tokens}
            return r, Via.PREDEFINIDA, {"datos": datos, **tokens}
        return r, Via.PREDEFINIDA, {"datos": datos}

    def _sin_tema(self, usuario, dispositivo, pregunta, ruteada):
        """Las reglas no entendieron: una ruta aprendida (👍 anterior) o la IA elige la
        herramienta y se responde con la pregunta canónica. Sin eso, «no entendida»."""
        Via = PreguntaAgente.Via
        no_entendida = agente.responder(dispositivo, pregunta)
        if ruteada:
            return no_entendida, Via.NO_ENTENDIDA, {}
        aprendida = aprendizaje.ruta_aprendida(dispositivo, pregunta)
        if aprendida is not None:
            r, _, _ = self._resolver(usuario, dispositivo, aprendida.plantilla, ruteada=True)
            return r, Via.BANCO, {"aprendida": aprendida, "datos": {"ruta": aprendida.plantilla}}
        if not puente.con_puente(dispositivo) or not puente.del_dominio(pregunta):
            return no_entendida, Via.NO_ENTENDIDA, {}
        canonica, tokens = puente.enrutar(dispositivo, pregunta)
        if not canonica or agente.pide_futuro(canonica):
            return no_entendida, Via.NO_ENTENDIDA, tokens
        r, _, _ = self._resolver(usuario, dispositivo, canonica, ruteada=True)
        return r, Via.ENRUTADA, {"datos": {"ruta": canonica}, **tokens}


class CalificarAgenteSerializer(serializers.Serializer):
    registro = serializers.IntegerField()
    voto = serializers.ChoiceField(choices=["si", "no"], allow_null=True)


class CalificarAgenteView(APIView):
    """👍/👎 de una respuesta de Nico AI. Un 👍 a una respuesta de la IA la guarda en el banco."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        entrada = CalificarAgenteSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        registro = (
            PreguntaAgente.objects.select_related("dispositivo__area", "aprendida")
            .filter(pk=entrada.validated_data["registro"], usuario=request.user)
            .first()
        )
        if registro is None:
            raise NotFound("Esa respuesta no existe.")
        valor = {"si": 1, "no": -1, None: None}[entrada.validated_data["voto"]]
        aprendida = aprendizaje.calificar(registro, valor)
        return Response({"aprendida": aprendida})


class EstadoAgenteView(APIView):
    """Qué agentes están activos (su ESP32 está consultando). Sin puente, todos lo están."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        visibles = list(dispositivos_visibles(request.user).select_related("area"))
        activos = [d for d in visibles if puente.activo(d)]
        # Al abrir el chat se calienta el modelo para que la primera pregunta no espere la carga.
        for d in activos:
            if puente.con_puente(d):
                puente.calentar(d)
                break
        return Response(
            {
                "puente": puente.habilitado(),
                "activos": [d.num for d in activos],
                "fisicos": [d.num for d in visibles if puente.con_puente(d)],
            }
        )


class _PuenteBase(APIView):
    """Lo usa solo el ESP32 puente, con la clave ``X-Puente-Clave`` (no hay sesión)."""

    authentication_classes = []
    permission_classes = []

    def _dispositivo(self, request, codigo):
        clave = request.headers.get("X-Puente-Clave", "")
        if not puente.habilitado() or not hmac.compare_digest(clave, settings.IA_PUENTE_CLAVE):
            raise PermissionDenied("Clave de puente inválida.")
        if not codigo or not Dispositivo.objects.filter(codigo_mqtt=codigo).exists():
            raise NotFound("Dispositivo desconocido.")
        return codigo


class PuenteTomarView(_PuenteBase):
    def get(self, request):
        codigo = self._dispositivo(request, request.query_params.get("dispositivo", ""))
        trabajo = puente.tomar(codigo)
        if trabajo is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(trabajo)


class PuenteEntregarView(_PuenteBase):
    def post(self, request):
        codigo = self._dispositivo(request, request.data.get("dispositivo", ""))
        puente.entregar(
            codigo,
            str(request.data.get("id", "")),
            request.data.get("texto"),
            request.data.get("error"),
            request.data.get("tokens_entrada", 0),
            request.data.get("tokens_salida", 0),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
