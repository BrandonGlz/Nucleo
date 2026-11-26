"""LED RGB de nivel, LED de Wi-Fi y buzzer activo."""

import time

from machine import Pin

try:
    from esp32 import RMT as _RMT
except ImportError:
    _RMT = None

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
# El RMT repite el patrón en tramos de 100 ms (2 encendidos + 8 apagados). Con el divisor 255
# cada tick dura 3.19 µs y un tramo cabe en el máximo de un pulso (32767 ticks, ~104 ms).
_RMT_DIVISOR = 255
_RMT_TRAMO_MS = 100


class Indicadores:
    def __init__(self):
        self._rgb = [
            Pin(config.PIN_RGB_ROJO, Pin.OUT),
            Pin(config.PIN_RGB_VERDE, Pin.OUT),
            Pin(config.PIN_RGB_AZUL, Pin.OUT),
        ]
        self._wifi = Pin(config.PIN_LED_WIFI, Pin.OUT)
        self._buzzer = Pin(config.PIN_BUZZER, Pin.OUT)
        self._rmt = None  # pulsos del buzzer por hardware (no se congelan si el CPU está ocupado)
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

        Primero intenta generarlos con el RMT del ESP en bucle: el hardware los mantiene aunque
        el procesador se ocupe un par de segundos (p. ej. al abrir una conexión TLS). Si la placa
        no lo permite, los genera este ciclo por software.

        No se usa el PWM: en la S3 el LEDC no baja de ~2 Hz y un PWM a 1 Hz falla
        («ledc: freq_hz=1 duty_resolution=0») dejando el canal a medias; el siguiente reinicio
        suave (el que hace mpremote) truena con «NLR jump failed» y reinicia la placa."""
        if not self._peligro:
            return
        if self._rmt is None:
            self._rmt = self._crear_rmt()
        if self._rmt:
            return
        fase = time.ticks_ms() % _BUZZER_PERIODO_MS
        self._sonar(fase < _BUZZER_ENCENDIDO_MS)

    def apagar(self):
        """Silencia el buzzer y suelta el RMT; se llama al salir del programa (Ctrl-C o error)."""
        self._peligro = False
        try:
            self._sonar(False)
        except Exception:  # noqa: BLE001  nunca debe tapar el KeyboardInterrupt que sale
            pass

    def _crear_rmt(self):
        """RMT en bucle con el patrón del buzzer, o False si no hay (pulsos por software)."""
        if _RMT is None:
            return False
        rmt = None
        try:
            tramo = _RMT.source_freq() // _RMT_DIVISOR * _RMT_TRAMO_MS // 1000
            if not 0 < tramo <= _RMT.PULSE_MAX:
                return False
            encendidos = _BUZZER_ENCENDIDO_MS // _RMT_TRAMO_MS
            alto = 1 if config.BUZZER_ACTIVO_ALTO else 0
            niveles = [
                alto if i < encendidos else 1 - alto
                for i in range(_BUZZER_PERIODO_MS // _RMT_TRAMO_MS)
            ]
            rmt = _RMT(0, pin=self._buzzer, clock_div=_RMT_DIVISOR, idle_level=not alto)
            rmt.loop(True)
            rmt.write_pulses([tramo] * len(niveles), niveles)
            return rmt
        except Exception:  # noqa: BLE001  sin RMT el buzzer sigue sonando por software
            if rmt is not None:
                try:
                    rmt.deinit()
                except Exception:  # noqa: BLE001
                    pass
            self._buzzer = Pin(config.PIN_BUZZER, Pin.OUT)
            return False

    def _sonar(self, activo):
        if self._rmt:
            self._rmt.deinit()
            self._rmt = None
            self._buzzer = Pin(config.PIN_BUZZER, Pin.OUT)
        self._buzzer.value(activo if config.BUZZER_ACTIVO_ALTO else not activo)
