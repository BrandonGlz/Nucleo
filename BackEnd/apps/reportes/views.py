import hmac
import time

from django.conf import settings
from django.http import HttpResponse
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
        r, via, extra = self._resolver(request.user, dispositivo, pregunta)
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
        return Response({**r, "registro": registro.num, "via": via})

    def _resolver(self, usuario, dispositivo, pregunta):
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
        r = agente.responder(dispositivo, pregunta)
        if tema is None:
            return r, Via.NO_ENTENDIDA, {}
        if not puente.pide_ia(pregunta):
            return r, Via.PREDEFINIDA, {}
        datos = agente.datos_de(dispositivo, pregunta)
        aprendida, texto = aprendizaje.buscar(dispositivo, pregunta, tema, datos)
        if texto:
            return {**r, "texto": texto}, Via.BANCO, {"datos": datos, "aprendida": aprendida}
        if puente.habilitado():
            texto = puente.redactar(dispositivo, pregunta, f"{r['texto']} Cifras: {datos}")
            if texto:
                return {**r, "texto": texto}, Via.IA, {"datos": datos}
        return r, Via.PREDEFINIDA, {"datos": datos}


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
        visibles = dispositivos_visibles(request.user).select_related("area")
        return Response(
            {
                "puente": puente.habilitado(),
                "activos": [d.num for d in visibles if puente.activo(d)],
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
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
