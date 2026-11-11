"""Puente de Nico AI: este ESP32 lleva las peticiones de su agente a la IA local (Ollama).

Ciclo: consulta al servidor por HTTPS si hay una petición para su dispositivo (espera larga de
hasta 20 s), la envía a Ollama por la ruta /puente-ia/ del mismo servidor y devuelve la
respuesta con los tokens usados. Cada consulta le dice al servidor que este dispositivo está
activo; si el ESP se apaga o se queda sin red, su agente se deshabilita en la web y en la app.

Todo va por HTTPS validando el certificado (raíces ISRG de Let's Encrypt en isrg_raiz.pem), así
que funciona desde cualquier red con internet, sin estar en la misma red que el servidor.
"""

import gc
import json
import socket
import ssl
import time

import machine
import network
import ntptime

import secrets

RAIZ = "/nucleo/isrg_raiz.pem"
ESPERA_TOMAR = 30  # el servidor responde a más tardar en ~20 s
ESPERA_IA = 25


def _redes():
    """Redes conocidas, en orden: REDES = [(ssid, clave), ...] o la de WIFI_SSID."""
    redes = list(getattr(secrets, "REDES", []))
    if getattr(secrets, "WIFI_SSID", None):
        redes.append((secrets.WIFI_SSID, secrets.WIFI_PASSWORD))
    return redes


class Puente:
    def __init__(self):
        self.wlan = network.WLAN(network.STA_IF)
        self.wlan.active(True)
        self.host = secrets.PUENTE_HOST
        self.clave = secrets.PUENTE_CLAVE
        self.codigo = secrets.CODIGO_MQTT
        with open(RAIZ, "rb") as f:
            self.raiz = f.read()
        self.led = machine.Pin(getattr(secrets, "LED_PIN", 2), machine.Pin.OUT)
        self.atendidas = 0

    # ── Red ──────────────────────────────────────────────────────────────────────────
    def conectar(self):
        if self.wlan.isconnected():
            return True
        disponibles = set()
        try:
            disponibles = {r[0].decode() for r in self.wlan.scan()}
        except OSError:
            pass
        for ssid, clave in _redes():
            if disponibles and ssid not in disponibles:
                continue
            print("Wi-Fi: conectando a", ssid)
            self.wlan.connect(ssid, clave)
            for _ in range(80):
                if self.wlan.isconnected():
                    print("Wi-Fi: conectado", self.wlan.ifconfig()[0])
                    return True
                time.sleep_ms(250)
            self.wlan.disconnect()
        return False

    def hora(self):
        """El certificado se valida con la fecha: sin hora no se puede usar HTTPS."""
        for _ in range(5):
            try:
                ntptime.settime()
                return True
            except OSError:
                time.sleep(1)
        return False

    # ── HTTPS ────────────────────────────────────────────────────────────────────────
    def pedir(self, metodo, ruta, cuerpo=None, espera=15):
        """HTTP/1.0 sobre TLS verificado: (estado, cuerpo en bytes)."""
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else b""
        direccion = socket.getaddrinfo(self.host, 443, 0, socket.SOCK_STREAM)[0][-1]
        s = socket.socket()
        s.settimeout(espera)
        try:
            s.connect(direccion)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.verify_mode = ssl.CERT_REQUIRED
            ctx.load_verify_locations(cadata=self.raiz)
            s = ctx.wrap_socket(s, server_hostname=self.host)
            cabeza = (
                "%s %s HTTP/1.0\r\nHost: %s\r\nX-Puente-Clave: %s\r\nUser-Agent: nucleo-puente\r\n"
                "Content-Type: application/json\r\nContent-Length: %d\r\n\r\n"
                % (metodo, ruta, self.host, self.clave, len(datos))
            )
            s.write(cabeza.encode() + datos)
            partes = []
            while True:
                trozo = s.read(2048)
                if not trozo:
                    break
                partes.append(trozo)
        finally:
            s.close()
        respuesta = b"".join(partes)
        fin = respuesta.find(b"\r\n\r\n")
        estado = int(respuesta[9:12]) if respuesta[:5] == b"HTTP/" else 0
        return estado, respuesta[fin + 4 :] if fin >= 0 else b""

    # ── Ciclo ────────────────────────────────────────────────────────────────────────
    def atender(self, trabajo):
        inicio = time.ticks_ms()
        self.led.value(1)
        texto, error, entrada, salida = None, None, 0, 0
        try:
            estado, cuerpo = self.pedir(
                "POST", "/puente-ia" + trabajo["ruta"], trabajo["cuerpo"], espera=ESPERA_IA
            )
            if estado == 200:
                r = json.loads(cuerpo)
                texto = r.get("message", {}).get("content", "")
                entrada, salida = r.get("prompt_eval_count", 0), r.get("eval_count", 0)
            else:
                error = "La IA respondió %d" % estado
        except (OSError, ValueError) as e:
            error = "Sin respuesta de la IA: %s" % e
        finally:
            self.led.value(0)
        ms = time.ticks_diff(time.ticks_ms(), inicio)
        print("IA:", ms, "ms,", entrada, "+", salida, "tokens", "(error: %s)" % error if error else "")
        if trabajo.get("calentar"):
            return  # solo cargaba el modelo; nadie espera esta respuesta
        self.pedir(
            "POST",
            "/api/v1/puente/entregar/",
            {
                "dispositivo": self.codigo,
                "id": trabajo["id"],
                "texto": texto,
                "error": error,
                "tokens_entrada": entrada,
                "tokens_salida": salida,
            },
        )
        self.atendidas += 1

    def ejecutar(self):
        perro = machine.WDT(timeout=120000)  # si algo se cuelga, el ESP se reinicia solo
        while not self.conectar():
            perro.feed()
            time.sleep(5)
        while not self.hora():
            perro.feed()
            time.sleep(5)
        print("Puente de Nico AI listo para", self.codigo, "en", self.host)
        fallos = 0
        while True:
            perro.feed()
            gc.collect()
            if not self.conectar():
                time.sleep(3)
                continue
            try:
                estado, cuerpo = self.pedir(
                    "GET", "/api/v1/puente/tomar/?dispositivo=" + self.codigo, espera=ESPERA_TOMAR
                )
                fallos = 0
                if estado == 200:
                    self.atender(json.loads(cuerpo))
                elif estado != 204:
                    print("Servidor:", estado, cuerpo[:120])
                    time.sleep(5)
            except (OSError, ValueError) as e:
                fallos += 1
                print("Error de red:", e)
                time.sleep(min(30, 2 * fallos))
                if fallos >= 10:
                    machine.reset()


def ejecutar():
    Puente().ejecutar()
