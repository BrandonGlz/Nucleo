"""Conexión Wi-Fi y hora por NTP."""

import time

import network
import ntptime

import config
import secrets


class Red:
    def __init__(self):
        self._wlan = network.WLAN(network.STA_IF)
        self._wlan.active(True)
        self._ultimo_intento = None
        self._hora_sincronizada = False

    def conectada(self):
        return self._wlan.isconnected()

    def mantener(self):
        """Inicia la conexión sin bloquear y la reintenta cada WIFI_REINTENTO_SEG."""
        if self._wlan.isconnected():
            return
        ahora = time.ticks_ms()
        if (
            self._ultimo_intento is None
            or time.ticks_diff(ahora, self._ultimo_intento) >= config.WIFI_REINTENTO_SEG * 1000
        ):
            self._ultimo_intento = ahora
            self._wlan.disconnect()
            self._wlan.connect(secrets.WIFI_SSID, secrets.WIFI_PASSWORD)

    def sincronizar_hora(self):
        """Ajusta el reloj a UTC. Se necesita para validar el certificado y fechar lecturas."""
        if self._hora_sincronizada:
            return True
        try:
            ntptime.settime()
            self._hora_sincronizada = True
        except OSError:
            pass
        return self._hora_sincronizada

    def hora_iso(self):
        """Hora UTC en ISO 8601, o None si todavía no se sincroniza."""
        if not self._hora_sincronizada:
            return None
        a, mes, d, h, mi, s = time.gmtime()[:6]
        return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (a, mes, d, h, mi, s)
