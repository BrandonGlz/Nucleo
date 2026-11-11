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
from apps.reportes import (
    agente,
    aprendizaje,
    graficas,
    herramientas,
    ia,
    interprete,
    pdf,
    puente,
    servicios,
)
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
        conversacion = (
            agente.es_afirmacion(original)
            or agente.es_negacion(original)
            or agente.es_cortesia(original)
        )
        # «sí», «no» o «gracias» repetidos son conversación normal, no peticiones repetidas.
        repetida = (
            None
            if precarga or conversacion
            else self._repetida(request.user, dispositivo, original)
        )
        raras, limpio = agente.sin_sentido(original)
        aviso = ""
        if raras and puente.del_dominio(limpio) and len(limpio.split()) >= 2:
            # Lo tecleado al azar se ignora y se responde el resto, avisando qué se ignoró.
            aviso = f"Ignoré «{raras[0][:30]}», que no entendí. "
            original = limpio
            pregunta = agente.con_contexto(limpio, entrada.validated_data.get("anterior", ""))
            raras = []
        anterior = entrada.validated_data.get("anterior", "")
        propuesta = self._propuesta(request.user, dispositivo)
        retomada = None
        if (
            agente._tema(original) is None
            and agente.refiere_propia(dispositivo, original)
            and not agente.lugar_pedido(dispositivo, original)
        ):
            # «Dame el de este área» / «lo del almacén»: la última petición concreta de la
            # conversación, sin el área ajena, respondida con este dispositivo.
            retomada = self._ultima_concreta(request.user, dispositivo)
            if retomada:
                pregunta = agente.sin_lugar(dispositivo, retomada)
        fuera = None if retomada else agente.fuera_de_alcance(dispositivo, original, request.user)
        if not retomada and not fuera and anterior and agente.lugar_pedido(dispositivo, anterior):
            # La anterior era de otra área o dispositivo: no se junta con ella (respondería con
            # los datos de este dispositivo). «Sí la tengo» recibe una explicación.
            pregunta = original
            if not agente.es_cortesia(original):
                fuera = agente.insiste_fuera(dispositivo, original, anterior, request.user)
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
        elif propuesta and agente.es_afirmacion(original):
            # «Sí» a lo que el agente propuso en su respuesta anterior: se hace eso.
            r, via, extra = self._verificado(request.user, dispositivo, propuesta)
            pregunta = propuesta
        elif propuesta and agente.es_negacion(original):
            texto = (
                "Entendido, no era eso. Dímelo con tus palabras, por ejemplo: «la temperatura "
                "de ayer», «la última medición del aire» o «gráfica de la humedad»."
            )
            r, via, extra = {"texto": texto}, PreguntaAgente.Via.PREDEFINIDA, {}
        elif agente.pide_futuro(original):
            # Del futuro no hay lecturas: no se responde ni se pronostica.
            texto = (
                f"No puedo responder sobre el futuro: solo trabajo con las lecturas ya "
                f"registradas de {dispositivo.nombre}. Pregúntame por hoy o por días pasados."
            )
            r, via, extra = {"texto": texto}, PreguntaAgente.Via.NO_ENTENDIDA, {}
        else:
            r, via, extra = self._verificado(request.user, dispositivo, pregunta)
        if pregunta != original:
            # Dependió de la pregunta anterior (seguimiento o corrección): no entra al banco.
            extra["datos"] = {**extra.get("datos", {}), "contexto": True}
        if precarga:
            extra["datos"] = {**extra.get("datos", {}), "precarga": True}
        elif repetida is None and not raras:
            r, via, extra = self._conversar(dispositivo, original, fuera, r, via, extra)
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
        pasos = self._pasos(dispositivo, original, anterior, via, extra, fuera, aviso, repetida)
        if retomada:
            pasos[:0] = [
                f"Entendí que te refieres al área {dispositivo.area.nombre} "
                f"de {dispositivo.nombre}",
                f"Retomé tu pregunta «{retomada}» para esta área",
            ]
            pasos = [p for p in pasos if p != "Lo relacioné con tu mensaje anterior"]
        return Response({**r, "registro": registro.num, "via": via, "pasos": pasos})

    def _pasos(self, dispositivo, original, anterior, via, extra, fuera, aviso, repetida):
        """Los pasos que el agente siguió de verdad con esta petición, para mostrarlos con la
        respuesta («Cómo lo resolví»). Salen de lo que entendió y de lo que hizo."""
        Via = PreguntaAgente.Via
        datos = extra.get("datos") or {}
        if repetida is not None:
            return ["Era la misma petición que la anterior", "Te envié lo que ya había respondido"]
        pasos = []
        if aviso:
            pasos.append("Ignoré lo que no se entendía del mensaje")
        propio = agente.lugar_pedido(dispositivo, original)
        lugar = propio or (
            agente.lugar_pedido(dispositivo, anterior) if fuera and anterior else None
        )
        if agente.es_afirmacion(original) and datos.get("peticion"):
            pasos.append("Retomé lo que te propuse")
        if fuera and lugar:
            tipo, nombre, otra = lugar
            if propio is None:
                pasos.append("Retomé tu mensaje anterior")
            if tipo == "no_existe":
                pasos += [f"Busqué «{nombre}» entre las áreas de tu organización", "No la encontré"]
            elif tipo == "otra_area":
                pasos += [
                    f"Encontré el área {otra.nombre}",
                    f"Este agente solo ve {dispositivo.nombre}",
                ]
            else:
                pasos.append(f"Este agente solo ve {dispositivo.nombre}")
            pasos.append("Revisé las áreas que puedes consultar")
        elif datos.get("peticion"):
            pasos += interprete.paso_de(interprete.Peticion(texto="", **datos["peticion"]))
        if datos.get("ruta") and via == Via.ENRUTADA:
            pasos.insert(
                0, f"Mis reglas no lo reconocieron; la IA lo interpretó como «{datos['ruta']}»"
            )
        if via == Via.BANCO:
            pasos.append("Usé una respuesta que aprendí de tus 👍")
        if datos.get("verificacion"):
            pasos.append("Revisé la respuesta contra lo que pediste y la corregí")
        if datos.get("duda"):
            pasos.append(
                "No estuve seguro de lo que pides, así que te pregunto para no equivocarme"
            )
        if via == Via.IA:
            pasos.append("La IA redactó el texto con los datos verificados")
        elif (
            datos.get("hechos") is None
            and puente.con_puente(dispositivo)
            and (extra.get("tokens_salida"))
        ):
            pasos.append("La IA no aportó nada fiel a los datos; te respondo con las reglas")
        return pasos or ["Revisé tu mensaje"]

    # Repetir la misma petición seguida no cambia la respuesta: la 2.ª devuelve lo ya enviado
    # (sin IA ni consultas nuevas) y desde la 3.ª se omite, para no gastar tokens ni memoria.
    VENTANA_REPETIDA = timedelta(minutes=15)

    def _conversar(self, dispositivo, mensaje, fuera, r, via, extra):
        """En la conversación (insistir, comentar, reportar algo, una duda) la IA responde de
        forma natural con los hechos que ya armaron las reglas y las herramientas. Solo en el
        dispositivo con puente y si el ESP está activo; si no llega o inventa algo, queda el
        texto de las reglas."""
        Via = PreguntaAgente.Via
        conversacion = (
            bool(fuera)
            or agente.es_comentario(mensaje)
            or agente.es_observacion(mensaje)
            or agente.reporta_falla(mensaje)
            or (extra.get("datos") or {}).get("duda")
        )
        if (
            not conversacion
            or "grafica" in r
            or "comparativa" in r
            or "reporte" in r
            or not puente.con_puente(dispositivo)
            or not puente.activo(dispositivo)
        ):
            return r, via, extra
        historial = [
            (p.pregunta, p.respuesta)
            for p in PreguntaAgente.objects.filter(
                usuario=self.request.user, dispositivo=dispositivo
            ).order_by("-num")[:2]
        ][::-1]
        texto, tokens = puente.conversar(dispositivo, mensaje, r["texto"], historial)
        suma = {k: extra.get(k, 0) + tokens.get(k, 0) for k in ("tokens_entrada", "tokens_salida")}
        if not texto:
            return r, via, {**extra, **suma}
        datos = {**extra.get("datos", {}), "contexto": True, "hechos": r["texto"]}
        return {**r, "texto": texto}, Via.IA, {**extra, **suma, "datos": datos}

    def _ultima_concreta(self, usuario, dispositivo):
        """La última pregunta reciente con tema (variable, alertas, conexión…) del usuario."""
        recientes = PreguntaAgente.objects.filter(
            usuario=usuario,
            dispositivo=dispositivo,
            fecha__gte=timezone.now() - self.VENTANA_REPETIDA,
        ).order_by("-fecha", "-num")[:6]
        for p in recientes:
            if not (p.datos or {}).get("precarga") and agente._tema(p.pregunta) is not None:
                return p.pregunta
        return None

    def _propuesta(self, usuario, dispositivo):
        """Lo que el agente ofreció en su última respuesta («¿Quieres …?»), si sigue vigente."""
        recientes = PreguntaAgente.objects.filter(
            usuario=usuario,
            dispositivo=dispositivo,
            fecha__gte=timezone.now() - self.VENTANA_REPETIDA,
        ).order_by("-fecha", "-num")[:5]
        # En Python: exclude() en JSON descarta también los registros sin la clave.
        ultimo = next((p for p in recientes if not (p.datos or {}).get("precarga")), None)
        return (ultimo.datos or {}).get("propuesta") if ultimo else None

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

    def _verificado(self, usuario, dispositivo, pregunta):
        """Resuelve y verifica la respuesta contra la petición interpretada. Si no cumple
        (otra variable, otro periodo, sin la gráfica o la medición pedidas), se resuelve de
        nuevo con la pregunta canónica; si tampoco cumple, se pide aclaración en vez de dar un
        dato que no se pidió."""
        Via = PreguntaAgente.Via
        peticion = interprete.interpretar(pregunta)
        r, via, extra = self._resolver(usuario, dispositivo, pregunta)
        datos = {**extra.get("datos", {}), "peticion": peticion.como_dict()}
        if r.get("propuesta"):
            # La respuesta ofrece algo («¿Quieres que te la muestre?»): un «sí» lo hace.
            datos["propuesta"] = r.pop("propuesta")
        problemas = [] if via == Via.NO_ENTENDIDA else interprete.verificar(peticion, r)
        if problemas:
            r2, via2, extra2 = self._resolver(
                usuario, dispositivo, peticion.canonica(), ruteada=True
            )
            if not interprete.verificar(peticion, r2):
                r, via, extra = r2, via2, extra2
                datos = {**extra2.get("datos", {}), "peticion": peticion.como_dict()}
            else:
                r, via, extra = interprete.aclarar(peticion, problemas), Via.NO_ENTENDIDA, {}
                datos["propuesta"] = peticion.canonica()
            datos["verificacion"] = problemas
        return r, via, {**extra, "datos": datos}

    def _resolver(self, usuario, dispositivo, pregunta, ruteada=False):
        """Respuesta, cómo se resolvió y datos para el registro. En orden: consultas del
        catálogo (umbrales, reportes generados, estado), comparativa, gráfica, reporte,
        respuesta aprendida, IA (solo para explicar, opinar o recomendar) y predefinida."""
        Via = PreguntaAgente.Via
        intencion = interprete.interpretar(pregunta).intencion
        if intencion == "umbrales":
            variables = [t] if (t := agente._tema(pregunta)) in agente.ORDEN_VARIABLES else []
            r = herramientas.umbrales(dispositivo, variables, pregunta)
            return r, Via.PREDEFINIDA, {"datos": {"contexto": True}}
        if intencion == "areas":
            return (
                herramientas.areas(usuario, dispositivo),
                Via.PREDEFINIDA,
                {"datos": {"contexto": True}},
            )
        if intencion == "reportes":
            return herramientas.reportes(dispositivo), Via.PREDEFINIDA, {}
        if intencion == "conexion":
            return herramientas.conexion(dispositivo, pregunta), Via.PREDEFINIDA, {}
        if intencion == "ultima" and agente.es_observacion(pregunta):
            # «Aquí hace mucho calor»: se contrasta con lo que marcan los sensores ahora.
            texto = agente.ultima_medicion(dispositivo, [agente._tema(pregunta)])
            if texto:
                r = {"texto": "Lo reviso con los sensores. " + texto}
                return r, Via.PREDEFINIDA, {"datos": {"contexto": True}}
        # Comparativas y gráficas sueltas van antes que el reporte: «solo la gráfica del reporte»
        # o «compara el reporte de esta semana» no generan un reporte completo.
        if graficas.pide_comparativa(pregunta):
            return graficas.comparativa(usuario, dispositivo, pregunta), Via.PREDEFINIDA, {}
        if graficas.pide_grafica(pregunta):
            return graficas.grafica(usuario, dispositivo, pregunta), Via.PREDEFINIDA, {}
        if agente.pide_reporte(pregunta):
            return agente.generar_reporte(usuario, dispositivo, pregunta), Via.PREDEFINIDA, {}
        tema = agente._tema(pregunta)
        if tema is None and not agente.pide_ultima(pregunta):
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
        if (
            agente.es_cortesia(pregunta)
            or agente.es_comentario(pregunta)
            or agente.es_afirmacion(pregunta)
            or agente.es_negacion(pregunta)
        ):
            # Saludos, agradecimientos y comentarios no se mandan a la IA.
            return no_entendida, Via.PREDEFINIDA, {"datos": {"contexto": True}}
        if ruteada:
            return no_entendida, Via.NO_ENTENDIDA, {}
        aprendida = aprendizaje.ruta_aprendida(dispositivo, pregunta)
        if aprendida is not None:
            r, _, _ = self._resolver(usuario, dispositivo, aprendida.plantilla, ruteada=True)
            return r, Via.BANCO, {"aprendida": aprendida, "datos": {"ruta": aprendida.plantilla}}
        if not puente.del_dominio(pregunta):
            return no_entendida, Via.NO_ENTENDIDA, {}
        if not puente.con_puente(dispositivo):
            return agente.duda(dispositivo, pregunta), Via.NO_ENTENDIDA, {"datos": {"duda": True}}
        canonica, tokens = puente.enrutar(dispositivo, pregunta)
        if not canonica or agente.pide_futuro(canonica):
            return (
                agente.duda(dispositivo, pregunta),
                Via.NO_ENTENDIDA,
                {
                    "datos": {"duda": True},
                    **tokens,
                },
            )
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
