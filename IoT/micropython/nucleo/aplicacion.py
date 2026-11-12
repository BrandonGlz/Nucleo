"""Ciclo principal: leer, mostrar, alertar localmente y publicar."""

import time

from machine import WDT, SoftI2C, Pin

import config
import secrets
from nucleo.bateria import Bateria
from nucleo.cola import ColaDeEnvio
from nucleo.comunicacion import Broker
from nucleo.indicadores import APAGADO, AZUL, Indicadores
from nucleo.pantalla import Pantalla
from nucleo.red import Red
from nucleo.respaldo import RespaldoHTTPS
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
    """Un solo ciclo, con los sensores primero. Sin sensores (MODO = "puente") solo mantiene la
    red, el latido y las firmas de Nico AI."""
    perro = WDT(timeout=config.WATCHDOG_MS) if config.WATCHDOG_MS else None
    con_sensores = getattr(secrets, "MODO", "sensores") != "puente"

    indicadores = Indicadores()
    indicadores.color(AZUL)  # arrancando
    if con_sensores:
        i2c = SoftI2C(sda=Pin(config.PIN_I2C_SDA), scl=Pin(config.PIN_I2C_SCL))
        pantalla = Pantalla(i2c)
        pantalla.renglones("Nucleo", "Iniciando...")
        sensores = Sensores(i2c)
        bateria = Bateria(i2c)  # el MAX17048 comparte el bus con la pantalla y el CCS811
    else:
        indicadores.color(APAGADO)
        pantalla = sensores = None
        bateria = Bateria()
    ajustes = Ajustes()
    red = Red()
    broker = Broker(ajustes.actualizar, red, indicadores.parpadeo)
    respaldo = RespaldoHTTPS(red)
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
        en_respaldo = broker.fallos_seguidos >= config.MQTT_FALLOS_RESPALDO
        if conectada and red.sincronizar_hora():
            # El certificado se valida con la hora ya sincronizada. Si el broker no responde
            # varias veces seguidas, Nico sigue vivo por HTTPS y MQTT se reintenta más espaciado.
            broker.mantener(config.MQTT_REINTENTO_RESPALDO_SEG if en_respaldo else None)
            if en_respaldo and not broker.conectado() and respaldo.disponible():
                if respaldo.mantener():
                    indicadores.parpadeo()
        broker.revisar()
        cola.enviar(broker.publicar_lecturas)  # lecturas guardadas mientras no hubo conexión
        indicadores.actualizar_buzzer()

        ahora = time.ticks_ms()
        if sensores is not None and (
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
