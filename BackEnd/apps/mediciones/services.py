"""Ingesta de lecturas recibidas por MQTT.

Formato del mensaje que publica el dispositivo en ``nucleo/devices/<codigo_mqtt>/measurements``::

    {
        "dispositivo": "NUC-001",
        "fecha_hora": "2026-10-24T08:30:00-07:00",
        "bateria": 87,
        "bateria_v": 3.912,
        "intervalo_seg": 60,
        "aire_estabilizado": true,
        "lecturas": [
            {"sensor": "DHT22", "variable": "TEMP", "valor": 26.4},
            {"sensor": "DHT22", "variable": "HUM", "valor": 48.0},
            {"sensor": "CCS811", "variable": "AIRE", "valor": 612}
        ]
    }

``fecha_hora``, ``bateria`` y ``aire_estabilizado`` son opcionales: sin fecha se usa la hora
de recepción y sin indicador se considera que el aire ya está estabilizado. Sin ``bateria``
(el ESP no tiene medidor o no responde) el nivel queda vacío: así no se muestra uno viejo.
``bateria_v`` (voltaje de la celda) e ``intervalo_seg`` (el intervalo que el ESP usa de verdad)
también son opcionales; los mandan los firmwares desde 1.1.5. Si el intervalo informado no es
el de la plataforma, el ESP no recibió su configuración: se vuelve a publicar (como mucho una
vez cada ``REENVIO_CONFIG``) y, mientras tanto, «Sin conexión» se calcula con el más largo.
Si un valor es inválido se descarta y las demás lecturas del mensaje se guardan.

Secuencia (SRS 3.2.6): las lecturas válidas se insertan en ``nucleo_iot``; en ``nucleo_db`` se
actualiza el dispositivo; cada lectura estabilizada se compara con el umbral activo y, si
entra en Advertencia o Peligro, se registran la alerta y sus notificaciones en una sola
transacción.

Lecturas rezagadas: sin conexión, el ESP guarda sus mensajes (en memoria o en la microSD, días
de lecturas) y los manda al volver, con la hora en que midió. Se guardan con esa hora; si una
de ellas genera una alerta y tiene más de ``RETRASO_AVISO``, la alerta queda registrada pero
no se manda correo ni push (sería un aviso de algo que ya pasó). Un mensaje que llega dos veces
no duplica lecturas, y una ``fecha_hora`` más de ``LIMITE_FUTURO`` adelantada (reloj del ESP
desfasado) descarta el mensaje.
"""

import json
import logging
import math
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.alertas.services import generar_alerta
from apps.avisos import servicios as avisos
from apps.catalogos.models import VariableAmbiental
from apps.dispositivos.models import Dispositivo
from apps.mediciones.models import Lectura
from apps.tiempo_real import eventos
from common import roles

logger = logging.getLogger(__name__)

CENTESIMAS = Decimal("0.01")
CALENTAMIENTO = timedelta(minutes=20)
RETRASO_AVISO = timedelta(minutes=10)
LIMITE_FUTURO = timedelta(minutes=5)
REENVIO_CONFIG = timedelta(minutes=5)
MILESIMAS = Decimal("0.001")


class MensajeInvalido(Exception):
    """El mensaje no se puede procesar y se descarta completo."""


@dataclass
class ResultadoIngesta:
    dispositivo: Dispositivo
    lecturas: list = field(default_factory=list)
    alertas: list = field(default_factory=list)
    descartadas: list = field(default_factory=list)


def _decimal(valor):
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise ValueError("El valor debe ser numérico.")
    if isinstance(valor, float) and not math.isfinite(valor):
        raise ValueError("El valor no es un número finito.")
    return Decimal(str(valor)).quantize(CENTESIMAS, rounding=ROUND_HALF_UP)


def _fecha_medicion(valor, recibida):
    if valor in (None, ""):
        return recibida
    fecha = parse_datetime(valor) if isinstance(valor, str) else None
    if fecha is None:
        raise MensajeInvalido("fecha_hora no tiene formato ISO 8601.")
    if timezone.is_naive(fecha):
        fecha = timezone.make_aware(fecha)
    if fecha > recibida + LIMITE_FUTURO:
        raise MensajeInvalido(
            f"fecha_hora {valor} está en el futuro: el reloj del dispositivo está desfasado."
        )
    return fecha


def _bateria(valor):
    if valor is None:
        return None
    if isinstance(valor, bool) or not isinstance(valor, int) or not 0 <= valor <= 100:
        return None
    return valor


def _voltaje(valor):
    """Voltaje de la celda en V; fuera de lo posible para una LiPo (o mal tipado), vacío."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not math.isfinite(valor):
        return None
    if not 2.0 <= valor <= 5.0:
        return None
    return Decimal(str(valor)).quantize(MILESIMAS, rounding=ROUND_HALF_UP)


def _intervalo(valor):
    if isinstance(valor, bool) or not isinstance(valor, int) or not 1 <= valor <= 3600:
        return None
    return valor


def _reenviar_configuracion_si_difiere(dispositivo, intervalo):
    """El ESP mide con otro intervalo que el de la plataforma: no le llegó la configuración."""
    if intervalo is None or intervalo == dispositivo.intervalo_muestreo_seg:
        return
    if not settings.MQTT_PUBLICAR_CONFIG:
        return
    clave = f"config-reenviada:{dispositivo.codigo_mqtt}"
    if not cache.add(clave, 1, int(REENVIO_CONFIG.total_seconds())):
        return
    from apps.mediciones.mqtt import publicar_configuracion

    logger.warning(
        "%s mide cada %d s y la plataforma dice %d s: se reenvía su configuración",
        dispositivo.codigo_mqtt,
        intervalo,
        dispositivo.intervalo_muestreo_seg,
    )
    publicar_configuracion(dispositivo)


def _aire_estabilizado(valor):
    if valor is None:
        return True
    if not isinstance(valor, bool):
        raise MensajeInvalido("aire_estabilizado debe ser verdadero o falso.")
    return valor


def interpretar(crudo):
    """Convierte los bytes del mensaje en un diccionario o lanza ``MensajeInvalido``."""
    try:
        datos = json.loads(crudo)
    except (TypeError, ValueError):
        raise MensajeInvalido("El mensaje no es JSON válido.") from None
    if not isinstance(datos, dict):
        raise MensajeInvalido("El mensaje debe ser un objeto JSON.")
    return datos


def _estado_tras_mensaje(dispositivo, bateria, aire_estabilizado):
    if dispositivo.estado_dispositivo_id == roles.DISPOSITIVO_MANTENIMIENTO:
        return roles.DISPOSITIVO_MANTENIMIENTO
    if not aire_estabilizado:
        return roles.DISPOSITIVO_CALENTANDO
    if bateria is not None and bateria <= settings.NUCLEO_BATERIA_BAJA_PCT:
        return roles.DISPOSITIVO_BATERIA_BAJA
    return roles.DISPOSITIVO_EN_LINEA


def _inicia_calentamiento(dispositivo, aire_estabilizado, recibida):
    """``True`` si el mensaje es el primero de un nuevo calentamiento del CCS811."""
    if aire_estabilizado or dispositivo.estado_dispositivo_id == roles.DISPOSITIVO_CALENTANDO:
        return False
    return (
        dispositivo.ultimo_arranque is None
        or recibida - dispositivo.ultimo_arranque > CALENTAMIENTO
    )


def procesar_mensaje(datos):
    """Valida el mensaje, guarda sus lecturas y genera las alertas que correspondan."""
    codigo = datos.get("dispositivo")
    if not isinstance(codigo, str) or not codigo:
        raise MensajeInvalido("Falta el código del dispositivo.")
    entradas = datos.get("lecturas")
    if not isinstance(entradas, list):
        raise MensajeInvalido("lecturas debe ser una lista.")

    try:
        dispositivo = Dispositivo.objects.select_related("area", "operador").get(codigo_mqtt=codigo)
    except Dispositivo.DoesNotExist:
        raise MensajeInvalido(f"Dispositivo desconocido: {codigo}.") from None
    if dispositivo.estado_dispositivo_id == roles.DISPOSITIVO_BAJA:
        raise MensajeInvalido(f"El dispositivo {codigo} está dado de baja.")

    recibida = timezone.now()
    fecha_mensaje = _fecha_medicion(datos.get("fecha_hora"), recibida)
    bateria = _bateria(datos.get("bateria"))
    voltaje = _voltaje(datos.get("bateria_v"))
    intervalo = _intervalo(datos.get("intervalo_seg"))
    # Un mensaje rezagado (guardado sin conexión) trae el intervalo de entonces: no cuenta.
    al_dia = recibida - fecha_mensaje <= RETRASO_AVISO
    aire_estabilizado = _aire_estabilizado(datos.get("aire_estabilizado"))

    resultado = ResultadoIngesta(dispositivo=dispositivo)
    sensores = {s.modelo: s for s in dispositivo.sensores.all()}
    variables = {v.codigo: v for v in VariableAmbiental.objects.all()}
    umbrales = {u.variable_id: u for u in dispositivo.umbrales.filter(activo=True)}

    nuevas = []
    for entrada in entradas:
        try:
            if not isinstance(entrada, dict):
                raise ValueError("La lectura debe ser un objeto.")
            sensor = sensores.get(entrada.get("sensor"))
            if sensor is None:
                raise ValueError(f"Sensor no registrado: {entrada.get('sensor')!r}.")
            if sensor.estado_sensor_id == roles.SENSOR_FALLA:
                raise ValueError(f"El sensor {sensor.modelo} está en falla.")
            variable = variables.get(entrada.get("variable"))
            if variable is None:
                raise ValueError(f"Variable desconocida: {entrada.get('variable')!r}.")
            valor = _decimal(entrada.get("valor"))
            if not variable.rango_min <= valor <= variable.rango_max:
                raise ValueError(
                    f"{variable.codigo}={valor} fuera del rango físico "
                    f"{variable.rango_min}..{variable.rango_max}."
                )
            nuevas.append(
                Lectura(
                    sensor_num=sensor.pk,
                    variable_codigo=variable.codigo,
                    valor=valor,
                    fecha_hora=fecha_mensaje,
                    # Solo la calidad del aire pasa por el calentamiento del CCS811.
                    estabilizada=aire_estabilizado or variable.codigo != roles.VARIABLE_AIRE,
                )
            )
        except ValueError as error:
            resultado.descartadas.append(str(error))
            logger.warning("Lectura descartada de %s: %s", codigo, error)

    # Un mensaje reenviado (el ESP no supo si llegó) trae lecturas ya guardadas: no se duplican.
    if nuevas:
        ya_guardadas = set(
            Lectura.objects.filter(
                sensor_num__in={n.sensor_num for n in nuevas}, fecha_hora=fecha_mensaje
            ).values_list("sensor_num", "variable_codigo")
        )
        repetidas = [n for n in nuevas if (n.sensor_num, n.variable_codigo) in ya_guardadas]
        for n in repetidas:
            resultado.descartadas.append(
                f"{n.variable_codigo} del {fecha_mensaje.isoformat()} ya estaba guardada."
            )
        nuevas = [n for n in nuevas if (n.sensor_num, n.variable_codigo) not in ya_guardadas]

    with transaction.atomic(using="iot"):
        resultado.lecturas = Lectura.objects.bulk_create(nuevas)

    cambios = {
        "ultima_conexion": recibida,
        "estado_dispositivo_id": _estado_tras_mensaje(dispositivo, bateria, aire_estabilizado),
        "nivel_bateria": bateria,
        "voltaje_bateria": voltaje,
    }
    if al_dia:
        cambios["intervalo_reportado_seg"] = intervalo
    if _inicia_calentamiento(dispositivo, aire_estabilizado, recibida):
        cambios["ultimo_arranque"] = recibida
    estado_anterior = dispositivo.estado_dispositivo_id
    Dispositivo.objects.filter(pk=dispositivo.pk).update(**cambios)
    if cambios["estado_dispositivo_id"] != estado_anterior:
        for campo, valor in cambios.items():
            setattr(dispositivo, campo, valor)
        eventos.estado_dispositivo(dispositivo)
        # Avisos de la campana: reconexión tras «Sin conexión» y batería baja.
        nuevo = cambios["estado_dispositivo_id"]
        if estado_anterior == roles.DISPOSITIVO_SIN_CONEXION:
            avisos.dispositivo_reconectado(dispositivo)
        if nuevo == roles.DISPOSITIVO_BATERIA_BAJA:
            avisos.dispositivo_bateria_baja(dispositivo)

    if al_dia:
        _reenviar_configuracion_si_difiere(dispositivo, intervalo)

    # Cada alerta se registra con sus notificaciones en su propia transacción.
    for lectura in resultado.lecturas:
        umbral = umbrales.get(lectura.variable_codigo)
        if umbral is None or not lectura.estabilizada:
            continue
        # Rezagada (llegó al reconectar): se registra, pero sin correo ni push.
        avisar = recibida - lectura.fecha_hora <= RETRASO_AVISO
        alerta = generar_alerta(umbral, lectura, avisar=avisar)
        if alerta is not None:
            resultado.alertas.append(alerta)
    return resultado


def procesar_crudo(crudo):
    """Atajo para el consumidor MQTT: JSON en bruto a ``ResultadoIngesta``."""
    return procesar_mensaje(interpretar(crudo))


__all__ = ["MensajeInvalido", "ResultadoIngesta", "procesar_crudo", "procesar_mensaje"]
