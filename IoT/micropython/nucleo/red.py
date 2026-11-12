"""Wi-Fi con redes de respaldo y hora por NTP, sin bloquear el ciclo de los sensores.

Cada llamada a ``mantener()`` avanza un paso: buscar redes, conectar a la de mejor señal o
esperar. Entre rondas fallidas espera cada vez más (15 s, 30 s… hasta 5 min): las redes
institucionales bloquean un rato al equipo que reintenta sin parar. Guarda la causa de cada
falla para el diagnóstico que viaja al servidor.
"""

import gc
import time

import network
import ntptime

import config
import secrets

# Estados de network.WLAN.status() al fallar la conexión, para el diagnóstico.
ESTADOS_WIFI = {
    200: "senal_perdida",
    201: "red_no_encontrada",
    202: "autenticacion_rechazada",
    203: "asociacion_rechazada",
    204: "handshake_sin_respuesta",
    1001: "sin_respuesta",
}
HORA_SERVIDORES = ("pool.ntp.org", "time.cloudflare.com", "time.windows.com", "time.google.com")
_ESTADOS_FALLA = (200, 201, 202, 203, 204)


def redes_conocidas():
    """En orden de preferencia: REDES = [(ssid, clave), ...] y al final WIFI_SSID."""
    redes = list(getattr(secrets, "REDES", []))
    if getattr(secrets, "WIFI_SSID", None):
        redes.append((secrets.WIFI_SSID, secrets.WIFI_PASSWORD))
    return redes


def _limpio(texto):
    texto = str(texto)
    for c in ";=\r\n":
        texto = texto.replace(c, " ")
    return texto[:50]


class Red:
    def __init__(self):
        self._wlan = network.WLAN(network.STA_IF)
        self._wlan.active(True)
        try:
            # Sin ahorro de energía: con señal débil la asociación falla menos.
            self._wlan.config(pm=network.WLAN.PM_NONE)
        except (AttributeError, ValueError, OSError):
            pass
        self._pendientes = []  # redes por intentar en esta ronda: (ssid, clave, bssid)
        self._intento = None  # (ssid, inicio_ms) mientras conecta
        self._espera_hasta = None
        self._rondas = 0
        self._hora_sincronizada = False
        self._hora_intento = None
        self._hora_turno = 0
        self.red = ""
        self.reconexiones = 0
        self.falla = "ninguna"

    def conectada(self):
        return self._wlan.isconnected()

    def mantener(self):
        """Un paso de la conexión; nunca espera más que un escaneo (~2 s)."""
        ahora = time.ticks_ms()
        if self._wlan.isconnected():
            if self._intento:
                self.red = self._intento[0]
                self.reconexiones += 1
                self._rondas = 0
                self._intento = None
                print("Wi-Fi: conectado a", self.red, self._wlan.ifconfig()[0])
            return
        if self._intento:
            ssid, inicio = self._intento
            estado = self._wlan.status()
            transcurrido = time.ticks_diff(ahora, inicio)
            # Un rechazo (p. ej. 202 con señal débil) no se espera completo: se pasa al
            # siguiente intento, que suele entrar a la primera.
            fallo = estado in _ESTADOS_FALLA and transcurrido >= 8000
            if not fallo and transcurrido < config.WIFI_INTENTO_SEG * 1000:
                return
            self.falla = "wifi_%s_%s" % (ESTADOS_WIFI.get(estado, estado), ssid)
            self._wlan.disconnect()
            self._intento = None
        if self._espera_hasta is not None and time.ticks_diff(self._espera_hasta, ahora) > 0:
            return
        self._espera_hasta = None
        if not self._pendientes:
            if not self._buscar():
                self._pausa()
                return
        ssid, clave, bssid = self._pendientes.pop(0)
        print("Wi-Fi: conectando a", ssid)
        try:
            if bssid:
                self._wlan.connect(ssid, clave, bssid=bssid)
            else:
                self._wlan.connect(ssid, clave)
            self._intento = (ssid, ahora)
        except OSError as e:
            self.falla = "wifi_%s" % e
        if not self._pendientes and not self._intento:
            self._pausa()

    def _buscar(self):
        """Arma la ronda: redes conocidas visibles, cada una con su punto de acceso más fuerte.
        Antes reinicia la interfaz (tras fallar puede quedarse atorada en el estado 202)."""
        self._wlan.active(False)
        time.sleep_ms(200)
        self._wlan.active(True)
        mejores = {}
        try:
            for r in self._wlan.scan():
                ssid = r[0].decode()
                if ssid not in mejores or r[3] > mejores[ssid][0]:
                    mejores[ssid] = (r[3], r[1])
        except OSError:
            pass
        gc.collect()
        # Cada red: primero su punto de acceso más fuerte y, si falla, la que elija el driver
        # (con señal débil el más fuerte del escaneo no siempre acepta).
        self._pendientes = []
        for ssid, clave in redes_conocidas():
            if ssid in mejores:
                self._pendientes.append((ssid, clave, mejores[ssid][1]))
                self._pendientes.append((ssid, clave, None))
        if not mejores:
            self.falla = "wifi_sin_redes_visibles"
        elif not self._pendientes:
            self.falla = "wifi_ninguna_red_conocida_visible"
        return bool(self._pendientes)

    def _pausa(self):
        self._rondas += 1
        espera = min(300, 15 * 2 ** min(self._rondas - 1, 5))
        print("Wi-Fi: sin red, nuevo intento en", espera, "s")
        self._espera_hasta = time.ticks_add(time.ticks_ms(), espera * 1000)

    def rssi(self):
        try:
            return self._wlan.status("rssi")
        except (OSError, ValueError, TypeError):
            return ""

    def diagnostico(self, extra=""):
        """``clave=valor;...``: lo guarda el servidor para separar fallas de red y del ESP."""
        return "red=%s;rssi=%s;rec=%d;falla=%s;mem=%d;up=%d%s" % (
            _limpio(self.red),
            self.rssi(),
            self.reconexiones,
            _limpio(self.falla),
            gc.mem_free(),
            time.ticks_ms() // 1000,
            extra,
        )

    def sincronizar_hora(self):
        """Ajusta el reloj a UTC (hace falta para validar certificados y fechar lecturas).
        Prueba un servidor por llamada, como mucho cada 5 s, con 2 s de espera."""
        if self._hora_sincronizada:
            return True
        ahora = time.ticks_ms()
        if self._hora_intento is not None and time.ticks_diff(ahora, self._hora_intento) < 5000:
            return False
        self._hora_intento = ahora
        ntptime.host = HORA_SERVIDORES[self._hora_turno % len(HORA_SERVIDORES)]
        ntptime.timeout = 2
        self._hora_turno += 1
        try:
            ntptime.settime()
            self._hora_sincronizada = True
        except OSError:
            if self._hora_turno % len(HORA_SERVIDORES) == 0:
                self.falla = "red_sin_salida_ntp_%s" % self.red
        return self._hora_sincronizada

    def hora_iso(self):
        """Hora UTC en ISO 8601, o None si todavía no se sincroniza."""
        if not self._hora_sincronizada:
            return None
        a, mes, d, h, mi, s = time.gmtime()[:6]
        return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (a, mes, d, h, mi, s)
