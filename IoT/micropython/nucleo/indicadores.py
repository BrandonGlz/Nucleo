"""LED RGB de nivel, LED de Wi-Fi y buzzer activo."""

import time

from machine import Pin

import config
from nucleo.umbrales import ADVERTENCIA, NORMAL, PELIGRO

# Colores (rojo, verde, azul): verde normal, amarillo advertencia, rojo peligro.
_COLORES = {
    NORMAL: (0, 1, 0),
    ADVERTENCIA: (1, 1, 0),
    PELIGRO: (1, 0, 0),
}
AZUL = (0, 0, 1)
APAGADO = (0, 0, 0)

_BUZZER_ENCENDIDO_MS = 200
_BUZZER_PERIODO_MS = 1000


class Indicadores:
    def __init__(self):
        self._rgb = [
            Pin(config.PIN_RGB_ROJO, Pin.OUT),
            Pin(config.PIN_RGB_VERDE, Pin.OUT),
            Pin(config.PIN_RGB_AZUL, Pin.OUT),
        ]
        self._wifi = Pin(config.PIN_LED_WIFI, Pin.OUT)
        self._buzzer = Pin(config.PIN_BUZZER, Pin.OUT)
        self._peligro = False
        self.color(APAGADO)
        self.wifi(False)
        self._sonar(False)

    def color(self, rgb):
        for pin, encendido in zip(self._rgb, rgb):
            pin.value(encendido if config.RGB_ACTIVO_ALTO else not encendido)

    def nivel(self, nivel):
        self.color(_COLORES[nivel])
        self._peligro = nivel == PELIGRO
        if not self._peligro:
            self._sonar(False)

    def wifi(self, conectado):
        self._wifi.value(1 if conectado else 0)

    def actualizar_buzzer(self):
        """Pulsos de 200 ms cada segundo mientras haya peligro. Llamar con frecuencia."""
        if self._peligro:
            fase = time.ticks_ms() % _BUZZER_PERIODO_MS
            self._sonar(fase < _BUZZER_ENCENDIDO_MS)

    def _sonar(self, activo):
        self._buzzer.value(activo if config.BUZZER_ACTIVO_ALTO else not activo)
