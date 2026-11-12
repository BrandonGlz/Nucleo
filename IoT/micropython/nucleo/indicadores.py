"""LED RGB de nivel, LED de Wi-Fi y buzzer activo."""

import time

from machine import Pin

try:
    from machine import PWM as _PWM
except ImportError:
    _PWM = None

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
        self._pwm = None  # pulsos del buzzer por hardware (no se congelan si el CPU está ocupado)
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

    def parpadeo(self):
        """Destello corto del LED de Wi-Fi: el ESP acaba de autorizar una petición de Nico."""
        self._wifi.value(0)
        time.sleep_ms(60)
        self._wifi.value(1)

    def wifi(self, conectado):
        self._wifi.value(1 if conectado else 0)

    def actualizar_buzzer(self):
        """Pulsos de 200 ms cada segundo mientras haya peligro. Llamar con frecuencia.

        Primero intenta generarlos con el PWM del ESP (1 Hz, 20 %): el hardware los mantiene
        aunque el procesador se ocupe un par de segundos (p. ej. al abrir una conexión TLS).
        Si la placa no admite 1 Hz, los genera este ciclo como antes."""
        if not self._peligro:
            return
        if self._pwm is None and _PWM is not None:
            try:
                ciclo = _BUZZER_ENCENDIDO_MS * 65535 // _BUZZER_PERIODO_MS
                if not config.BUZZER_ACTIVO_ALTO:
                    ciclo = 65535 - ciclo
                self._pwm = _PWM(self._buzzer, freq=1000 // _BUZZER_PERIODO_MS, duty_u16=ciclo)
            except (ValueError, OSError):
                self._pwm = False  # sin PWM lento: pulsos por software
        if self._pwm:
            return
        fase = time.ticks_ms() % _BUZZER_PERIODO_MS
        self._sonar(fase < _BUZZER_ENCENDIDO_MS)

    def _sonar(self, activo):
        if self._pwm:
            self._pwm.deinit()
            self._pwm = None
            self._buzzer = Pin(config.PIN_BUZZER, Pin.OUT)
        self._buzzer.value(activo if config.BUZZER_ACTIVO_ALTO else not activo)
