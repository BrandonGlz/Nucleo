"""Solicitudes de acceso: una persona sin cuenta pide entrar a su organización y área.

1. Desde la pantalla de acceso elige su organización y área y escribe sus datos.
2. Nico avisa por correo a los administradores de esa organización (o a los de la
   plataforma, si la organización no tiene) con un enlace a ``/solicitudes/<num>``.
3. Un administrador, con su sesión, revisa los datos, elige área y rol y crea la cuenta.
   La persona recibe su bienvenida con una contraseña temporal que debe cambiar al entrar.
"""

import logging
import secrets
import string

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from apps.catalogos.models import Rol
from apps.organizaciones.models import Area, Organizacion
from apps.usuarios.models import SolicitudAcceso, Usuario
from common import correo, roles
from common.red import LimitePorIP, ip_cliente
from common.validadores import validar_correo, validar_password

logger = logging.getLogger(__name__)
Accion = RegistroAuditoria.Accion
Estado = SolicitudAcceso.Estado

# Roles que se pueden asignar al aprobar una solicitud.
ROLES_ASIGNABLES = (roles.OPERADOR, roles.ANALISTA, roles.SUPERVISOR, roles.ADMIN)
NOMBRE_ROL = {
    roles.OPERADOR: "Operador",
    roles.ANALISTA: "Analista",
    roles.SUPERVISOR: "Supervisor",
    roles.ADMIN: "Administrador",
}


# --- Sin sesión: opciones y envío de la solicitud ---------------------------------------------


class SolicitudSerializer(serializers.Serializer):
    organizacion = serializers.PrimaryKeyRelatedField(
        queryset=Organizacion.objects.filter(estado=Organizacion.Estado.ACTIVA)
    )
    area = serializers.PrimaryKeyRelatedField(queryset=Area.objects.all())
    nombre = serializers.CharField(max_length=60)
    primer_apellido = serializers.CharField(max_length=60)
    segundo_apellido = serializers.CharField(max_length=60, required=False, allow_blank=True)
    correo = serializers.EmailField(max_length=150, validators=[validar_correo])
    # Campo trampa: invisible para las personas; si llega con texto, es un bot.
    sitio = serializers.CharField(required=False, allow_blank=True)

    def validate(self, datos):
        if datos["area"].organizacion_id != datos["organizacion"].pk:
            raise serializers.ValidationError({"area": "El área no pertenece a la organización."})
        datos["correo"] = datos["correo"].strip().lower()
        return datos


class SolicitarAccesoView(APIView):
    """GET: organizaciones activas con sus áreas. POST: envía la solicitud.

    Responde 204 siempre que los datos sean válidos, exista o no la cuenta, para no
    revelar qué correos están dados de alta.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "solicitud"

    def get_throttles(self):
        return [LimitePorIP()] if self.request.method == "POST" else []

    def get(self, request):
        organizaciones = (
            Organizacion.objects.filter(estado=Organizacion.Estado.ACTIVA)
            .prefetch_related("areas")
            .order_by("nombre")
        )
        return Response(
            [
                {
                    "num": o.num,
                    "nombre": o.nombre,
                    "areas": [{"num": a.num, "nombre": a.nombre} for a in o.areas.all()],
                }
                for o in organizaciones
            ]
        )

    def post(self, request):
        entrada = SolicitudSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        ya_existe = (
            Usuario.objects.filter(correo__iexact=datos["correo"]).exists()
            or SolicitudAcceso.objects.filter(
                correo__iexact=datos["correo"], estado=Estado.PENDIENTE
            ).exists()
        )
        if datos.get("sitio") or ya_existe:
            return Response(status=status.HTTP_204_NO_CONTENT)
        solicitud = SolicitudAcceso.objects.create(
            organizacion=datos["organizacion"],
            area=datos["area"],
            nombre=datos["nombre"].strip(),
            primer_apellido=datos["primer_apellido"].strip(),
            segundo_apellido=datos.get("segundo_apellido", "").strip(),
            correo=datos["correo"],
            ip=ip_cliente(request),
        )
        avisar_administradores(solicitud)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _nombre(s):
    return " ".join(p for p in (s.nombre, s.primer_apellido, s.segundo_apellido) if p)


def administradores(organizacion):
    """Administradores activos de la organización; si no hay, los de la plataforma."""
    activos = Usuario.objects.filter(estado_usuario_id=roles.USUARIO_ACTIVO)
    admins = list(activos.filter(organizacion=organizacion, rol_id=roles.ADMIN))
    return admins or list(activos.filter(rol_id=roles.ADMIN_PLATAFORMA))


def avisar_administradores(solicitud):
    destinos = [u.correo for u in administradores(solicitud.organizacion)]
    if not destinos:
        return
    nombre = _nombre(solicitud)
    fecha = timezone.localtime(solicitud.fecha_solicitud or timezone.now())
    try:
        correo.enviar(
            destinos,
            f"Solicitud de acceso · {nombre} · {solicitud.organizacion.nombre}",
            titulo="Nueva solicitud de acceso",
            icono="user-plus",
            etiqueta="Solicitud de acceso",
            intro=(
                f"Le escribe Nico. {nombre} solicitó una cuenta en "
                f"{solicitud.organizacion.nombre}. Revise sus datos y, si corresponde, "
                "dé de alta su cuenta; yo le enviaré su bienvenida y sus credenciales."
            ),
            filas=[
                ("Nombre", nombre),
                ("Correo", solicitud.correo),
                ("Organización", solicitud.organizacion.nombre),
                ("Área solicitada", solicitud.area.nombre if solicitud.area_id else "—"),
                ("Fecha", f"{fecha:%d/%m/%Y, %H:%M}"),
            ],
            boton=("Revisar solicitud", correo.url_web(f"/solicitudes/{solicitud.num}")),
            motivo="Recibe este aviso porque administra esta organización en Núcleo.",
        )
    except Exception:
        logger.exception("No se pudo avisar de la solicitud de acceso %s", solicitud.num)


# --- Con sesión: revisar, aprobar o rechazar -------------------------------------------------


def _solicitud_de(request, num):
    """La solicitud, si quien la abre administra su organización o la plataforma."""
    actor = request.user
    if not actor.tiene_rol(roles.ADMIN, roles.ADMIN_PLATAFORMA):
        raise PermissionDenied("Solo un administrador puede revisar solicitudes de acceso.")
    solicitud = (
        SolicitudAcceso.objects.select_related(
            "organizacion", "area", "atendida_por", "usuario_creado"
        )
        .filter(num=num)
        .first()
    )
    if solicitud is None or (
        actor.rol_id == roles.ADMIN and solicitud.organizacion_id != actor.organizacion_id
    ):
        raise NotFound("La solicitud no existe.")
    return solicitud


def _datos(solicitud):
    return {
        "num": solicitud.num,
        "estado": solicitud.estado,
        "nombre": solicitud.nombre,
        "primer_apellido": solicitud.primer_apellido,
        "segundo_apellido": solicitud.segundo_apellido,
        "correo": solicitud.correo,
        "fecha_solicitud": solicitud.fecha_solicitud,
        "organizacion": {
            "num": solicitud.organizacion.num,
            "nombre": solicitud.organizacion.nombre,
        },
        "area": solicitud.area_id,
        "areas": [
            {"num": a.num, "nombre": a.nombre}
            for a in solicitud.organizacion.areas.order_by("nombre")
        ],
        "roles": [{"codigo": c, "nombre": NOMBRE_ROL[c]} for c in ROLES_ASIGNABLES],
        "correo_registrado": Usuario.objects.filter(correo__iexact=solicitud.correo).exists(),
        "atendida_por": solicitud.atendida_por.get_full_name() if solicitud.atendida_por else None,
        "fecha_atencion": solicitud.fecha_atencion,
    }


class SolicitudAccesoView(APIView):
    """GET: datos de la solicitud y las opciones para aprobarla."""

    permission_classes = [IsAuthenticated]

    def get(self, request, num):
        return Response(_datos(_solicitud_de(request, num)))


class AprobarSerializer(serializers.Serializer):
    area = serializers.IntegerField()
    rol = serializers.ChoiceField(choices=ROLES_ASIGNABLES)
    nombre = serializers.CharField(max_length=60)
    primer_apellido = serializers.CharField(max_length=60)
    segundo_apellido = serializers.CharField(max_length=60, required=False, allow_blank=True)


def password_temporal():
    """12 caracteres sin letras ni números que se confundan (O/0, l/1)."""
    letras = "".join(c for c in string.ascii_letters if c not in "OoIl")
    digitos = "23456789"
    while True:
        clave = "".join(secrets.choice(letras + digitos) for _ in range(12))
        if any(c in digitos for c in clave) and any(c.isupper() for c in clave):
            return clave


def _pendiente(solicitud):
    if solicitud.estado != Estado.PENDIENTE:
        raise serializers.ValidationError(
            {"detail": f"La solicitud ya fue {solicitud.get_estado_display().lower()}."}
        )


class AprobarSolicitudView(APIView):
    """POST {area, rol, nombre, primer_apellido, segundo_apellido?}: crea la cuenta con
    contraseña temporal y Nico le envía la bienvenida."""

    permission_classes = [IsAuthenticated]

    def post(self, request, num):
        solicitud = _solicitud_de(request, num)
        _pendiente(solicitud)
        entrada = AprobarSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        area = Area.objects.filter(num=datos["area"], organizacion=solicitud.organizacion).first()
        if area is None:
            return Response(
                {"area": ["El área no pertenece a la organización."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Usuario.objects.filter(correo__iexact=solicitud.correo).exists():
            return Response(
                {"detail": "Ya existe una cuenta con ese correo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        clave = password_temporal()
        with transaction.atomic():
            usuario = Usuario(
                organizacion=solicitud.organizacion,
                area=area,
                rol=Rol.objects.get(pk=datos["rol"]),
                nombre=datos["nombre"].strip(),
                primer_apellido=datos["primer_apellido"].strip(),
                segundo_apellido=(datos.get("segundo_apellido") or "").strip() or None,
                correo=solicitud.correo,
                debe_cambiar_password=True,
            )
            validar_password(clave, usuario)
            usuario.set_password(clave)
            usuario.full_clean(exclude=["password", "telefono"])
            usuario.save()
            solicitud.estado = Estado.APROBADA
            solicitud.atendida_por = request.user
            solicitud.fecha_atencion = timezone.now()
            solicitud.usuario_creado = usuario
            solicitud.save()
        registrar(
            Accion.CREAR,
            usuario=request.user,
            organizacion_id=solicitud.organizacion_id,
            recurso="usuario",
            recurso_num=usuario.num,
            descripcion=f"Alta por solicitud de acceso de {usuario.correo}",
            request=request,
        )
        enviado = enviar_bienvenida(usuario, clave, request.user)
        return Response({**_datos(solicitud), "correo_enviado": enviado})


def enviar_bienvenida(usuario, clave, aprobo):
    equipo = usuario.area.nombre if usuario.area_id else usuario.organizacion.nombre
    try:
        return bool(
            correo.enviar(
                [usuario.correo],
                f"Bienvenido al equipo de {equipo} en Núcleo",
                titulo=f"Le damos la bienvenida al equipo de {equipo}",
                icono="user-check",
                etiqueta="Bienvenida",
                intro=(
                    f"Hola, {usuario.nombre}. Le escribe Nico, su asistente en Núcleo. "
                    f"Su solicitud fue aprobada y ya forma parte del equipo de {equipo} "
                    f"en {usuario.organizacion.nombre}."
                ),
                filas=[
                    ("Organización", usuario.organizacion.nombre),
                    ("Área", usuario.area.nombre if usuario.area_id else "Todas las áreas"),
                    ("Rol", NOMBRE_ROL.get(usuario.rol_id, usuario.rol_id)),
                    ("Usuario", usuario.correo),
                    ("Contraseña temporal", clave),
                ],
                parrafos=[
                    "Por seguridad, al entrar por primera vez le pediré cambiar esta contraseña "
                    "por una que solo usted conozca.",
                ],
                boton=("Entrar a Núcleo", correo.url_web("/")),
                motivo=(
                    f"Recibe este mensaje porque {aprobo.get_full_name()} aprobó su solicitud "
                    "de acceso a Núcleo."
                ),
            )
        )
    except Exception:
        logger.exception("No se pudo enviar la bienvenida al usuario %s", usuario.pk)
        return False


class RechazarSolicitudView(APIView):
    """POST: marca la solicitud como rechazada y Nico se lo informa a la persona."""

    permission_classes = [IsAuthenticated]

    def post(self, request, num):
        solicitud = _solicitud_de(request, num)
        _pendiente(solicitud)
        solicitud.estado = Estado.RECHAZADA
        solicitud.atendida_por = request.user
        solicitud.fecha_atencion = timezone.now()
        solicitud.save()
        try:
            correo.enviar(
                [solicitud.correo],
                "Su solicitud de acceso a Núcleo",
                titulo="Su solicitud de acceso no fue aprobada",
                icono="user-x",
                intro=(
                    f"Hola, {solicitud.nombre}. Le escribe Nico. El administrador de "
                    f"{solicitud.organizacion.nombre} revisó su solicitud y por ahora no "
                    "fue aprobada."
                ),
                parrafos=[
                    "Si cree que se trata de un error, comuníquese con el administrador "
                    "de su organización."
                ],
                motivo="Recibe este mensaje porque solicitó acceso a Núcleo.",
            )
        except Exception:
            logger.exception("No se pudo avisar el rechazo de la solicitud %s", solicitud.num)
        return Response(_datos(solicitud))
