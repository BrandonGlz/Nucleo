"""Creación de avisos de la campana y sus disparadores.

``crear_avisos`` es la única puerta: guarda un aviso por usuario, evita repetir uno igual
(mismo usuario, tipo, título y ruta) que siga sin leer y tenga menos de ``VENTANA_REPETICION``,
y publica cada aviso nuevo en el canal en vivo solo a su destinatario (grupo
``usuario.<num>``, ver ``apps.tiempo_real.eventos.aviso``).

Los disparadores (``dispositivo_*``, ``usuario_*``, ``reporte_*``, ``nico_*``) eligen a los
destinatarios: siempre usuarios activos de la organización. Ningún fallo aquí interrumpe a
quien los llama (ingesta de lecturas, gestión de usuarios, reportes): se registra y se sigue.
"""

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.avisos.models import Aviso
from apps.tiempo_real import eventos
from common import roles

logger = logging.getLogger(__name__)

Tipo = Aviso.Tipo
Nivel = Aviso.Nivel

VENTANA_REPETICION = timedelta(minutes=30)


def datos(aviso):
    """Formato de un aviso en la API y en el canal en vivo."""
    return {
        "num": aviso.num,
        "tipo": aviso.tipo,
        "nivel": aviso.nivel,
        "titulo": aviso.titulo,
        "detalle": aviso.detalle,
        "ruta": aviso.ruta,
        "fecha_hora": aviso.fecha_hora.isoformat(),
        "leido": aviso.leido_en is not None,
    }


def crear_avisos(usuarios, tipo, nivel, titulo, detalle="", ruta=""):
    """Crea el aviso para cada usuario (objetos o nums) y lo publica en vivo.

    Se omite a quien ya tiene el mismo aviso sin leer de los últimos 30 minutos. Devuelve
    los avisos creados.
    """
    nums = []
    for usuario in usuarios:
        num = getattr(usuario, "pk", usuario)
        if num is not None and num not in nums:
            nums.append(num)
    if not nums:
        return []
    titulo, detalle, ruta = titulo[:120], (detalle or "")[:300], (ruta or "")[:200]
    ahora = timezone.now()
    repetidos = set(
        Aviso.objects.filter(
            usuario_id__in=nums,
            tipo=tipo,
            titulo=titulo,
            ruta=ruta,
            leido_en__isnull=True,
            fecha_hora__gte=ahora - VENTANA_REPETICION,
        ).values_list("usuario_id", flat=True)
    )
    creados = Aviso.objects.bulk_create(
        [
            Aviso(
                usuario_id=num,
                tipo=tipo,
                nivel=nivel,
                titulo=titulo,
                detalle=detalle,
                ruta=ruta,
                fecha_hora=ahora,
            )
            for num in nums
            if num not in repetidos
        ]
    )
    for aviso in creados:
        eventos.aviso(aviso.usuario_id, datos(aviso))
    return creados


def _seguro(funcion):
    """Un disparador nunca lanza excepciones a quien lo llama."""

    def envoltura(*args, **kwargs):
        try:
            # Punto de guardado: un error de la base no rompe la transacción de quien llama.
            with transaction.atomic():
                return funcion(*args, **kwargs)
        except Exception:
            logger.exception("No se pudo crear el aviso (%s)", funcion.__name__)
            return []

    envoltura.__name__ = funcion.__name__
    envoltura.__doc__ = funcion.__doc__
    return envoltura


# ── Destinatarios ─────────────────────────────────────────────────────────────────────────


def _activos(organizacion_id):
    from apps.usuarios.models import Usuario

    return Usuario.objects.filter(
        organizacion_id=organizacion_id, estado_usuario_id=roles.USUARIO_ACTIVO
    )


def administradores(organizacion_id, excepto=None):
    consulta = _activos(organizacion_id).filter(rol_id=roles.ADMIN)
    if excepto is not None:
        consulta = consulta.exclude(pk=getattr(excepto, "pk", excepto))
    return list(consulta.order_by("pk"))


def responsables_de(dispositivo):
    """Administradores de la organización, supervisores del área y el operador asignado."""
    organizacion_id = dispositivo.area.organizacion_id
    filtro = Q(rol_id=roles.ADMIN) | Q(rol_id=roles.SUPERVISOR, area_id=dispositivo.area_id)
    if dispositivo.operador_id:
        filtro |= Q(pk=dispositivo.operador_id)
    return list(_activos(organizacion_id).filter(filtro).order_by("pk"))


def usuarios_de_nico(dispositivo):
    """Usuarios de la organización que pueden usar Nico AI con ese dispositivo."""
    from common.scoping import dispositivos_visibles

    return [
        usuario
        for usuario in _activos(dispositivo.area.organizacion_id)
        .filter(rol_id__in=roles.TODOS)
        .order_by("pk")
        if usuario.puede_usar_agente
        and dispositivos_visibles(usuario).filter(pk=dispositivo.pk).exists()
    ]


# ── Dispositivos ──────────────────────────────────────────────────────────────────────────


def _ruta_dispositivo(dispositivo):
    return f"/dispositivos/{dispositivo.pk}"


@_seguro
def dispositivo_sin_conexion(dispositivo):
    return crear_avisos(
        responsables_de(dispositivo),
        Tipo.DISPOSITIVO,
        Nivel.ADVERTENCIA,
        f"{dispositivo.nombre} se quedó sin conexión",
        f"{dispositivo.area.nombre} · {dispositivo.codigo_mqtt}: dejó de enviar lecturas.",
        _ruta_dispositivo(dispositivo),
    )


@_seguro
def dispositivo_reconectado(dispositivo):
    return crear_avisos(
        responsables_de(dispositivo),
        Tipo.DISPOSITIVO,
        Nivel.INFO,
        f"{dispositivo.nombre} volvió a conectarse",
        f"{dispositivo.area.nombre} · {dispositivo.codigo_mqtt}: envía lecturas otra vez.",
        _ruta_dispositivo(dispositivo),
    )


@_seguro
def dispositivo_bateria_baja(dispositivo):
    nivel = dispositivo.nivel_bateria
    return crear_avisos(
        responsables_de(dispositivo),
        Tipo.DISPOSITIVO,
        Nivel.ADVERTENCIA,
        f"Batería baja en {dispositivo.nombre}",
        f"{dispositivo.area.nombre} · {dispositivo.codigo_mqtt}: "
        + (f"queda {nivel} % de batería." if nivel is not None else "batería baja."),
        _ruta_dispositivo(dispositivo),
    )


# ── Usuarios ──────────────────────────────────────────────────────────────────────────────

ESTADOS_BAJA = (roles.USUARIO_INACTIVO, roles.USUARIO_BLOQUEADO)


def _nombre(usuario):
    return usuario.get_full_name() or usuario.correo


def _rol(codigo):
    from apps.catalogos.models import Rol

    return Rol.objects.filter(pk=codigo).values_list("nombre", flat=True).first() or codigo


def _area(area_id):
    from apps.organizaciones.models import Area

    if area_id is None:
        return "Sin área"
    return Area.objects.filter(pk=area_id).values_list("nombre", flat=True).first() or "Sin área"


def _por(actor):
    return f" por {_nombre(actor)}" if actor is not None else ""


def _admins_menos(usuario, actor):
    """Administradores de la organización del usuario salvo quien hizo la acción y él mismo."""
    return [a for a in administradores(usuario.organizacion_id, actor) if a.pk != usuario.pk]


@_seguro
def usuario_alta(usuario, actor=None):
    return crear_avisos(
        _admins_menos(usuario, actor),
        Tipo.USUARIO,
        Nivel.INFO,
        f"Nuevo usuario: {_nombre(usuario)}",
        f"{_rol(usuario.rol_id)} · {_area(usuario.area_id)} · alta{_por(actor)}.",
        "/usuarios",
    )


@_seguro
def usuario_baja(usuario, actor=None):
    estado = "bloqueada" if usuario.estado_usuario_id == roles.USUARIO_BLOQUEADO else "inactiva"
    return crear_avisos(
        _admins_menos(usuario, actor),
        Tipo.USUARIO,
        Nivel.ADVERTENCIA,
        f"Baja de usuario: {_nombre(usuario)}",
        f"{usuario.correo}: la cuenta quedó {estado}{_por(actor)}.",
        "/usuarios",
    )


@_seguro
def usuario_reactivado(usuario, actor=None):
    return crear_avisos(
        _admins_menos(usuario, actor),
        Tipo.USUARIO,
        Nivel.INFO,
        f"Usuario reactivado: {_nombre(usuario)}",
        f"{usuario.correo}: la cuenta volvió a estar activa{_por(actor)}.",
        "/usuarios",
    )


@_seguro
def usuario_cambio(usuario, rol_anterior, area_anterior, actor=None):
    """Cambio de rol o de área: avisa a los administradores y al propio usuario."""
    cambios = []
    if usuario.rol_id != rol_anterior:
        cambios.append(f"rol {_rol(rol_anterior)} → {_rol(usuario.rol_id)}")
    if usuario.area_id != area_anterior:
        cambios.append(f"área {_area(area_anterior)} → {_area(usuario.area_id)}")
    if not cambios:
        return []
    resumen = "; ".join(cambios)
    creados = crear_avisos(
        _admins_menos(usuario, actor),
        Tipo.USUARIO,
        Nivel.INFO,
        f"Cambio de usuario: {_nombre(usuario)}",
        f"{resumen[:1].upper()}{resumen[1:]}{_por(actor)}.",
        "/usuarios",
    )
    if usuario.estado_usuario_id == roles.USUARIO_ACTIVO and (
        actor is None or actor.pk != usuario.pk
    ):
        partes = []
        if usuario.rol_id != rol_anterior:
            partes.append(f"tu rol ahora es {_rol(usuario.rol_id)}")
        if usuario.area_id != area_anterior:
            partes.append(f"tu área ahora es {_area(usuario.area_id)}")
        texto = " y ".join(partes)
        creados += crear_avisos(
            [usuario],
            Tipo.USUARIO,
            Nivel.INFO,
            "Cambiaron tu rol o tu área",
            f"{texto[:1].upper()}{texto[1:]}{_por(actor)}.",
            "/perfil",
        )
    return creados


# ── Reportes ──────────────────────────────────────────────────────────────────────────────


def _periodo(reporte):
    inicio = timezone.localtime(reporte.periodo_inicio)
    fin = timezone.localtime(reporte.periodo_fin)
    alcance = reporte.area.nombre if reporte.area_id else "Todas las áreas"
    return f"{alcance} · {inicio:%d/%m/%Y} al {fin:%d/%m/%Y}"


@_seguro
def reporte_listo(reporte, usuario):
    """Reporte manual o pedido a Nico: avisa a quien lo pidió."""
    if usuario is None:
        return []
    return crear_avisos(
        [usuario],
        Tipo.REPORTE,
        Nivel.INFO,
        f"Reporte {reporte.num} listo",
        f"{_periodo(reporte)}.",
        "/reportes",
    )


@_seguro
def reporte_enviado(reporte, destinatarios):
    """Reporte enviado por correo: avisa a cada destinatario activo de la organización y, si
    es programado, también a quien creó la programación."""
    from apps.reportes.models import Reporte

    programado = reporte.origen == Reporte.Origen.PROGRAMADO
    nums = [getattr(d, "pk", d) for d in destinatarios]
    if programado and reporte.generado_por_id:
        nums.append(reporte.generado_por_id)
    usuarios = list(_activos(reporte.organizacion_id).filter(pk__in=nums).order_by("pk"))
    titulo = (
        f"Reporte programado {reporte.num} enviado"
        if programado
        else f"Reporte {reporte.num} enviado por correo"
    )
    return crear_avisos(
        usuarios,
        Tipo.REPORTE,
        Nivel.INFO,
        titulo,
        f"{_periodo(reporte)}. Se envió por correo con el PDF adjunto.",
        "/reportes",
    )


# ── Nico AI ───────────────────────────────────────────────────────────────────────────────


@_seguro
def nico_agente(dispositivo, activo):
    """El agente de Nico AI de un dispositivo (su ESP puente) se quedó sin conexión o volvió."""
    if activo:
        titulo = f"Nico AI de {dispositivo.nombre} está disponible otra vez"
        detalle = f"{dispositivo.area.nombre}: su agente volvió a conectarse."
        nivel = Nivel.INFO
    else:
        titulo = f"Nico AI de {dispositivo.nombre} se quedó sin conexión"
        detalle = (
            f"{dispositivo.area.nombre}: el agente no responde hasta que su ESP vuelva a "
            "conectarse."
        )
        nivel = Nivel.ADVERTENCIA
    return crear_avisos(usuarios_de_nico(dispositivo), Tipo.NICO, nivel, titulo, detalle, "/agente")
