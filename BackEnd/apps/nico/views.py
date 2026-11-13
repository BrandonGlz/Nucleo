"""API de la consola de Nico AI (nicoai.bynucleo.com). Solo para el superusuario (el
administrador de plataforma): chat con cualquier dispositivo, banco de respuestas, registro de
preguntas, herramientas y documentos del agente."""

from django.db.models import Avg, Count, Max, Q
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, NotFound, ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dispositivos.models import Dispositivo
from apps.organizaciones.models import Organizacion
from apps.reportes import aprendizaje, puente
from apps.reportes.models import PreguntaAgente, RespuestaAprendida
from apps.reportes.views import AgenteView, CalificarAgenteView
from apps.usuarios.models import Usuario
from common import roles

from . import configuracion, conocimiento, generador, sugerencias
from .models import AjusteHerramienta, AjusteSugerencias, DocumentoNico


class EsSuperusuario(BasePermission):
    message = "La consola de Nico AI es solo para el superusuario."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_superuser)


def como_admin_de(usuario, dispositivo):
    """El superusuario, en memoria, como administrador de la organización del dispositivo: así el
    agente consulta con el alcance de esa organización. No se guarda nunca; las preguntas quedan
    registradas a nombre del superusuario."""
    copia = Usuario(
        **{f.attname: getattr(usuario, f.attname) for f in Usuario._meta.concrete_fields}
    )
    copia.organizacion_id = dispositivo.area.organizacion_id
    copia.area_id = None
    copia.rol_id = roles.ADMIN
    copia.acceso_agente = True
    copia._state.adding = False
    copia._state.db = usuario._state.db
    copia.save = copia.delete = _no_guardar
    return copia


def _no_guardar(*args, **kwargs):
    raise RuntimeError("El usuario de la consola no se guarda.")


# ── Chat ────────────────────────────────────────────────────────────────────────────────────


class ConsolaAgenteView(AgenteView):
    """El mismo agente de la web, con cualquier dispositivo de cualquier organización."""

    permission_classes = [EsSuperusuario]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        num = request.data.get("dispositivo") if hasattr(request, "data") else None
        dispositivo = (
            Dispositivo.objects.select_related("area").filter(pk=num).first()
            if str(num or "").isdigit()
            else None
        )
        if dispositivo is not None:
            request.user = como_admin_de(request.user, dispositivo)


class ConsolaCalificarView(CalificarAgenteView):
    permission_classes = [EsSuperusuario]


class ConsolaEstadoView(APIView):
    """Qué agentes están activos, de todas las empresas (mismo formato que ``agente/estado``)."""

    permission_classes = [EsSuperusuario]

    def get(self, request):
        todos = list(
            Dispositivo.objects.select_related("area").exclude(
                estado_dispositivo_id=roles.DISPOSITIVO_BAJA
            )
        )
        activos = [d for d in todos if puente.activo(d)]
        for d in activos:
            if puente.con_puente(d):
                puente.calentar(d)
                break
        return Response(
            {
                "puente": puente.habilitado(),
                "activos": [d.num for d in activos],
                "fisicos": [d.num for d in todos if puente.con_puente(d)],
            }
        )


class ArbolView(APIView):
    """Empresas → áreas → dispositivos, con qué agentes están activos (su ESP conectado)."""

    permission_classes = [EsSuperusuario]

    def get(self, request):
        dispositivos = Dispositivo.objects.select_related("area__organizacion").exclude(
            estado_dispositivo_id=roles.DISPOSITIVO_BAJA
        )
        empresas = {}
        for d in dispositivos.order_by("area__organizacion__nombre", "area__nombre", "nombre"):
            org = d.area.organizacion
            e = empresas.setdefault(
                org.num, {"num": org.num, "nombre": org.nombre, "estado": org.estado, "areas": {}}
            )
            a = e["areas"].setdefault(
                d.area_id, {"num": d.area_id, "nombre": d.area.nombre, "dispositivos": []}
            )
            a["dispositivos"].append(
                {
                    "num": d.num,
                    "nombre": d.nombre,
                    "codigo_mqtt": d.codigo_mqtt,
                    "activo": puente.activo(d),
                    "fisico": puente.con_puente(d),
                }
            )
        datos = [{**e, "areas": list(e["areas"].values())} for e in empresas.values()]
        return Response({"puente": puente.habilitado(), "empresas": datos})


# ── Banco de preguntas y respuestas ────────────────────────────────────────────────────────

TEMAS = {
    "FIJA": "Respuesta fija",
    "RUTA": "Ruta a una herramienta",
    "TEMP": "Temperatura (aprendida)",
    "HUM": "Humedad (aprendida)",
    "AIRE": "Calidad del aire (aprendida)",
}


class RespuestaSerializer(serializers.ModelSerializer):
    organizacion_nombre = serializers.CharField(source="organizacion.nombre", read_only=True)
    usos = serializers.SerializerMethodField()
    reemplaza = serializers.SerializerMethodField()
    # Crear la misma respuesta en todas las empresas.
    todas = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = RespuestaAprendida
        fields = [
            "num",
            "organizacion",
            "organizacion_nombre",
            "pregunta",
            "tema",
            "plantilla",
            "votos_si",
            "votos_no",
            "activa",
            "fecha_creacion",
            "usos",
            "reemplaza",
            "todas",
        ]
        read_only_fields = ["num", "votos_si", "votos_no", "fecha_creacion"]
        extra_kwargs = {"organizacion": {"required": False}, "tema": {"required": False}}
        validators = []  # la unicidad se revisa abajo con la pregunta normalizada

    def get_usos(self, r):
        return getattr(r, "num_usos", 0)

    def get_reemplaza(self, r):
        """Pregunta incluida en Nico que esta respuesta fija reemplaza (o None)."""
        if r.tema != "FIJA":
            return None
        incluidas = self.context.setdefault(
            "_incluidas",
            {
                aprendizaje.normalizar(x["pregunta"]): x["pregunta"]
                for x in conocimiento.incluidas()
                if x["tipo"] != "consulta"
            },
        )
        return incluidas.get(r.pregunta_normalizada)

    def validate(self, datos):
        pregunta = datos.get("pregunta", getattr(self.instance, "pregunta", ""))
        normalizada = aprendizaje.normalizar(pregunta)
        if not normalizada:
            raise ValidationError({"pregunta": "Escribe la pregunta."})
        if not (datos.get("plantilla", getattr(self.instance, "plantilla", "")) or "").strip():
            raise ValidationError({"plantilla": "Escribe la respuesta."})
        datos["pregunta_normalizada"] = normalizada
        if self.instance is None:
            datos.setdefault("tema", "FIJA")
            if not datos.get("todas") and not datos.get("organizacion"):
                raise ValidationError({"organizacion": "Elige la empresa (o «todas»)."})
        tema = datos.get("tema", getattr(self.instance, "tema", ""))
        if tema and tema not in TEMAS:
            raise ValidationError({"tema": "Tema no válido."})
        cambia_pregunta = self.instance is None or "pregunta" in datos
        if tema == "FIJA" and cambia_pregunta and (motivo := conocimiento.pide_datos(pregunta)):
            raise ValidationError({"pregunta": motivo})
        if not datos.get("todas"):
            org = datos.get("organizacion") or getattr(self.instance, "organizacion", None)
            repetida = RespuestaAprendida.objects.filter(
                organizacion=org, pregunta_normalizada=normalizada, tema=tema
            )
            if self.instance is not None:
                repetida = repetida.exclude(pk=self.instance.pk)
            if repetida.exists():
                raise ValidationError(
                    {"pregunta": "Esa pregunta ya tiene una respuesta de este tipo en la empresa."}
                )
        return datos

    def create(self, datos):
        if not datos.pop("todas", False):
            return super().create(datos)
        datos.pop("organizacion", None)
        ultima = None
        for org in Organizacion.objects.all():
            ultima, _ = RespuestaAprendida.objects.update_or_create(
                organizacion=org,
                pregunta_normalizada=datos["pregunta_normalizada"],
                tema=datos["tema"],
                defaults={k: v for k, v in datos.items() if k != "pregunta_normalizada"},
            )
        if ultima is None:
            raise ValidationError({"organizacion": "No hay empresas."})
        return ultima

    def update(self, instancia, datos):
        datos.pop("todas", None)
        return super().update(instancia, datos)


class BancoViewSet(viewsets.ModelViewSet):
    permission_classes = [EsSuperusuario]
    serializer_class = RespuestaSerializer

    # Un cambio en el banco cambia también las sugerencias del chat.
    def perform_create(self, serializer):
        serializer.save()
        sugerencias.limpiar_cache()

    def perform_update(self, serializer):
        serializer.save()
        sugerencias.limpiar_cache()

    def perform_destroy(self, instancia):
        instancia.delete()
        sugerencias.limpiar_cache()

    def get_queryset(self):
        qs = RespuestaAprendida.objects.select_related("organizacion")
        qs = qs.annotate(num_usos=Count("usos"))
        p = self.request.query_params
        if p.get("organizacion"):
            qs = qs.filter(organizacion_id=p["organizacion"])
        if p.get("tema"):
            qs = qs.filter(tema=p["tema"])
        if p.get("activa") in ("true", "false"):
            qs = qs.filter(activa=p["activa"] == "true")
        if p.get("q"):
            qs = qs.filter(Q(pregunta__icontains=p["q"]) | Q(plantilla__icontains=p["q"]))
        return qs.order_by("-num")

    @action(detail=False)
    def temas(self, request):
        return Response([{"value": k, "label": v} for k, v in TEMAS.items()])


# ── Registro de preguntas ─────────────────────────────────────────────────────────────────


class RegistroSerializer(serializers.ModelSerializer):
    dispositivo_nombre = serializers.CharField(source="dispositivo.nombre", read_only=True)
    area_nombre = serializers.CharField(source="dispositivo.area.nombre", read_only=True)
    organizacion = serializers.IntegerField(
        source="dispositivo.area.organizacion_id", read_only=True
    )
    organizacion_nombre = serializers.CharField(
        source="dispositivo.area.organizacion.nombre", read_only=True
    )
    usuario_nombre = serializers.SerializerMethodField()

    class Meta:
        model = PreguntaAgente
        fields = [
            "num",
            "pregunta",
            "respuesta",
            "via",
            "tema",
            "calificacion",
            "milisegundos",
            "tokens_entrada",
            "tokens_salida",
            "fecha",
            "dispositivo",
            "dispositivo_nombre",
            "area_nombre",
            "organizacion",
            "organizacion_nombre",
            "usuario_nombre",
            "aprendida",
        ]

    def get_usuario_nombre(self, r):
        return r.usuario.get_full_name()


class RegistroViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [EsSuperusuario]
    serializer_class = RegistroSerializer

    def get_queryset(self):
        qs = PreguntaAgente.objects.select_related(
            "dispositivo__area__organizacion", "usuario"
        ).exclude(datos__contains={"precarga": True})
        p = self.request.query_params
        if p.get("organizacion"):
            qs = qs.filter(dispositivo__area__organizacion_id=p["organizacion"])
        if p.get("via"):
            qs = qs.filter(via=p["via"])
        filtro = p.get("calificacion")
        if filtro == "si":
            qs = qs.filter(calificacion=1)
        elif filtro == "no":
            qs = qs.filter(calificacion=-1)
        if p.get("q"):
            qs = qs.filter(Q(pregunta__icontains=p["q"]) | Q(respuesta__icontains=p["q"]))
        return qs.order_by("-num")


# ── Herramientas y propósitos ──────────────────────────────────────────────────────────────


class AjusteSerializer(serializers.Serializer):
    descripcion = serializers.CharField(required=False, allow_blank=True)
    proposito = serializers.ChoiceField(
        choices=[*configuracion.CLAVES_PROPOSITO, ""], required=False, allow_blank=True
    )
    ejemplo = serializers.CharField(required=False, allow_blank=True, max_length=200)
    activa = serializers.BooleanField(required=False)
    restaurar = serializers.BooleanField(required=False, default=False)


class HerramientasView(APIView):
    permission_classes = [EsSuperusuario]

    def get(self, request):
        return Response(
            {
                "herramientas": configuracion.catalogo(),
                "propositos": [{"clave": c, "nombre": n} for c, n in configuracion.PROPOSITOS],
            }
        )


class HerramientaView(APIView):
    permission_classes = [EsSuperusuario]

    def patch(self, request, nombre):
        if nombre not in configuracion.nombres():
            return Response({"detail": "Esa herramienta no existe."}, status=404)
        entrada = AjusteSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        ajuste, _ = AjusteHerramienta.objects.get_or_create(nombre=nombre)
        if datos.pop("restaurar", False):
            ajuste.descripcion = ajuste.proposito = ajuste.ejemplo = ""
        for campo, valor in datos.items():
            setattr(ajuste, campo, valor.strip() if isinstance(valor, str) else valor)
        ajuste.actualizado_por = request.user
        ajuste.save()
        configuracion.limpiar_cache()
        sugerencias.limpiar_cache()
        return Response(next(h for h in configuracion.catalogo() if h["nombre"] == nombre))


# ── Sugerencias del chat ───────────────────────────────────────────────────────────────────


def _dispositivo(num):
    num = str(num or "")
    return (
        Dispositivo.objects.select_related("area").filter(pk=num).first() if num.isdigit() else None
    )


class ConsolaSugerenciasView(APIView):
    """Las sugerencias del chat de la consola (como administrador de la empresa del
    dispositivo, igual que el chat)."""

    permission_classes = [EsSuperusuario]

    def get(self, request):
        dispositivo = _dispositivo(request.query_params.get("dispositivo"))
        if dispositivo is None:
            raise NotFound("Dispositivo no encontrado.")
        return Response(sugerencias.para(como_admin_de(request.user, dispositivo), dispositivo))


class AjusteSugerenciasSerializer(serializers.ModelSerializer):
    class Meta:
        model = AjusteSugerencias
        fields = [
            "activas",
            "maximo",
            "usar_banco",
            "usar_incluidas",
            "usar_herramientas",
            "usar_frecuentes",
            "fijadas",
            "ocultas",
            "actualizado",
        ]
        read_only_fields = ["actualizado"]

    def validate_maximo(self, valor):
        if not 3 <= valor <= 10:
            raise ValidationError("Entre 3 y 10.")
        return valor

    def _textos(self, valor, normalizar):
        if not isinstance(valor, list) or len(valor) > 200:
            raise ValidationError("Debe ser una lista (máximo 200).")
        limpios, vistos = [], set()
        for t in valor:
            t = " ".join(str(t).split())[:200]
            clave = aprendizaje.normalizar(t)
            if clave and clave not in vistos:
                vistos.add(clave)
                limpios.append(clave if normalizar else t)
        return limpios

    def validate_fijadas(self, valor):
        return self._textos(valor, normalizar=False)

    def validate_ocultas(self, valor):
        return self._textos(valor, normalizar=True)


class AjusteSugerenciasView(APIView):
    """GET: el ajuste y, con ?dispositivo=, todas las candidatas de su chat (con las ocultas
    marcadas) para revisarlas. PATCH: cambia el ajuste."""

    permission_classes = [EsSuperusuario]

    def get(self, request):
        ajuste = AjusteSugerencias.actual()
        datos = {"ajuste": AjusteSugerenciasSerializer(ajuste).data, "candidatas": []}
        dispositivo = _dispositivo(request.query_params.get("dispositivo"))
        if dispositivo is not None:
            usuario = como_admin_de(request.user, dispositivo)
            todas = AjusteSugerencias(
                **{
                    **{
                        f: True
                        for f in (
                            "usar_banco",
                            "usar_incluidas",
                            "usar_herramientas",
                            "usar_frecuentes",
                        )
                    },
                    "fijadas": ajuste.fijadas,
                }
            )
            ocultas, vistas = set(ajuste.ocultas), set()
            for texto, tipo in sugerencias.candidatas(
                usuario, dispositivo.area.organizacion_id, todas
            ):
                clave = aprendizaje.normalizar(texto)
                if clave and clave not in vistas:
                    vistas.add(clave)
                    datos["candidatas"].append(
                        {
                            "texto": texto,
                            "tipo": tipo,
                            "etiqueta": sugerencias.TIPOS[tipo],
                            "clave": clave,
                            "oculta": clave in ocultas,
                        }
                    )
        return Response(datos)

    def patch(self, request):
        ajuste = AjusteSugerencias.actual()
        entrada = AjusteSugerenciasSerializer(ajuste, data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        entrada.save(actualizado_por=request.user)
        sugerencias.limpiar_cache()
        return Response(entrada.data)


# ── Documentos del agente (SOUL, IDENTITY…) ────────────────────────────────────────────────


class DocumentoSerializer(serializers.ModelSerializer):
    base = serializers.SerializerMethodField()
    actualizado_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = DocumentoNico
        fields = [
            "num",
            "clave",
            "descripcion",
            "contenido",
            "activo",
            "orden",
            "actualizado",
            "actualizado_por_nombre",
            "base",
        ]
        read_only_fields = ["num", "actualizado"]

    def get_base(self, d):
        return d.clave == configuracion.DOCUMENTO

    def get_actualizado_por_nombre(self, d):
        return d.actualizado_por.get_full_name() if d.actualizado_por else None

    def validate_contenido(self, valor):
        """El documento se guarda siempre con sus secciones base («## Título»): sin ellas la
        consola no podría dividirlo ni convertir sus secciones en respuestas."""
        titulos = [t.lower() for t, _ in configuracion.secciones(valor)]
        if not titulos:
            raise ValidationError("El documento necesita al menos una sección «## Título».")
        faltan = [t for _, t, _ in configuracion.SECCIONES if t.lower() not in titulos]
        if faltan:
            raise ValidationError(f"Faltan secciones base: {', '.join(faltan)}.")
        if len(titulos) != len(set(titulos)):
            raise ValidationError("Hay dos secciones con el mismo título.")
        return valor

    def validate_clave(self, valor):
        clave = valor.strip().upper().removesuffix(".MD").replace(" ", "_")
        if not clave.replace("_", "").replace("-", "").isalnum():
            raise ValidationError("Usa solo letras, números, guiones y guiones bajos.")
        if (
            self.instance is not None
            and self.instance.clave != clave
            and self.get_base(self.instance)
        ):
            raise ValidationError("Los documentos base no se renombran.")
        return clave


class DocumentoViewSet(viewsets.ModelViewSet):
    """Un único documento del agente (``NICO.md``), dividido en secciones: no se crean ni se
    borran documentos, solo se edita ese."""

    permission_classes = [EsSuperusuario]
    http_method_names = ["get", "post", "patch", "head", "options"]
    serializer_class = DocumentoSerializer
    pagination_class = None
    queryset = DocumentoNico.objects.select_related("actualizado_por")

    def list(self, request, *args, **kwargs):
        configuracion.asegurar_documentos()
        respuesta = super().list(request, *args, **kwargs)
        respuesta.data = {
            "documentos": respuesta.data,
            "secciones": [
                {"titulo": titulo, "descripcion": descripcion}
                for _, titulo, descripcion in configuracion.SECCIONES
            ],
            "limite": configuracion.LIMITE_CARACTERES,
            "usados": len(configuracion.documentos_activos()),
        }
        return respuesta

    @action(detail=True, methods=["get", "post"])
    def generar(self, request, pk=None):
        """POST {seccion}: la IA lee esa sección una vez y propone respuestas para el banco (en
        segundo plano). GET ?seccion=: cómo va {estado: sin_generar|generando|listo|error,
        propuestas, error}."""
        documento = self.get_object()
        if request.method == "POST":
            return Response(generador.iniciar(documento, request.data.get("seccion") or ""))
        return Response(generador.estado(documento.num, request.query_params.get("seccion") or ""))

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed("POST", "Hay un solo documento: agrega una sección dentro de él.")

    def _aplicar(self):
        # Instrucciones nuevas: la caché de Ollama se recalienta en segundo plano para que la
        # siguiente pregunta no las procese en frío.
        configuracion.limpiar_cache()
        puente.recalentar()

    def perform_update(self, serializer):
        serializer.save(actualizado_por=self.request.user)
        self._aplicar()


class IncluidasView(APIView):
    """Respuestas que Nico ya trae en su código: explicaciones fijas, charla, capacidades por rol
    y consultas con datos. Se muestran en el banco y se pueden reemplazar con una respuesta
    fija. ``{dispositivo}`` y ``{área}`` se rellenan con el dispositivo de cada chat."""

    permission_classes = [EsSuperusuario]

    def get(self, request):
        fijas = frozenset(
            RespuestaAprendida.objects.filter(tema="FIJA").values_list(
                "pregunta_normalizada", flat=True
            )
        )
        return Response(conocimiento.incluidas(fijas))


class ResumenView(APIView):
    """Cifras para el inicio de la consola."""

    permission_classes = [EsSuperusuario]

    def get(self, request):
        from datetime import timedelta

        from django.db.models.functions import ExtractHour, TruncDate
        from django.utils import timezone

        preguntas = PreguntaAgente.objects.exclude(datos__contains={"precarga": True})
        Via = PreguntaAgente.Via
        hoy = timezone.localdate()
        desde = hoy - timedelta(days=13)
        dias = dict(
            preguntas.filter(fecha__date__gte=desde)
            .annotate(dia=TruncDate("fecha"))
            .values_list("dia")
            .annotate(n=Count("num"))
        )
        horas = dict(
            preguntas.annotate(h=ExtractHour("fecha")).values_list("h").annotate(n=Count("num"))
        )
        por_via = dict(preguntas.values_list("via").annotate(n=Count("num")))
        tiempos = dict(preguntas.values_list("via").annotate(ms=Avg("milisegundos")))
        por_empresa = (
            preguntas.values("dispositivo__area__organizacion__nombre")
            .annotate(n=Count("num"))
            .order_by("-n")[:6]
        )
        no_entendidas = (
            preguntas.filter(via=Via.NO_ENTENDIDA)
            .values("pregunta_normalizada")
            .annotate(n=Count("num"), ejemplo=Max("pregunta"))
            .order_by("-n")[:6]
        )
        return Response(
            {
                "preguntas": preguntas.count(),
                "no_entendidas": por_via.get(Via.NO_ENTENDIDA, 0),
                "negativas": preguntas.filter(calificacion=-1).count(),
                "positivas": preguntas.filter(calificacion=1).count(),
                "banco": RespuestaAprendida.objects.filter(activa=True).count(),
                "herramientas_inactivas": len(configuracion.inactivas()),
                "documentos_activos": DocumentoNico.objects.filter(activo=True)
                .exclude(contenido="")
                .count(),
                "por_dia": [
                    {
                        "fecha": (desde + timedelta(days=i)).isoformat(),
                        "total": dias.get(desde + timedelta(days=i), 0),
                    }
                    for i in range(14)
                ],
                "por_hora": [{"hora": h, "total": horas.get(h, 0)} for h in range(24)],
                "por_via": [{"via": v, "total": por_via.get(v, 0)} for v in Via.values],
                # Tiempo promedio de respuesta (segundos) por cómo se resolvió.
                "tiempo_por_via": [
                    {"via": v, "segundos": round(tiempos[v] / 1000, 1)}
                    for v in Via.values
                    if tiempos.get(v) is not None
                ],
                "por_empresa": [
                    {"empresa": e["dispositivo__area__organizacion__nombre"], "total": e["n"]}
                    for e in por_empresa
                ],
                "no_entendidas_frecuentes": [
                    {"pregunta": e["ejemplo"], "total": e["n"]} for e in no_entendidas
                ],
            },
            status=status.HTTP_200_OK,
        )
