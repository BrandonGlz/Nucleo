"""Notificaciones de la consola de Nico AI para el superusuario.

Eventos que avisan (``NotificacionNico.Tipo``):

- ``NO_ENTENDIDA``: alguien hizo una pregunta que Nico no entendió (una vez al día por pregunta
  y organización; las del propio superusuario no avisan).
- ``NEGATIVA``: una respuesta recibió 👎.
- ``APRENDIDA``: el banco activó una respuesta aprendida por los 👍.
- ``PUENTE``: el ESP puente de un dispositivo dejó de latir o volvió.
- ``CARGA``: la IA se suspendió por poca memoria del servidor o se reanudó.

Cada superusuario elige en la consola qué tipos ve en la campana y cuáles le llegan por correo
(``PreferenciaAvisosNico``). El puente y la carga se revisan con ``vigilar()``, que corre en el
ciclo de ``manage.py marcar_sin_conexion`` (servicio ``nucleo-sin-conexion``, cada 60 s).
Ningún fallo aquí interrumpe al agente: se registra en el log y se sigue.
"""

import hashlib
import logging
import threading
from datetime import timedelta
from urllib.parse import quote, urlparse

from django.conf import settings
from django.core.mail import send_mail
from django.db import close_old_connections, transaction
from django.utils import timezone

from common import roles

from .models import MarcaAvisoNico, NotificacionNico, PreferenciaAvisosNico

logger = logging.getLogger(__name__)

Tipo = NotificacionNico.Tipo
Nivel = NotificacionNico.Nivel

# Etiqueta, descripción y valores por defecto de cada tipo (pantalla de preferencias).
TIPOS = {
    Tipo.NO_ENTENDIDA: {
        "descripcion": "Alguien hizo una pregunta que Nico no entendió (una vez al día).",
        "consola": True,
        "correo": False,
    },
    Tipo.NEGATIVA: {
        "descripcion": "Un usuario marcó una respuesta como no útil (👎).",
        "consola": True,
        "correo": False,
    },
    Tipo.APRENDIDA: {
        "descripcion": "El banco activó una respuesta aprendida de las calificaciones 👍.",
        "consola": True,
        "correo": False,
    },
    Tipo.PUENTE: {
        "descripcion": "El ESP puente de un dispositivo dejó de latir o volvió a conectarse.",
        "consola": True,
        "correo": True,
    },
    Tipo.CARGA: {
        "descripcion": "La IA se suspendió por poca memoria en el servidor o se reanudó.",
        "consola": True,
        "correo": True,
    },
}

UN_DIA = 24 * 3600


def destinatarios():
    from apps.usuarios.models import Usuario

    return Usuario.objects.filter(
        rol_id=roles.ADMIN_PLATAFORMA, estado_usuario_id=roles.USUARIO_ACTIVO
    )


def preferencias(usuario):
    """``{tipo: {"consola": bool, "correo": bool}}`` con los valores por defecto completados."""
    guardadas = (
        PreferenciaAvisosNico.objects.filter(usuario=usuario)
        .values_list("tipos", flat=True)
        .first()
        or {}
    )
    resultado = {}
    for tipo, info in TIPOS.items():
        propia = guardadas.get(tipo) or {}
        resultado[str(tipo)] = {
            canal: bool(propia.get(canal, info[canal])) for canal in ("consola", "correo")
        }
    return resultado


def guardar_preferencias(usuario, cambios):
    """Mezcla ``cambios`` (mismo formato que ``preferencias``) con lo guardado."""
    actuales = preferencias(usuario)
    for tipo, canales in (cambios or {}).items():
        if tipo not in actuales or not isinstance(canales, dict):
            continue
        for canal in ("consola", "correo"):
            if canal in canales:
                actuales[tipo][canal] = bool(canales[canal])
    PreferenciaAvisosNico.objects.update_or_create(usuario=usuario, defaults={"tipos": actuales})
    return actuales


# ── Marcas: no repetir avisos y recordar el último estado ─────────────────────────────────


def una_vez(clave, segundos):
    """True si no se avisó de ``clave`` en los últimos ``segundos`` (y lo anota)."""
    ahora = timezone.now()
    with transaction.atomic():
        marca, creada = MarcaAvisoNico.objects.select_for_update().get_or_create(
            clave=clave[:200], defaults={"fecha": ahora, "valor": "aviso"}
        )
        if creada:
            return True
        if ahora - marca.fecha < timedelta(seconds=segundos):
            return False
        marca.fecha = ahora
        marca.save(update_fields=["fecha"])
        return True


def cambio_de_estado(clave, valor):
    """Guarda el estado de ``clave`` y devuelve el anterior (``None`` la primera vez)."""
    with transaction.atomic():
        marca, creada = MarcaAvisoNico.objects.select_for_update().get_or_create(
            clave=clave[:200], defaults={"fecha": timezone.now(), "valor": valor}
        )
        if creada:
            return None
        anterior = marca.valor
        if anterior != valor:
            marca.valor, marca.fecha = valor, timezone.now()
            marca.save(update_fields=["valor", "fecha"])
        return anterior


def _resumen(texto):
    return hashlib.sha1(texto.encode(), usedforsecurity=False).hexdigest()[:16]


# ── Envío ─────────────────────────────────────────────────────────────────────────────────


def url_consola():
    """Dirección de la consola de Nico AI: ``nicoai.`` + el dominio de la web."""
    propia = getattr(settings, "NUCLEO_URL_NICO", "")
    if propia:
        return propia.rstrip("/")
    web = urlparse(settings.NUCLEO_URL_WEB)
    host = web.hostname or ""
    if not host or host in ("localhost", "127.0.0.1") or host.startswith("nicoai."):
        return settings.NUCLEO_URL_WEB.rstrip("/")
    return f"{web.scheme}://nicoai.{host}"


def _enviar_correos(envios):
    for num, correo, asunto, cuerpo in envios:
        try:
            salio = send_mail(asunto, cuerpo, settings.DEFAULT_FROM_EMAIL, [correo]) > 0
        except Exception:
            logger.exception("No se pudo enviar el aviso de Nico AI a %s", correo)
            salio = False
        if salio and num:
            NotificacionNico.objects.filter(pk=num).update(correo_enviado=True)


def _en_segundo_plano(envios):
    """El correo no retrasa la respuesta del agente: sale en un hilo aparte."""

    def correr():
        try:
            _enviar_correos(envios)
        finally:
            close_old_connections()

    threading.Thread(target=correr, daemon=True).start()


def avisar(tipo, titulo, texto="", enlace="", nivel=Nivel.INFO, en_hilo=True):
    """Crea la notificación de cada superusuario que la quiere en la campana y le manda el
    correo si lo pidió. Devuelve las notificaciones creadas. Nunca lanza excepciones."""
    try:
        creadas, envios = [], []
        for usuario in destinatarios():
            pref = preferencias(usuario)[str(tipo)]
            n = None
            if pref["consola"]:
                n = NotificacionNico.objects.create(
                    usuario=usuario,
                    tipo=tipo,
                    nivel=nivel,
                    titulo=titulo[:160],
                    texto=texto[:500],
                    enlace=enlace[:300],
                )
                creadas.append(n)
            if pref["correo"] and usuario.correo:
                enlace_completo = f"{url_consola()}{enlace or '/'}"
                cuerpo = f"{texto}\n\nÁbrelo en la consola de Nico AI: {enlace_completo}"
                envios.append((n.pk if n else None, usuario.correo, f"[Nico AI] {titulo}", cuerpo))
        if envios:
            if en_hilo and getattr(settings, "NICO_AVISOS_EN_HILO", True):
                transaction.on_commit(lambda: _en_segundo_plano(envios))
            else:
                _enviar_correos(envios)
        return creadas
    except Exception:
        logger.exception("No se pudo crear el aviso de Nico AI «%s»", titulo)
        return []


# ── Eventos del agente ────────────────────────────────────────────────────────────────────


def _lugar(registro):
    d = registro.dispositivo
    return f"{d.area.organizacion.nombre} · {d.nombre}"


def _del_superusuario(registro):
    return registro.usuario.rol_id == roles.ADMIN_PLATAFORMA


def pregunta_no_entendida(registro):
    """Pregunta nueva que Nico no entendió (una vez al día por pregunta y organización)."""
    if (registro.datos or {}).get("precarga") or _del_superusuario(registro):
        return
    org = registro.dispositivo.area.organizacion_id
    if not una_vez(f"no_entendida:{org}:{_resumen(registro.pregunta_normalizada)}", UN_DIA):
        return
    avisar(
        Tipo.NO_ENTENDIDA,
        "Nico no entendió una pregunta",
        f"«{registro.pregunta[:200]}» · {_lugar(registro)}",
        f"/registro?via=NO_ENTENDIDA&q={quote(registro.pregunta[:80])}",
        Nivel.ADVERTENCIA,
    )


def calificacion_negativa(registro):
    if _del_superusuario(registro) or not una_vez(f"negativa:{registro.pk}", 30 * UN_DIA):
        return
    avisar(
        Tipo.NEGATIVA,
        "Respuesta marcada como no útil",
        f"«{registro.pregunta[:200]}» · {_lugar(registro)}",
        f"/registro?calificacion=no&q={quote(registro.pregunta[:80])}",
        Nivel.ADVERTENCIA,
    )


def respuesta_aprendida(respuesta):
    avisar(
        Tipo.APRENDIDA,
        "El banco aprendió una respuesta",
        f"«{respuesta.pregunta[:200]}» · {respuesta.organizacion.nombre}",
        "/banco",
        Nivel.OK,
    )


# ── Vigilancia: ESP puente e IA por carga ─────────────────────────────────────────────────


def _vigilar_carga():
    from apps.reportes import carga

    suspendida = carga.ia_suspendida()
    anterior = cambio_de_estado("carga:ia", "suspendida" if suspendida else "normal")
    if anterior is None or (anterior == "suspendida") == suspendida:
        return suspendida
    mb = carga.memoria_disponible_mb()
    if suspendida:
        avisar(
            Tipo.CARGA,
            "IA de Nico suspendida por carga del servidor",
            f"Quedan {mb} MB de memoria libre (mínimo {settings.NUCLEO_AGENTE_RAM_ALTA_MB} MB). "
            "Nico sigue respondiendo con reglas y herramientas, sin la IA.",
            "/",
            Nivel.PELIGRO,
            en_hilo=False,
        )
    else:
        avisar(
            Tipo.CARGA,
            "IA de Nico reanudada",
            f"El servidor volvió a tener memoria libre ({mb} MB): Nico usa otra vez la IA.",
            "/",
            Nivel.OK,
            en_hilo=False,
        )
    return suspendida


def _vigilar_puentes():
    from apps.dispositivos.models import Dispositivo
    from apps.reportes import puente

    if not puente.habilitado():
        return
    lista = set(settings.IA_PUENTE_DISPOSITIVOS)
    dispositivos = Dispositivo.objects.select_related("area__organizacion").exclude(
        estado_dispositivo_id=roles.DISPOSITIVO_BAJA
    )
    for d in dispositivos:
        if d.codigo_mqtt not in lista and not getattr(d, "puente_ia", False):
            continue
        activo = puente.cola().activo(d.codigo_mqtt)
        anterior = cambio_de_estado(f"puente:{d.codigo_mqtt}", "activo" if activo else "inactivo")
        if anterior is None or (anterior == "activo") == activo:
            continue
        lugar = f"{d.area.organizacion.nombre} · {d.area.nombre}"
        if activo:
            avisar(
                Tipo.PUENTE,
                f"El ESP puente de {d.nombre} volvió",
                f"{lugar}: late otra vez y su agente de Nico AI está activo.",
                "/chat",
                Nivel.OK,
                en_hilo=False,
            )
        else:
            avisar(
                Tipo.PUENTE,
                f"El ESP puente de {d.nombre} dejó de latir",
                f"{lugar}: sin latido del ESP ({d.codigo_mqtt}); su agente de Nico AI queda "
                "inactivo hasta que vuelva.",
                "/chat",
                Nivel.PELIGRO,
                en_hilo=False,
            )


def vigilar():
    """Revisa la IA por carga y los ESP puente y avisa de cada cambio. Con la IA suspendida
    los puentes no se revisan (el agente no los usa) y conservan su último estado."""
    try:
        if not _vigilar_carga():
            _vigilar_puentes()
    except Exception:
        logger.exception("Falló la vigilancia de Nico AI")
