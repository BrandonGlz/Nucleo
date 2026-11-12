"""Respaldo HTTPS del latido de Nico AI, para redes que bloquean el puerto del broker MQTT.

Una consulta corta cada ``RESPALDO_SEG`` a ``GET /api/v1/puente/tomar/`` con la clave del puente
(sin espera larga): la consulta marca a Nico activo y autoriza las peticiones que esperaban la
firma del ESP. La conexión TLS se reutiliza (keep-alive) para no repetir el handshake.
"""

import socket
import ssl
import time

import config
import secrets


class RespaldoHTTPS:
    def __init__(self, red):
        self._red = red
        self._host = getattr(secrets, "PUENTE_HOST", "")
        self._clave = getattr(secrets, "PUENTE_CLAVE", "")
        self._raiz = None
        self._sock = self._crudo = None
        self._ultimo = None
        self.autorizadas = 0

    def disponible(self):
        return bool(self._host and self._clave)

    def mantener(self):
        """Una consulta cada RESPALDO_SEG; devuelve cuántas peticiones autorizó."""
        ahora = time.ticks_ms()
        if self._ultimo is not None and time.ticks_diff(ahora, self._ultimo) < config.RESPALDO_SEG * 1000:
            return 0
        self._ultimo = ahora
        ruta = "/api/v1/puente/tomar/?dispositivo=" + secrets.CODIGO_MQTT
        for intento in (0, 1):
            nueva = self._sock is None
            try:
                if nueva:
                    self._abrir()
                estado = self._consultar(ruta)
                if estado == 200:
                    self.autorizadas += 1
                    return 1
                return 0
            except (OSError, ValueError, IndexError) as e:
                self._cerrar()
                if nueva or intento:
                    self._red.falla = "respaldo_%s" % e
                    return 0
        return 0

    def _abrir(self):
        if self._raiz is None:
            with open(config.RAIZ_PUENTE, "rb") as f:
                self._raiz = f.read()
        direccion = socket.getaddrinfo(self._host, 443, 0, socket.SOCK_STREAM)[0][-1]
        crudo = socket.socket()
        crudo.settimeout(config.RESPALDO_ESPERA_SEG)
        try:
            crudo.connect(direccion)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.verify_mode = ssl.CERT_REQUIRED
            ctx.load_verify_locations(cadata=self._raiz)
            self._sock = ctx.wrap_socket(crudo, server_hostname=self._host)
            self._crudo = crudo
        except Exception:
            crudo.close()
            raise

    def _consultar(self, ruta):
        self._sock.write(
            (
                "GET %s HTTP/1.1\r\nHost: %s\r\nX-Puente-Clave: %s\r\nX-Puente-Diag: %s\r\n"
                "User-Agent: nucleo-puente\r\nConnection: keep-alive\r\n\r\n"
                % (ruta, self._host, self._clave, self._red.diagnostico(";modo=https"))
            ).encode()
        )
        linea = self._sock.readline()
        if not linea:
            raise OSError("el servidor cerró la conexión")
        estado = int(linea.split()[1])
        largo, cerrar = 0, False
        while True:
            h = self._sock.readline()
            if not h or h == b"\r\n":
                break
            clave, _, valor = h.decode().partition(":")
            clave, valor = clave.strip().lower(), valor.strip().lower()
            if clave == "content-length":
                largo = int(valor)
            elif clave == "connection" and valor == "close":
                cerrar = True
        while largo > 0:  # el cuerpo es pequeño ({"autorizadas": n}); solo se descarta
            trozo = self._sock.read(min(largo, 512))
            if not trozo:
                raise OSError("conexión cerrada a media respuesta")
            largo -= len(trozo)
        if cerrar:
            self._cerrar()
        return estado

    def _cerrar(self):
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
        self._sock = self._crudo = None
