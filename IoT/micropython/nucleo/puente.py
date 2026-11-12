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
ESPERA_TOMAR = 30  # el servidor responde a más tardar en ~12 s
HORA_SERVIDORES = ("pool.ntp.org", "time.cloudflare.com", "time.windows.com", "time.google.com")
ABRIR_SEG = 10  # tope para abrir la conexión y el TLS
# Estados de network.WLAN.status() al fallar la conexión, para el diagnóstico.
ESTADOS_WIFI = {
    200: "senal_perdida",
    201: "red_no_encontrada",
    202: "autenticacion_rechazada",
    203: "asociacion_rechazada",
    204: "handshake_sin_respuesta",
    1001: "sin_respuesta",
}
ESPERA_IA = 25


def _redes():
    """Redes conocidas, en orden: REDES = [(ssid, clave), ...] o la de WIFI_SSID."""
    redes = list(getattr(secrets, "REDES", []))
    if getattr(secrets, "WIFI_SSID", None):
        redes.append((secrets.WIFI_SSID, secrets.WIFI_PASSWORD))
    return redes


class Puente:
    """``compartido=True``: corre en un hilo junto a los sensores (MODO = "ambos"). Entonces no
    crea su propio watchdog ni reinicia la placa: deja ``latido`` al día y el ciclo de los
    sensores reinicia la placa solo si el puente deja de latir varios minutos."""

    def __init__(self, compartido=False):
        self.compartido = compartido
        self.latido = time.ticks_ms()
        # Ligero: el servidor ejecuta la IA al tomar la petición; el ESP no hace el TLS ni carga
        # el cuerpo de la IA. Por omisión, solo cuando además mide sensores.
        self.ligero = getattr(secrets, "PUENTE_LIGERO", compartido)
        # Diagnóstico que viaja al servidor en cada consulta: separa fallas de la red de fallas
        # del ESP (ver manage.py puente_diagnostico).
        self.red = ""
        self.reconexiones = 0
        self.falla = "ninguna"
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
        self.rondas = 0  # rondas seguidas sin poder entrar a ninguna red

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
            estado = None
            try:
                # Con varios puntos de acceso de la misma red, se elige el de mejor señal.
                self.wlan.connect(ssid, clave, bssid=bssid) if bssid else self.wlan.connect(ssid, clave)
            except OSError as e:
                print("Wi-Fi:", e)
                continue
            # Hasta 20 s por red.
            for _ in range(80):
                self._vivo()
                if self.wlan.isconnected():
                    print("Wi-Fi: conectado", self.wlan.ifconfig()[0])
                    self.red = ssid
                    self.reconexiones += 1
                    return True
                estado = self.wlan.status()
                time.sleep_ms(250)
            self.falla = "wifi_%s_%s" % (ESTADOS_WIFI.get(estado, estado), ssid)
            self.wlan.disconnect()
        if not mejores:
            self.falla = "wifi_sin_redes_visibles"
        elif not any(ssid in mejores for ssid, _ in _redes()):
            self.falla = "wifi_ninguna_red_conocida_visible"
        return False

    def diagnostico(self):
        try:
            rssi = self.wlan.status("rssi")
        except (OSError, ValueError, TypeError):
            rssi = ""
        def limpio(texto):
            texto = str(texto)
            for c in ";=\r\n":
                texto = texto.replace(c, " ")
            return texto[:50]

        return "red=%s;rssi=%s;rec=%d;falla=%s;mem=%d;up=%d;modo=%s" % (
            limpio(self.red),
            rssi,
            self.reconexiones,
            limpio(self.falla),
            gc.mem_free(),
            time.ticks_ms() // 1000,
            ("ambos" if self.compartido else "puente") + ("+ligero" if self.ligero else ""),
        )

    def _vivo(self):
        """Señal de vida: alimenta el watchdog propio o, compartido, actualiza el latido."""
        self.latido = time.ticks_ms()
        if self.perro:
            self.perro.feed()

    def _pausa_red(self):
        """Espera creciente entre rondas fallidas (15 s, 30 s, 60 s… hasta 5 min). Las redes
        institucionales bloquean un rato al equipo que reintenta sin parar; seguir intentando
        cada pocos segundos solo alarga el bloqueo."""
        self.rondas += 1
        espera = min(300, 15 * 2 ** min(self.rondas - 1, 5))
        print("Wi-Fi: sin red, nuevo intento en", espera, "s")
        fin = time.ticks_add(time.ticks_ms(), espera * 1000)
        while time.ticks_diff(fin, time.ticks_ms()) > 0:
            self._vivo()
            time.sleep(1)

    def _sin_ahorro(self):
        try:
            # Sin ahorro de energía: con señal débil (redes institucionales con varios puntos de
            # acceso) la asociación falla menos y la conexión no se cae entre peticiones.
            self.wlan.config(pm=network.WLAN.PM_NONE)
        except (AttributeError, ValueError, OSError):
            pass

    def hora(self):
        """El certificado se valida con la fecha: sin hora no se puede usar HTTPS. Algunas redes
        bloquean o pierden NTP hacia ciertos servidores, así que se prueban varios."""
        for host in HORA_SERVIDORES:
            self._vivo()
            ntptime.host = host
            ntptime.timeout = 3
            try:
                ntptime.settime()
                return True
            except OSError:
                pass
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
            "Content-Type: application/json\r\nContent-Length: %d\r\nConnection: keep-alive\r\n"
            "X-Puente-Diag: %s\r\n\r\n"
            % (metodo, ruta, self.host, self.clave, len(datos), self.diagnostico())
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
    def _parpadeo(self):
        self.led.value(1)
        time.sleep_ms(80)
        self.led.value(0)

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
        if not self.compartido:
            self.perro = machine.WDT(timeout=120000)  # si algo se cuelga, el ESP se reinicia solo
        # Sin hora después de dos vueltas por los servidores, la red no está dejando salir
        # tráfico: se suelta y se busca red de nuevo (puede tocar otro punto de acceso u otra red).
        while True:
            while not self.conectar():
                self._pausa_red()
            if self.hora() or self.hora():
                break
            print("Wi-Fi: la red no da salida, buscando otra")
            self.falla = "red_sin_salida_ntp_%s" % self.red
            self.wlan.disconnect()
            self._pausa_red()
        print("Puente de Nico AI listo para", self.codigo, "en", self.host)
        fallos = 0
        while True:
            self._vivo()
            gc.collect()
            if not self.conectar():
                self._pausa_red()
                continue
            self.rondas = 0
            try:
                ruta = "/api/v1/puente/tomar/?dispositivo=" + self.codigo
                if self.ligero:
                    ruta += "&ligero=1"
                estado, cuerpo = self.pedir("GET", ruta, espera=ESPERA_TOMAR)
                fallos = 0
                if estado == 200:
                    trabajo = json.loads(cuerpo)
                    if trabajo.get("ligero"):
                        self._parpadeo()  # el servidor ya la está procesando
                        self.atendidas += 1
                    else:
                        self.atender(trabajo)
                elif estado != 204:
                    print("Servidor:", estado, cuerpo[:120])
                    time.sleep(5)
            except MemoryError:
                self.falla = "esp_memoria"  # falla del ESP, no de la red
                self._cerrar()
                gc.collect()
                time.sleep(2)
            except (OSError, ValueError) as e:
                fallos += 1
                self.falla = "servidor_%s" % e
                print("Error de red:", e)
                if fallos >= 3:
                    # Con varios puntos de acceso y señal débil, el Wi-Fi puede quedar «conectado»
                    # sin tráfico: se reconecta desde cero en vez de seguir esperando.
                    print("Wi-Fi: reconectando")
                    self.wlan.disconnect()
                time.sleep(min(10, 2 * fallos))
                if fallos >= 10 and not self.compartido:
                    machine.reset()  # compartido no: reiniciaría también los sensores


def ejecutar():
    Puente().ejecutar()


def en_hilo(puente):
    """Cuerpo del hilo en MODO = "ambos": un error inesperado no tumba los sensores; el puente
    espera y vuelve a empezar (sin latido por más de LATIDO_MAX_SEG, la placa se reinicia)."""
    while True:
        try:
            puente.ejecutar()
        except Exception as error:  # noqa: BLE001 - el hilo no debe morir
            import sys

            sys.print_exception(error)
            puente._cerrar()
            time.sleep(10)
