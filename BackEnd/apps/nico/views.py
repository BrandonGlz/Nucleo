"""API de la consola de Nico AI (nicoai.bynucleo.com). Solo para el superusuario (el
administrador de plataforma): chat con cualquier dispositivo, banco de respuestas, registro de
preguntas, herramientas y documentos del agente."""

from django.db.models import Count, Q
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
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

from . import configuracion
from .models import AjusteHerramienta, DocumentoNico


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
            "todas",
        ]
        read_only_fields = ["num", "votos_si", "votos_no", "fecha_creacion"]
        extra_kwargs = {"organizacion": {"required": False}, "tema": {"required": False}}
        validators = []  # la unicidad se revisa abajo con la pregunta normalizada

    def get_usos(self, r):
        return getattr(r, "num_usos", 0)

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
    proposito = serializers.CharField(required=False, allow_blank=True)
    ejemplo = serializers.CharField(required=False, allow_blank=True, max_length=200)
    activa = serializers.BooleanField(required=False)
    restaurar = serializers.BooleanField(required=False, default=False)


class HerramientasView(APIView):
    permission_classes = [EsSuperusuario]

    def get(self, request):
        return Response(configuracion.catalogo())


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
        return Response(next(h for h in configuracion.catalogo() if h["nombre"] == nombre))


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
        return d.clave in dict(configuracion.DOCUMENTOS_BASE)

    def get_actualizado_por_nombre(self, d):
        return d.actualizado_por.get_full_name() if d.actualizado_por else None

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
    permission_classes = [EsSuperusuario]
    serializer_class = DocumentoSerializer
    pagination_class = None
    queryset = DocumentoNico.objects.select_related("actualizado_por")

    def list(self, request, *args, **kwargs):
        configuracion.asegurar_documentos()
        respuesta = super().list(request, *args, **kwargs)
        respuesta.data = {
            "documentos": respuesta.data,
            "limite": configuracion.LIMITE_CARACTERES,
            "usados": len(configuracion.documentos_activos()),
        }
        return respuesta

    def perform_create(self, serializer):
        serializer.save(actualizado_por=self.request.user)
        configuracion.limpiar_cache()

    def perform_update(self, serializer):
        serializer.save(actualizado_por=self.request.user)
        configuracion.limpiar_cache()

    def perform_destroy(self, instancia):
        if instancia.clave in dict(configuracion.DOCUMENTOS_BASE):
            raise ValidationError(
                {"detail": "Los documentos base no se borran; vacíalos o desactívalos."}
            )
        instancia.delete()
        configuracion.limpiar_cache()


class ResumenView(APIView):
    """Cifras para el inicio de la consola."""

    permission_classes = [EsSuperusuario]

    def get(self, request):
        preguntas = PreguntaAgente.objects.exclude(datos__contains={"precarga": True})
        Via = PreguntaAgente.Via
        return Response(
            {
                "preguntas": preguntas.count(),
                "no_entendidas": preguntas.filter(via=Via.NO_ENTENDIDA).count(),
                "negativas": preguntas.filter(calificacion=-1).count(),
                "positivas": preguntas.filter(calificacion=1).count(),
                "banco": RespuestaAprendida.objects.filter(activa=True).count(),
                "herramientas_inactivas": len(configuracion.inactivas()),
                "documentos_activos": DocumentoNico.objects.filter(activo=True)
                .exclude(contenido="")
                .count(),
            },
            status=status.HTTP_200_OK,
        )
