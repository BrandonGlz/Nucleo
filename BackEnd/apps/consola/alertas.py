"""Alertas de seguridad de la consola de administración y sus avisos a los superusuarios.

Se generan al ocurrir el evento, no al abrir la consola:

* ``post_save`` de ``RegistroAuditoria``: cada ``LOGIN_FALLIDO`` revisa los intentos de las
  últimas 24 horas desde esa IP (5 o más; crítico desde 10) y en esa cuenta (3 o más; crítico
  desde 10); cada ``LOGIN`` revisa si la persona entró desde una IP que no había usado en los
  30 días anteriores (si ya tenía accesos).
* ``pre_save``/``post_save`` de ``Usuario``: pasar a ``BLQ`` abre «cuenta bloqueada»; al
  desbloquearla, esa alerta queda revisada sola.

No se duplica la misma alerta abierta (``estado = nueva`` con la misma ``clave``): el evento
siguiente actualiza la abierta. Una alerta nueva, o una que sube de advertencia a crítica, avisa
a cada superusuario en la campana de la consola y, según sus preferencias, por correo (sin push:
la app móvil no es para el superusuario). ``sin_2fa`` no se guarda: se calcula al vuelo
(``cuentas_sin_2fa``) porque no es un evento sino un estado.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models.signals import post_save, pre_save
from django.utils import timezone

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import actor_actual
from apps.usuarios.models import Usuario
from common import roles

from .models import AlertaSeguridad, NotificacionSeguridad, PreferenciaAvisosSeguridad

logger = logging.getLogger(__name__)

Accion = RegistroAuditoria.Accion
Tipo = AlertaSeguridad.Tipo
Nivel = AlertaSeguridad.Nivel
Estado = AlertaSeguridad.Estado

VENTANA_FALLIDOS = timedelta(hours=24)
FALLIDOS_IP = 5
FALLIDOS_CUENTA = 3
FALLIDOS_CRITICO = 10
DIAS_IP_CONOCIDA = 30
NIVELES = (Nivel.CRITICO, Nivel.ADVERTENCIA)


# ── Preferencias ────────────────────────────────────────────────────────────────────────────


def preferencias(usuario):
    """Preferencias del superusuario (sin guardarlas si aún no las ha cambiado)."""
    pref = PreferenciaAvisosSeguridad.objects.filter(usuario=usuario).first()
    return pref or PreferenciaAvisosSeguridad(usuario=usuario)


def superusuarios():
    return Usuario.objects.filter(
        rol_id=roles.ADMIN_PLATAFORMA, estado_usuario_id=roles.USUARIO_ACTIVO
    )


# ── Avisos ──────────────────────────────────────────────────────────────────────────────────


def _texto_correo(alerta):
    nivel = alerta.get_nivel_display()
    asunto = f"[Núcleo] Seguridad · {nivel}: {alerta.titulo}"
    lineas = [f"Se abrió una alerta de seguridad de nivel {nivel.lower()}.", "", alerta.titulo]
    if alerta.detalle:
        lineas.append(alerta.detalle)
    lineas.append("")
    if alerta.usuario_correo:
        lineas.append(f"Cuenta: {alerta.usuario_correo}")
    if alerta.ip:
        lineas.append(f"IP: {alerta.ip}")
    lineas.append(f"Eventos: {alerta.eventos}")
    lineas.append(f"Último evento: {timezone.localtime(alerta.ultimo_evento):%Y-%m-%d %H:%M %Z}")
    lineas += ["", "Revísala en la consola de administración, sección Alertas."]
    return asunto, "\n".join(lineas)


def _enviar_correos(alerta_num, destinos):
    """Manda los correos ya confirmada la transacción; nunca lanza excepciones."""
    alerta = AlertaSeguridad.objects.filter(pk=alerta_num).first()
    if alerta is None:
        return
    asunto, cuerpo = _texto_correo(alerta)
    for notif_num, correo in destinos:
        try:
            salio = send_mail(asunto, cuerpo, settings.DEFAULT_FROM_EMAIL, [correo]) > 0
        except Exception:
            logger.exception("No se pudo enviar el correo de la alerta de seguridad %s", alerta_num)
            salio = False
        NotificacionSeguridad.objects.filter(pk=notif_num).update(correo_enviado=salio)


def notificar(alerta):
    """Avisa a cada superusuario activo: campana siempre (la lista filtra por sus preferencias)
    y correo si el nivel está en sus ``niveles_correo``."""
    destinos = []
    for u in superusuarios():
        pref = preferencias(u)
        notif = NotificacionSeguridad.objects.create(alerta=alerta, usuario=u, nivel=alerta.nivel)
        if alerta.nivel in pref.niveles_correo:
            destinos.append((notif.pk, u.correo))
    if destinos:
        transaction.on_commit(lambda: _enviar_correos(alerta.pk, destinos))


# ── Apertura sin duplicar ───────────────────────────────────────────────────────────────────


def _mayor(a, b):
    return Nivel.CRITICO if Nivel.CRITICO in (a, b) else Nivel.ADVERTENCIA


def abrir(tipo, clave, nivel, titulo, detalle="", usuario=None, ip=None, eventos=1, fecha=None):
    """Crea la alerta o actualiza la abierta del mismo caso. Devuelve la alerta."""
    fecha = fecha or timezone.now()
    datos = {
        "titulo": titulo[:200],
        "detalle": detalle[:255],
        "eventos": eventos,
        "ultimo_evento": fecha,
        "ip": ip,
    }
    with transaction.atomic():
        alerta = (
            AlertaSeguridad.objects.select_for_update()
            .filter(clave=clave, estado=Estado.NUEVA)
            .first()
        )
        avisar = False
        if alerta is None:
            try:
                with transaction.atomic():
                    alerta = AlertaSeguridad.objects.create(
                        tipo=tipo,
                        clave=clave[:120],
                        nivel=nivel,
                        usuario=usuario,
                        usuario_correo=(usuario.correo if usuario else "")[:150],
                        **datos,
                    )
                    avisar = True
            except IntegrityError:
                # Otra petición la abrió al mismo tiempo: se actualiza esa.
                alerta = AlertaSeguridad.objects.get(clave=clave, estado=Estado.NUEVA)
        if not avisar:
            subio = alerta.nivel != Nivel.CRITICO and nivel == Nivel.CRITICO
            alerta.nivel = _mayor(alerta.nivel, nivel)
            for campo, valor in datos.items():
                if campo == "ip" and valor is None:
                    continue
                setattr(alerta, campo, valor)
            alerta.save()
            avisar = subio
        if avisar:
            notificar(alerta)
    return alerta


def cerrar(alerta, estado, usuario=None, nota=""):
    alerta.estado = estado
    alerta.revisada_por = usuario
    alerta.fecha_revision = timezone.now()
    alerta.nota = nota[:255]
    alerta.save(update_fields=["estado", "revisada_por", "fecha_revision", "nota"])
    return alerta


def _desde(clave, ahora):
    """Inicio de la ventana: 24 horas o desde que se cerró la última alerta del mismo caso
    (para no reabrirla al instante con los mismos intentos)."""
    desde = ahora - VENTANA_FALLIDOS
    cerrada = (
        AlertaSeguridad.objects.filter(clave=clave, fecha_revision__gt=desde)
        .exclude(estado=Estado.NUEVA)
        .order_by("-fecha_revision")
        .values_list("fecha_revision", flat=True)
        .first()
    )
    return max(desde, cerrada) if cerrada else desde


# ── Reglas ──────────────────────────────────────────────────────────────────────────────────


def _fallido(registro, ahora):
    fallidos = RegistroAuditoria.objects.filter(accion=Accion.LOGIN_FALLIDO)
    if registro.ip:
        clave = f"ip_fallidos:{registro.ip}"
        recientes = fallidos.filter(ip=registro.ip, fecha_hora__gte=_desde(clave, ahora))
        n = recientes.count()
        if n >= FALLIDOS_IP:
            cuentas = recientes.values("usuario_correo").distinct().count()
            abrir(
                Tipo.IP_FALLIDOS,
                clave,
                Nivel.CRITICO if n >= FALLIDOS_CRITICO else Nivel.ADVERTENCIA,
                f"{n} intentos fallidos desde una misma IP",
                (
                    "En las últimas 24 horas, "
                    + ("con una sola cuenta" if cuentas == 1 else f"con {cuentas} cuentas")
                    + ". Puede ser un intento de adivinar contraseñas."
                ),
                ip=registro.ip,
                eventos=n,
                fecha=ahora,
            )
    u = registro.usuario
    if u is not None:
        clave = f"cuenta_fallidos:{u.pk}"
        n = fallidos.filter(usuario=u, fecha_hora__gte=_desde(clave, ahora)).count()
        if n >= FALLIDOS_CUENTA:
            abrir(
                Tipo.CUENTA_FALLIDOS,
                clave,
                Nivel.CRITICO if n >= FALLIDOS_CRITICO else Nivel.ADVERTENCIA,
                f"{n} intentos fallidos en la cuenta de {u.get_full_name()}",
                "En las últimas 24 horas.",
                usuario=u,
                ip=registro.ip,
                eventos=n,
                fecha=ahora,
            )


def _acceso(registro, ahora):
    u = registro.usuario
    if u is None or not registro.ip:
        return
    previos = RegistroAuditoria.objects.filter(accion=Accion.LOGIN, usuario=u).exclude(
        pk=registro.pk
    )
    if not previos.exists():
        return  # primer acceso de la cuenta: no hay con qué comparar
    if previos.filter(
        ip=registro.ip, fecha_hora__gte=ahora - timedelta(days=DIAS_IP_CONOCIDA)
    ).exists():
        return
    abrir(
        Tipo.IP_NUEVA,
        f"ip_nueva:{u.pk}:{registro.ip}",
        Nivel.ADVERTENCIA,
        f"{u.get_full_name()} entró desde una IP nueva",
        f"No había usado esa dirección en los {DIAS_IP_CONOCIDA} días anteriores.",
        usuario=u,
        ip=registro.ip,
        fecha=ahora,
    )


def al_registrar(sender, instance, created, raw=False, **kwargs):
    """Señal de ``RegistroAuditoria``. Nunca interrumpe el inicio de sesión."""
    if not created or raw or instance.accion not in (Accion.LOGIN, Accion.LOGIN_FALLIDO):
        return
    try:
        with transaction.atomic():
            ahora = timezone.now()
            if instance.accion == Accion.LOGIN_FALLIDO:
                _fallido(instance, ahora)
            else:
                _acceso(instance, ahora)
    except Exception:
        logger.exception("No se pudo evaluar la alerta de seguridad del registro %s", instance.pk)


def antes_de_guardar_usuario(sender, instance, raw=False, update_fields=None, **kwargs):
    instance._estado_previo = None
    if raw or instance.pk is None:
        return
    if update_fields is not None and "estado_usuario" not in update_fields:
        return
    instance._estado_previo = (
        Usuario.objects.filter(pk=instance.pk).values_list("estado_usuario_id", flat=True).first()
    )


def al_guardar_usuario(sender, instance, created, raw=False, **kwargs):
    previo = getattr(instance, "_estado_previo", None)
    actual = instance.estado_usuario_id
    if raw or previo is None or previo == actual:
        return
    clave = f"cuenta_bloqueada:{instance.pk}"
    try:
        with transaction.atomic():
            if actual == roles.USUARIO_BLOQUEADO:
                actor = actor_actual()
                abrir(
                    Tipo.CUENTA_BLOQUEADA,
                    clave,
                    Nivel.ADVERTENCIA,
                    f"Cuenta bloqueada: {instance.get_full_name()}",
                    (f"La bloqueó {actor.get_full_name()}. " if actor else "")
                    + "No puede entrar hasta que se desbloquee en Usuarios.",
                    usuario=instance,
                )
            elif previo == roles.USUARIO_BLOQUEADO:
                for alerta in AlertaSeguridad.objects.filter(clave=clave, estado=Estado.NUEVA):
                    cerrar(alerta, Estado.REVISADA, actor_actual(), "Se desbloqueó la cuenta.")
    except Exception:
        logger.exception("No se pudo evaluar la alerta de cuenta bloqueada de %s", instance.pk)


def conectar():
    """Lo llama ``ConsolaConfig.ready``."""
    post_save.connect(al_registrar, sender=RegistroAuditoria, dispatch_uid="consola_alertas_reg")
    pre_save.connect(antes_de_guardar_usuario, sender=Usuario, dispatch_uid="consola_alertas_pre")
    post_save.connect(al_guardar_usuario, sender=Usuario, dispatch_uid="consola_alertas_usr")


# ── Estado calculado al vuelo ───────────────────────────────────────────────────────────────


def cuentas_sin_2fa():
    """Cuentas activas cuyo rol exige la verificación en dos pasos y aún no la tienen."""
    from .politicas import politica

    exigidos = politica().roles_2fa_obligatorio
    if not exigidos:
        return 0
    return (
        Usuario.objects.filter(rol_id__in=exigidos, estado_usuario_id=roles.USUARIO_ACTIVO)
        .exclude(segundo_factor__activo=True)
        .count()
    )
