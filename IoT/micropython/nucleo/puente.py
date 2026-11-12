"""Puente de Nico AI: este ESP32 lleva las peticiones de su agente a la IA local (Ollama).

Ciclo: consulta al servidor por HTTPS si hay una petición para su dispositivo (espera larga de
hasta 12 s), la envía a Ollama por la ruta /puente-ia/ del mismo servidor y devuelve la
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
ABRIR_SEG = 10  # tope para abrir la conexión y el TLS
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
        self.sock = self.crudo = None
        self.perro = None  # watchdog: se alimenta también mientras busca red

    # ── Red ──────────────────────────────────────────────────────────────────────────
    def conectar(self):
        if self.wlan.isconnected():
            return True
        # Tras un intento fallido la interfaz puede quedarse atorada (estado 202 sin fin):
        # se apaga y enciende antes de buscar de nuevo.
        self.wlan.active(False)
        time.sleep_ms(300)
        self.wlan.active(True)
        self._sin_ahorro()
        mejores = {}  # ssid -> (señal, bssid) del punto de acceso más fuerte
        try:
            for r in self.wlan.scan():
                ssid = r[0].decode()
                if ssid not in mejores or r[3] > mejores[ssid][0]:
                    mejores[ssid] = (r[3], r[1])
        except OSError:
            pass
        for ssid, clave in _redes():
            if mejores and ssid not in mejores:
                continue
            senal, bssid = mejores.get(ssid, (None, None))
            print("Wi-Fi: conectando a", ssid, senal if senal is not None else "")
            try:
                # Con varios puntos de acceso de la misma red, se elige el de mejor señal.
                self.wlan.connect(ssid, clave, bssid=bssid) if bssid else self.wlan.connect(ssid, clave)
            except OSError as e:
                print("Wi-Fi:", e)
                continue
            # Hasta 20 s por red.
            for _ in range(80):
                if self.perro:
                    self.perro.feed()
                if self.wlan.isconnected():
                    print("Wi-Fi: conectado", self.wlan.ifconfig()[0])
                    return True
                time.sleep_ms(250)
            self.wlan.disconnect()
        return False

    def _sin_ahorro(self):
        try:
            # Sin ahorro de energía: con señal débil (redes institucionales con varios puntos de
            # acceso) la asociación falla menos y la conexión no se cae entre peticiones.
            self.wlan.config(pm=network.WLAN.PM_NONE)
        except (AttributeError, ValueError, OSError):
            pass

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
    # Una sola conexión TLS que se reutiliza (HTTP/1.1 keep-alive): el handshake cuesta ~2 s en
    # el ESP32, así que tomar → IA → entregar no paga uno por petición.
    def _abrir(self, espera):
        direccion = socket.getaddrinfo(self.host, 443, 0, socket.SOCK_STREAM)[0][-1]
        crudo = socket.socket()
        # Abrir la conexión y el TLS no debe tardar más de 10 s; si la red se cayó, mejor
        # fallar rápido y reconectar el Wi-Fi que esperar toda la espera larga.
        crudo.settimeout(min(espera, ABRIR_SEG))
        try:
            crudo.connect(direccion)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.verify_mode = ssl.CERT_REQUIRED
            ctx.load_verify_locations(cadata=self.raiz)
            self.sock = ctx.wrap_socket(crudo, server_hostname=self.host)
            self.crudo = crudo
        except Exception:
            crudo.close()
            raise

    def _cerrar(self):
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
        self.sock = self.crudo = None

    def _leer(self, n):
        partes, falta = [], n
        while falta > 0:
            trozo = self.sock.read(min(falta, 2048))
            if not trozo:
                raise OSError("conexión cerrada a media respuesta")
            partes.append(trozo)
            falta -= len(trozo)
        return b"".join(partes)

    def _intercambio(self, metodo, ruta, datos, espera):
        self.crudo.settimeout(espera)
        cabeza = (
            "%s %s HTTP/1.1\r\nHost: %s\r\nX-Puente-Clave: %s\r\nUser-Agent: nucleo-puente\r\n"
            "Content-Type: application/json\r\nContent-Length: %d\r\nConnection: keep-alive\r\n\r\n"
            % (metodo, ruta, self.host, self.clave, len(datos))
        )
        self.sock.write(cabeza.encode() + datos)
        linea = self.sock.readline()
        if not linea:
            raise OSError("el servidor cerró la conexión")
        estado = int(linea.split()[1])
        largo, trozos, cerrar = None, False, False
        while True:
            h = self.sock.readline()
            if not h or h == b"\r\n":
                break
            clave, _, valor = h.decode().partition(":")
            clave, valor = clave.strip().lower(), valor.strip().lower()
            if clave == "content-length":
                largo = int(valor)
            elif clave == "transfer-encoding" and "chunked" in valor:
                trozos = True
            elif clave == "connection" and valor == "close":
                cerrar = True
        if trozos:
            partes = []
            while True:
                tam = int(self.sock.readline().split(b";")[0].strip(), 16)
                if tam == 0:
                    self.sock.readline()
                    break
                partes.append(self._leer(tam))
                self.sock.readline()
            cuerpo = b"".join(partes)
        elif largo is not None:
            cuerpo = self._leer(largo)
        elif estado in (204, 304):
            cuerpo = b""
        else:  # sin largo: el cuerpo termina cuando el servidor cierra
            partes = []
            while True:
                trozo = self.sock.read(2048)
                if not trozo:
                    break
                partes.append(trozo)
            cuerpo, cerrar = b"".join(partes), True
        if cerrar:
            self._cerrar()
        return estado, cuerpo

    def pedir(self, metodo, ruta, cuerpo=None, espera=15):
        """Petición HTTPS verificada: (estado, cuerpo en bytes). Si la conexión guardada ya
        no sirve (el servidor la cerró por inactividad), abre otra y reintenta una vez."""
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else b""
        for intento in (0, 1):
            nueva = self.sock is None
            try:
                if nueva:
                    self._abrir(espera)
                return self._intercambio(metodo, ruta, datos, espera)
            except (OSError, ValueError, IndexError):
                self._cerrar()
                if nueva or intento:
                    raise
        return 0, b""

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
        self.perro = perro
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
                if fallos >= 2:
                    # Con varios puntos de acceso y señal débil, el Wi-Fi puede quedar «conectado»
                    # sin tráfico: se reconecta desde cero en vez de seguir esperando.
                    print("Wi-Fi: reconectando")
                    self.wlan.disconnect()
                time.sleep(min(10, 2 * fallos))
                if fallos >= 10:
                    machine.reset()


def ejecutar():
    Puente().ejecutar()
