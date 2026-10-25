"""Ingesta de lecturas recibidas por MQTT.

Formato del mensaje que publica el dispositivo en ``nucleo/devices/<codigo_mqtt>/measurements``::

    {
        "dispositivo": "NUC-001",
        "fecha_hora": "2026-10-24T08:30:00-07:00",
        "bateria": 87,
        "aire_estabilizado": true,
        "lecturas": [
            {"sensor": "DHT22", "variable": "TEMP", "valor": 26.4},
            {"sensor": "DHT22", "variable": "HUM", "valor": 48.0},
            {"sensor": "CCS811", "variable": "AIRE", "valor": 612}
        ]
    }

``fecha_hora``, ``bateria`` y ``aire_estabilizado`` son opcionales: sin fecha se usa la hora
de recepción y sin indicador se considera que el aire ya está estabilizado. Si un valor es
inválido se descarta y las demás lecturas del mensaje se guardan.

Secuencia (SRS 3.2.6): las lecturas válidas se insertan en ``nucleo_iot``; en ``nucleo_db`` se
actualiza el dispositivo; cada lectura estabilizada se compara con el umbral activo y, si
entra en Advertencia o Peligro, se registran la alerta y sus notificaciones en una sola
transacción.
"""

import json
import logging
import math
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.alertas.services import generar_alerta
from apps.catalogos.models import VariableAmbiental
from apps.dispositivos.models import Dispositivo
from apps.mediciones.models import Lectura
from apps.tiempo_real import eventos
from common import roles

logger = logging.getLogger(__name__)

CENTESIMAS = Decimal("0.01")
CALENTAMIENTO = timedelta(minutes=20)


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
    return fecha


def _bateria(valor):
    if valor is None:
        return None
    if isinstance(valor, bool) or not isinstance(valor, int) or not 0 <= valor <= 100:
        return None
    return valor


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

    with transaction.atomic(using="iot"):
        resultado.lecturas = Lectura.objects.bulk_create(nuevas)

    cambios = {
        "ultima_conexion": recibida,
        "estado_dispositivo_id": _estado_tras_mensaje(
            dispositivo,
            bateria if bateria is not None else dispositivo.nivel_bateria,
            aire_estabilizado,
        ),
    }
    if bateria is not None:
        cambios["nivel_bateria"] = bateria
    if _inicia_calentamiento(dispositivo, aire_estabilizado, recibida):
        cambios["ultimo_arranque"] = recibida
    estado_anterior = dispositivo.estado_dispositivo_id
    Dispositivo.objects.filter(pk=dispositivo.pk).update(**cambios)
    if cambios["estado_dispositivo_id"] != estado_anterior:
        for campo, valor in cambios.items():
            setattr(dispositivo, campo, valor)
        eventos.estado_dispositivo(dispositivo)

    # Cada alerta se registra con sus notificaciones en su propia transacción.
    for lectura in resultado.lecturas:
        umbral = umbrales.get(lectura.variable_codigo)
        if umbral is None or not lectura.estabilizada:
            continue
        alerta = generar_alerta(umbral, lectura)
        if alerta is not None:
            resultado.alertas.append(alerta)
    return resultado


def procesar_crudo(crudo):
    """Atajo para el consumidor MQTT: JSON en bruto a ``ResultadoIngesta``."""
    return procesar_mensaje(interpretar(crudo))


__all__ = ["MensajeInvalido", "ResultadoIngesta", "procesar_crudo", "procesar_mensaje"]
