"""API de la consola de administración (admin.bynucleo.com). Solo para el superusuario (el
administrador de plataforma), con alcance sobre todas las organizaciones: resumen y alertas de
seguridad, usuarios y roles, sesiones abiertas, equipos ESP32, firmware y política de seguridad.
Contrato en ``Context/api/contrato-api.md``."""

from collections import Counter, defaultdict
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from apps.dispositivos import firmware
from apps.dispositivos.models import Dispositivo
from apps.organizaciones.models import Area, Organizacion
from apps.usuarios.models import SegundoFactor, Sesion, Usuario
from apps.usuarios.seguridad import enlace_recuperacion
from common import roles
from common.autenticacion import cerrar_sesiones

from .models import PoliticaSeguridad
from .politicas import olvidar, politica

Accion = RegistroAuditoria.Accion
ROLES_ORGANIZACION = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA, roles.OPERADOR)
ESTADOS_EN_LINEA = (
    roles.DISPOSITIVO_EN_LINEA,
    roles.DISPOSITIVO_CALENTANDO,
    roles.DISPOSITIVO_BATERIA_BAJA,
)


class EsSuperusuario(BasePermission):
    message = "La consola de administración es solo para el administrador de plataforma."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_superuser)


class ConsolaMixin:
    permission_classes = [EsSuperusuario]


def _org(o):
    return {"num": o.num, "nombre": o.nombre} if o else None


def _entero(valor):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


# ── Resumen y alertas de seguridad ──────────────────────────────────────────────────────────


def _alertas_seguridad(ahora):
    alertas = []
    hace_24h = ahora - timedelta(hours=24)
    fallidos = RegistroAuditoria.objects.filter(
        accion=Accion.LOGIN_FALLIDO, fecha_hora__gte=hace_24h
    )

    for fila in (
        fallidos.exclude(ip=None)
        .values("ip")
        .annotate(n=Count("num"))
        .filter(n__gte=5)
        .order_by("-n")[:10]
    ):
        ultimo = fallidos.filter(ip=fila["ip"]).order_by("-fecha_hora").first()
        alertas.append(
            {
                "tipo": "ip_fallidos",
                "nivel": "critico" if fila["n"] >= 10 else "advertencia",
                "titulo": f"{fila['n']} intentos fallidos desde una misma IP",
                "detalle": "En las últimas 24 horas. Puede ser un intento de adivinar contraseñas.",
                "fecha": ultimo.fecha_hora if ultimo else None,
                "usuario": None,
                "ip": fila["ip"],
            }
        )

    for fila in (
        fallidos.exclude(usuario=None)
        .values("usuario")
        .annotate(n=Count("num"))
        .filter(n__gte=3)
        .order_by("-n")[:10]
    ):
        u = Usuario.objects.filter(pk=fila["usuario"]).first()
        if u is None:
            continue
        ultimo = fallidos.filter(usuario=u).order_by("-fecha_hora").first()
        alertas.append(
            {
                "tipo": "cuenta_fallidos",
                "nivel": "critico" if fila["n"] >= 10 else "advertencia",
                "titulo": f"{fila['n']} intentos fallidos en la cuenta de {u.get_full_name()}",
                "detalle": "En las últimas 24 horas.",
                "fecha": ultimo.fecha_hora if ultimo else None,
                "usuario": {"num": u.num, "nombre": u.get_full_name(), "correo": u.correo},
                "ip": ultimo.ip if ultimo else None,
            }
        )

    # Accesos desde una IP que la persona no había usado en los 30 días anteriores.
    hace_7d = ahora - timedelta(days=7)
    vistas = set()
    for r in (
        RegistroAuditoria.objects.filter(accion=Accion.LOGIN, fecha_hora__gte=hace_7d)
        .exclude(ip=None)
        .exclude(usuario=None)
        .select_related("usuario")
        .order_by("-fecha_hora")
    ):
        clave = (r.usuario_id, r.ip)
        if clave in vistas:
            continue
        vistas.add(clave)
        conocida = RegistroAuditoria.objects.filter(
            accion=Accion.LOGIN,
            usuario_id=r.usuario_id,
            ip=r.ip,
            fecha_hora__lt=r.fecha_hora,
            fecha_hora__gte=r.fecha_hora - timedelta(days=30),
        ).exists()
        tiene_historial = RegistroAuditoria.objects.filter(
            accion=Accion.LOGIN, usuario_id=r.usuario_id, fecha_hora__lt=r.fecha_hora
        ).exists()
        if conocida or not tiene_historial:
            continue
        u = r.usuario
        alertas.append(
            {
                "tipo": "ip_nueva",
                "nivel": "advertencia",
                "titulo": f"{u.get_full_name()} entró desde una IP nueva",
                "detalle": "No había usado esa dirección en los 30 días anteriores.",
                "fecha": r.fecha_hora,
                "usuario": {"num": u.num, "nombre": u.get_full_name(), "correo": u.correo},
                "ip": r.ip,
            }
        )
        if sum(a["tipo"] == "ip_nueva" for a in alertas) >= 15:
            break

    exigidos = politica().roles_2fa_obligatorio
    if exigidos:
        sin_2fa = (
            Usuario.objects.filter(rol_id__in=exigidos, estado_usuario_id=roles.USUARIO_ACTIVO)
            .exclude(segundo_factor__activo=True)
            .count()
        )
        if sin_2fa:
            alertas.append(
                {
                    "tipo": "sin_2fa",
                    "nivel": "advertencia",
                    "titulo": f"{sin_2fa} cuentas sin la verificación en dos pasos obligatoria",
                    "detalle": "Se les pedirá configurarla la próxima vez que entren.",
                    "fecha": None,
                    "usuario": None,
                    "ip": None,
                }
            )

    for u in Usuario.objects.filter(estado_usuario_id=roles.USUARIO_BLOQUEADO)[:10]:
        alertas.append(
            {
                "tipo": "cuenta_bloqueada",
                "nivel": "advertencia",
                "titulo": f"Cuenta bloqueada: {u.get_full_name()}",
                "detalle": "No puede entrar hasta que se desbloquee en Usuarios y roles.",
                "fecha": None,
                "usuario": {"num": u.num, "nombre": u.get_full_name(), "correo": u.correo},
                "ip": None,
            }
        )

    orden = {"critico": 0, "advertencia": 1}
    alertas.sort(key=lambda a: (orden[a["nivel"]], -(a["fecha"].timestamp() if a["fecha"] else 0)))
    return alertas


def sesiones_vigentes():
    limite = timezone.now() - timedelta(days=politica().dias_sesion)
    return Sesion.objects.filter(ultimo_uso__gte=limite)


class ResumenView(ConsolaMixin, APIView):
    def get(self, request):
        ahora = timezone.now()
        hoy = timezone.localdate()
        usuarios = Usuario.objects.exclude(rol_id=roles.ADMIN_PLATAFORMA)
        por_estado = Counter(usuarios.values_list("estado_usuario_id", flat=True))
        exigidos = politica().roles_2fa_obligatorio
        dispositivos = Counter(Dispositivo.objects.values_list("estado_dispositivo_id", flat=True))
        accesos = RegistroAuditoria.objects.filter(accion__in=(Accion.LOGIN, Accion.LOGIN_FALLIDO))

        desde = hoy - timedelta(days=13)
        serie = defaultdict(lambda: {"exitosos": 0, "fallidos": 0})
        for fila in (
            accesos.filter(fecha_hora__date__gte=desde)
            .annotate(dia=TruncDate("fecha_hora"))
            .values("dia", "accion")
            .annotate(n=Count("num"))
        ):
            clave = "exitosos" if fila["accion"] == Accion.LOGIN else "fallidos"
            serie[fila["dia"]][clave] = fila["n"]

        return Response(
            {
                "sesiones_activas": sesiones_vigentes().count(),
                "usuarios": {
                    "total": usuarios.count(),
                    "activos": por_estado[roles.USUARIO_ACTIVO],
                    "inactivos": por_estado[roles.USUARIO_INACTIVO],
                    "bloqueados": por_estado[roles.USUARIO_BLOQUEADO],
                    "sin_2fa_obligatorio": (
                        Usuario.objects.filter(
                            rol_id__in=exigidos, estado_usuario_id=roles.USUARIO_ACTIVO
                        )
                        .exclude(segundo_factor__activo=True)
                        .count()
                        if exigidos
                        else 0
                    ),
                },
                "accesos": {
                    "hoy": accesos.filter(accion=Accion.LOGIN, fecha_hora__date=hoy).count(),
                    "fallidos_24h": accesos.filter(
                        accion=Accion.LOGIN_FALLIDO, fecha_hora__gte=ahora - timedelta(hours=24)
                    ).count(),
                    "fallidos_7d": accesos.filter(
                        accion=Accion.LOGIN_FALLIDO, fecha_hora__gte=ahora - timedelta(days=7)
                    ).count(),
                },
                "dispositivos": {
                    "total": sum(dispositivos.values()),
                    "en_linea": sum(dispositivos[e] for e in ESTADOS_EN_LINEA),
                    "sin_conexion": dispositivos[roles.DISPOSITIVO_SIN_CONEXION],
                    "mantenimiento": dispositivos[roles.DISPOSITIVO_MANTENIMIENTO],
                    "baja": dispositivos[roles.DISPOSITIVO_BAJA],
                },
                "alertas": _alertas_seguridad(ahora),
                "serie_accesos": [
                    {
                        "dia": (desde + timedelta(days=i)).isoformat(),
                        **serie[desde + timedelta(days=i)],
                    }
                    for i in range(14)
                ],
            }
        )


class OrganizacionesView(ConsolaMixin, APIView):
    def get(self, request):
        areas = defaultdict(list)
        for a in Area.objects.order_by("nombre"):
            areas[a.organizacion_id].append({"num": a.num, "nombre": a.nombre})
        return Response(
            [
                {"num": o.num, "nombre": o.nombre, "areas": areas[o.num]}
                for o in Organizacion.objects.order_by("nombre")
            ]
        )


# ── Usuarios y roles ────────────────────────────────────────────────────────────────────────


class UsuarioConsolaSerializer(serializers.ModelSerializer):
    organizacion = serializers.PrimaryKeyRelatedField(
        queryset=Organizacion.objects.all(), required=False, allow_null=True
    )
    area = serializers.PrimaryKeyRelatedField(
        queryset=Area.objects.all(), required=False, allow_null=True
    )
    rol = serializers.CharField(source="rol_id")
    estado_usuario = serializers.CharField(source="estado_usuario_id", required=False)
    password = serializers.CharField(write_only=True, required=False)
    nombre_completo = serializers.SerializerMethodField()
    segundo_factor = serializers.SerializerMethodField()
    sesiones = serializers.SerializerMethodField()
    ultimo_acceso = serializers.DateTimeField(source="last_login", read_only=True)

    class Meta:
        model = Usuario
        fields = [
            "num",
            "nombre",
            "primer_apellido",
            "segundo_apellido",
            "nombre_completo",
            "correo",
            "organizacion",
            "area",
            "rol",
            "estado_usuario",
            "segundo_factor",
            "sesiones",
            "ultimo_acceso",
            "fecha_registro",
            "password",
        ]
        read_only_fields = ["num", "fecha_registro"]

    def get_nombre_completo(self, u):
        return u.get_full_name()

    def get_segundo_factor(self, u):
        return bool(getattr(u, "factor_activo", None))

    def get_sesiones(self, u):
        return getattr(u, "n_sesiones", 0)

    def to_representation(self, u):
        datos = super().to_representation(u)
        datos["organizacion"] = _org(u.organizacion)
        datos["area"] = {"num": u.area.num, "nombre": u.area.nombre} if u.area else None
        return datos

    def validate_rol(self, valor):
        if valor not in ROLES_ORGANIZACION:
            raise ValidationError("Rol no válido. El administrador de plataforma no se crea aquí.")
        return valor

    def validate_estado_usuario(self, valor):
        if valor not in (roles.USUARIO_ACTIVO, roles.USUARIO_INACTIVO, roles.USUARIO_BLOQUEADO):
            raise ValidationError("Estado no válido.")
        return valor

    def validate_password(self, valor):
        validate_password(valor)
        return valor

    def validate(self, datos):
        u = self.instance
        if u is not None and u.rol_id == roles.ADMIN_PLATAFORMA:
            raise ValidationError(
                {"rol": "El administrador de plataforma no se edita desde la consola."}
            )
        org = datos.get("organizacion", u.organizacion if u else None)
        area = datos.get("area", u.area if u else None)
        rol = datos.get("rol_id", u.rol_id if u else None)
        if org is None:
            raise ValidationError({"organizacion": "Elige la organización."})
        if area is not None and area.organizacion_id != org.num:
            raise ValidationError({"area": "El área no pertenece a esa organización."})
        if rol in (roles.SUPERVISOR, roles.OPERADOR) and area is None:
            raise ValidationError({"area": "Este rol requiere un área."})
        if u is None and not datos.get("password"):
            raise ValidationError({"password": "La contraseña es obligatoria."})
        return datos

    def create(self, datos):
        password = datos.pop("password")
        datos["rol_id"] = datos.pop("rol_id")
        if "estado_usuario_id" in datos:
            datos["estado_usuario_id"] = datos.pop("estado_usuario_id")
        return Usuario.objects.create_user(password=password, **datos)

    def update(self, u, datos):
        datos.pop("password", None)
        for campo, valor in datos.items():
            setattr(u, campo, valor)
        u.save()
        if u.estado_usuario_id != roles.USUARIO_ACTIVO:
            cerrar_sesiones(u)
            u.telefonos_push.all().delete()
        return u


class UsuarioConsolaViewSet(
    ConsolaMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = UsuarioConsolaSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        p = self.request.query_params
        limite = timezone.now() - timedelta(days=politica().dias_sesion)
        qs = (
            Usuario.objects.select_related("organizacion", "area")
            .annotate(
                n_sesiones=Count("sesiones", filter=Q(sesiones__ultimo_uso__gte=limite)),
                factor_activo=Count("segundo_factor", filter=Q(segundo_factor__activo=True)),
            )
            .order_by("primer_apellido", "nombre")
        )
        if org := _entero(p.get("organizacion")):
            qs = qs.filter(organizacion_id=org)
        if rol := p.get("rol"):
            qs = qs.filter(rol_id=rol)
        if estado := p.get("estado"):
            qs = qs.filter(estado_usuario_id=estado)
        if q := (p.get("q") or "").strip():
            qs = qs.filter(
                Q(nombre__icontains=q) | Q(primer_apellido__icontains=q) | Q(correo__icontains=q)
            )
        return qs

    def perform_update(self, serializer):
        if serializer.instance.pk == self.request.user.pk:
            raise ValidationError({"detail": "No puedes editar tu propia cuenta desde aquí."})
        serializer.save()

    def _accion(self, descripcion, u):
        registrar(
            Accion.MODIFICAR,
            organizacion_id=u.organizacion_id,
            recurso="usuario",
            recurso_num=u.pk,
            descripcion=f"{descripcion}: {u.correo}"[:255],
            request=self.request,
        )

    @action(detail=True, methods=["post"])
    def restablecer(self, request, pk=None):
        u = self.get_object()
        if not u.is_active:
            raise ValidationError({"detail": "La cuenta no está activa."})
        minutos = settings.PASSWORD_RESET_TIMEOUT // 60
        send_mail(
            "[Núcleo] Crea una contraseña nueva",
            (
                f"Hola, {u.nombre}.\n\nEl administrador de Núcleo pidió que cambies tu contraseña. "
                f"Abre este enlace para elegir una nueva (vale una sola vez y caduca en {minutos} "
                f"minutos):\n\n{enlace_recuperacion(u)}\n"
            ),
            settings.DEFAULT_FROM_EMAIL,
            [u.correo],
        )
        self._accion("Envió el enlace para restablecer la contraseña", u)
        return Response({"detail": f"Se envió el enlace a {u.correo}."})

    @action(detail=True, methods=["post"], url_path="quitar-2fa")
    def quitar_2fa(self, request, pk=None):
        u = self.get_object()
        borrados, _ = SegundoFactor.objects.filter(usuario=u).delete()
        if not borrados:
            raise ValidationError({"detail": "La cuenta no tiene verificación en dos pasos."})
        cerrar_sesiones(u)
        self._accion("Quitó la verificación en dos pasos", u)
        return Response(
            {"detail": "Se quitó la verificación en dos pasos y se cerraron sus sesiones."}
        )

    @action(detail=True, methods=["post"], url_path="cerrar-sesiones")
    def cerrar_sesiones(self, request, pk=None):
        u = self.get_object()
        if u.pk == request.user.pk:
            raise ValidationError({"detail": "No puedes cerrar tus propias sesiones desde aquí."})
        cerradas = cerrar_sesiones(u)
        self._accion(f"Cerró {cerradas} sesiones", u)
        return Response({"cerradas": cerradas})


# ── Sesiones abiertas ───────────────────────────────────────────────────────────────────────


class SesionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="num")
    dispositivo = serializers.SerializerMethodField()
    actual = serializers.SerializerMethodField()
    usuario = serializers.SerializerMethodField()

    class Meta:
        model = Sesion
        fields = ["id", "cliente", "dispositivo", "ip", "creada", "ultimo_uso", "actual", "usuario"]

    def get_dispositivo(self, s):
        return s.agente or ("App Núcleo" if s.cliente == Sesion.Cliente.APP else "Navegador")

    def get_actual(self, s):
        auth = self.context["request"].auth
        return isinstance(auth, Sesion) and auth.pk == s.pk

    def get_usuario(self, s):
        u = s.usuario
        return {
            "num": u.num,
            "nombre_completo": u.get_full_name(),
            "correo": u.correo,
            "rol": u.rol_id,
            "organizacion": _org(u.organizacion),
        }


class SesionViewSet(
    ConsolaMixin, mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    serializer_class = SesionSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = sesiones_vigentes().select_related("usuario__organizacion")
        if org := _entero(p.get("organizacion")):
            qs = qs.filter(usuario__organizacion_id=org)
        if usuario := _entero(p.get("usuario")):
            qs = qs.filter(usuario_id=usuario)
        if (cliente := p.get("cliente")) in (Sesion.Cliente.WEB, Sesion.Cliente.APP):
            qs = qs.filter(cliente=cliente)
        if q := (p.get("q") or "").strip():
            qs = qs.filter(
                Q(usuario__nombre__icontains=q)
                | Q(usuario__primer_apellido__icontains=q)
                | Q(usuario__correo__icontains=q)
                | Q(ip__icontains=q)
                | Q(agente__icontains=q)
            )
        return qs.order_by("-ultimo_uso")

    def perform_destroy(self, sesion):
        auth = self.request.auth
        if isinstance(auth, Sesion) and auth.pk == sesion.pk:
            raise ValidationError(
                {"detail": "Es la sesión con la que estás aquí: usa «Cerrar sesión»."}
            )
        u = sesion.usuario
        sesion.delete()
        registrar(
            Accion.MODIFICAR,
            organizacion_id=u.organizacion_id,
            recurso="sesion",
            recurso_num=sesion.num,
            descripcion=f"Cerró una sesión de {u.correo} ({sesion.agente or sesion.cliente})"[:255],
            request=self.request,
        )


# ── Equipos ESP32 y firmware ────────────────────────────────────────────────────────────────


class DispositivoConsolaSerializer(serializers.ModelSerializer):
    organizacion = serializers.SerializerMethodField()
    area = serializers.SerializerMethodField()
    estado = serializers.CharField(source="estado_dispositivo_id", required=False)
    en_linea = serializers.SerializerMethodField()

    class Meta:
        model = Dispositivo
        fields = [
            "num",
            "nombre",
            "codigo_mqtt",
            "organizacion",
            "area",
            "estado",
            "en_linea",
            "nivel_bateria",
            "ultima_conexion",
            "ultimo_arranque",
            "intervalo_muestreo_seg",
            "recibe_ota",
        ]
        read_only_fields = [
            "num",
            "nombre",
            "codigo_mqtt",
            "nivel_bateria",
            "ultima_conexion",
            "ultimo_arranque",
            "intervalo_muestreo_seg",
        ]

    def get_organizacion(self, d):
        return _org(d.area.organizacion)

    def get_area(self, d):
        return {"num": d.area.num, "nombre": d.area.nombre}

    def get_en_linea(self, d):
        return d.estado_dispositivo_id in ESTADOS_EN_LINEA

    def validate_estado(self, valor):
        if valor not in (roles.DISPOSITIVO_MANTENIMIENTO, roles.DISPOSITIVO_BAJA, "ACTIVO"):
            raise ValidationError("Estado no válido: usa MANT, BAJA o ACTIVO.")
        # Al reactivarlo queda «sin conexión» hasta que llegue su siguiente lectura.
        return roles.DISPOSITIVO_SIN_CONEXION if valor == "ACTIVO" else valor


class DispositivoConsolaViewSet(
    ConsolaMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = DispositivoConsolaSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        p = self.request.query_params
        qs = Dispositivo.objects.select_related("area__organizacion").order_by(
            "area__organizacion__nombre", "area__nombre", "nombre"
        )
        if org := _entero(p.get("organizacion")):
            qs = qs.filter(area__organizacion_id=org)
        if estado := p.get("estado"):
            qs = qs.filter(estado_dispositivo_id=estado)
        if q := (p.get("q") or "").strip():
            qs = qs.filter(Q(nombre__icontains=q) | Q(codigo_mqtt__icontains=q))
        return qs


class FirmwareView(ConsolaMixin, APIView):
    def get(self, request):
        version = firmware.version_actual()
        publicada = None
        if version:
            ruta = firmware.carpeta() / version
            if ruta.exists():
                publicada = timezone.datetime.fromtimestamp(
                    ruta.stat().st_mtime, tz=timezone.get_current_timezone()
                )
        p = politica()
        return Response(
            {
                "version": version,
                "publicada": publicada,
                "ota_todos": p.ota_todos or "*" in settings.NUCLEO_FIRMWARE_DISPOSITIVOS,
                "dispositivos_ota": (
                    Dispositivo.objects.exclude(
                        estado_dispositivo_id=roles.DISPOSITIVO_BAJA
                    ).count()
                    if p.ota_todos
                    else Dispositivo.objects.filter(recibe_ota=True).count()
                ),
            }
        )


# ── Política de seguridad ───────────────────────────────────────────────────────────────────


class PoliticaSerializer(serializers.ModelSerializer):
    roles_2fa_obligatorio = serializers.ListField(
        child=serializers.ChoiceField(choices=(roles.ADMIN_PLATAFORMA, *ROLES_ORGANIZACION)),
        allow_empty=True,
    )
    dias_sesion = serializers.IntegerField(min_value=1, max_value=90)
    intentos_login_por_minuto = serializers.IntegerField(min_value=3, max_value=60)
    dias_auditoria = serializers.IntegerField(min_value=30, max_value=3650)
    actualizado_por = serializers.SerializerMethodField()

    class Meta:
        model = PoliticaSeguridad
        fields = [
            "dias_sesion",
            "intentos_login_por_minuto",
            "roles_2fa_obligatorio",
            "dias_auditoria",
            "ota_todos",
            "actualizado",
            "actualizado_por",
        ]
        read_only_fields = ["actualizado"]

    def get_actualizado_por(self, p):
        return p.actualizado_por.get_full_name() if p.actualizado_por else None

    def validate_roles_2fa_obligatorio(self, valor):
        return sorted(set(valor))


class PoliticaView(ConsolaMixin, APIView):
    def get(self, request):
        return Response(PoliticaSerializer(politica(fresca=True)).data)

    def patch(self, request):
        entrada = PoliticaSerializer(politica(fresca=True), data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        entrada.save(actualizado=timezone.now(), actualizado_por=request.user)
        olvidar()
        return Response(PoliticaSerializer(politica(fresca=True)).data, status=status.HTTP_200_OK)
