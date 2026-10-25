"""Ciclo principal: leer, mostrar, alertar localmente y publicar."""

import time

from machine import WDT, SoftI2C, Pin

import config
import secrets
from nucleo.bateria import Bateria
from nucleo.cola import ColaDeEnvio
from nucleo.comunicacion import Broker
from nucleo.indicadores import AZUL, Indicadores
from nucleo.pantalla import Pantalla
from nucleo.red import Red
from nucleo.sensores import Sensores
from nucleo.umbrales import NORMAL, Ajustes

_PAUSA_MS = 100


def _construir_mensaje(red, sensores, lecturas, estabilizado, bateria):
    mensaje = {
        "dispositivo": secrets.CODIGO_MQTT,
        "aire_estabilizado": estabilizado,
        "lecturas": [
            {"sensor": sensores.modelo_de(variable), "variable": variable, "valor": valor}
            for variable, valor in lecturas.items()
        ],
    }
    fecha_hora = red.hora_iso()
    if fecha_hora:
        mensaje["fecha_hora"] = fecha_hora  # sin hora válida, el backend usa la de recepción
    if bateria is not None:
        mensaje["bateria"] = bateria
    return mensaje


def _nivel_local(ajustes, lecturas, estabilizado):
    """Peor nivel de las lecturas; el aire no cuenta mientras se calienta el CCS811."""
    peor = NORMAL
    for variable, valor in lecturas.items():
        if variable == "AIRE" and not estabilizado:
            continue
        peor = max(peor, ajustes.nivel(variable, valor))
    return peor


def ejecutar():
    perro = WDT(timeout=config.WATCHDOG_MS) if config.WATCHDOG_MS else None

    indicadores = Indicadores()
    indicadores.color(AZUL)  # arrancando
    i2c = SoftI2C(sda=Pin(config.PIN_I2C_SDA), scl=Pin(config.PIN_I2C_SCL))
    pantalla = Pantalla(i2c)
    pantalla.renglones("Nucleo", "Iniciando...")

    sensores = Sensores(i2c)
    ajustes = Ajustes()
    bateria = Bateria()
    red = Red()
    broker = Broker(ajustes.actualizar)
    cola = ColaDeEnvio()

    lecturas = {}
    nivel = NORMAL
    ultimo_muestreo = None

    while True:
        if perro:
            perro.feed()

        red.mantener()
        conectada = red.conectada()
        indicadores.wifi(conectada)
        if conectada and red.sincronizar_hora():
            broker.mantener()  # el certificado se valida con la hora ya sincronizada
        broker.revisar()
        cola.enviar(broker.publicar_lecturas)  # lecturas guardadas mientras no hubo conexión
        indicadores.actualizar_buzzer()

        ahora = time.ticks_ms()
        if (
            ultimo_muestreo is None
            or time.ticks_diff(ahora, ultimo_muestreo) >= ajustes.intervalo_seg * 1000
        ):
            ultimo_muestreo = ahora
            lecturas = sensores.leer()
            estabilizado = sensores.aire_estabilizado()
            nivel = _nivel_local(ajustes, lecturas, estabilizado)
            indicadores.nivel(nivel)  # alerta local aunque no haya conexión (SRS 3.2.7)
            porcentaje = bateria.porcentaje()
            if lecturas or porcentaje is not None:
                mensaje = _construir_mensaje(red, sensores, lecturas, estabilizado, porcentaje)
                if "fecha_hora" in mensaje or broker.conectado():
                    cola.agregar(mensaje)
                    cola.enviar(broker.publicar_lecturas)
            pantalla.lecturas(
                lecturas,
                nivel,
                conectada,
                broker.conectado(),
                sensores.calentamiento_restante_seg(),
                porcentaje,
            )

        time.sleep_ms(_PAUSA_MS)
