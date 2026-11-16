"""Busca y descarga la actualización remota del firmware (OTA).

Cada ``OTA_REVISAR_SEG`` pregunta a ``/api/v1/puente/firmware/`` (mismo host y clave que el
respaldo HTTPS de Nico) si hay una versión distinta a ``config.FIRMWARE_VERSION``. Si la hay:

- comprueba la firma del manifiesto (HMAC-SHA256 con ``PUENTE_CLAVE``): sin la clave nadie puede
  mandar código a la placa, aunque controle la red;
- baja cada archivo a ``ota/`` y comprueba su SHA-256 y su tamaño;
- deja ``ota/listo``; al reiniciar, ``actualizacion.py`` la aplica con vuelta atrás.

Una versión que ya falló (``ota_estado.json``) no se vuelve a bajar.
"""

import binascii
import gc
import hashlib
import json
import socket
import ssl
import time

import actualizacion
import config
import secrets
from nucleo.comunicacion import hmac_sha256

PROTEGIDOS = ("secrets.py", "boot.py", "actualizacion.py")


def canonico(version, archivos):
    """Mismo texto que firma el servidor (apps/dispositivos/firmware.py)."""
    lineas = [version] + ["%s:%s:%d" % (a["ruta"], a["sha256"], a["tamano"]) for a in archivos]
    return "\n".join(lineas).encode()


def ruta_valida(ruta):
    if not ruta or ruta in PROTEGIDOS or ".." in ruta or ruta.startswith("/"):
        return False
    if not (ruta.endswith(".py") or ruta.endswith(".pem")):
        return False
    return all(c.isalpha() or c.isdigit() or c in "_./" for c in ruta)


def manifiesto_valido(manifiesto, clave):
    """Firma correcta y solo rutas permitidas."""
    try:
        version = manifiesto["version"]
        archivos = manifiesto["archivos"]
        firma = manifiesto["firma"]
    except (KeyError, TypeError):
        return False
    if not archivos or not all(ruta_valida(a.get("ruta")) for a in archivos):
        return False
    esperada = hmac_sha256(clave.encode(), canonico(version, archivos))
    # comparación sin cortar al primer carácter distinto
    if len(esperada) != len(firma):
        return False
    diferencia = 0
    for x, y in zip(esperada, firma):
        diferencia |= ord(x) ^ ord(y)
    return diferencia == 0


def _leer_exacto(sock, largo, entregar):
    while largo > 0:
        trozo = sock.read(min(largo, 1024))
        if not trozo:
            raise OSError("conexión cerrada a media descarga")
        largo -= len(trozo)
        entregar(trozo)


class Actualizador:
    def __init__(self, red, alimentar=None):
        self._red = red
        self._alimentar = alimentar or (lambda: None)
        self._host = getattr(secrets, "PUENTE_HOST", "")
        self._clave = getattr(secrets, "PUENTE_CLAVE", "")
        self._ultimo = time.ticks_ms()  # la primera revisión espera OTA_PRIMERA_SEG
        self._espera = config.OTA_PRIMERA_SEG

    def disponible(self):
        return bool(self._host and self._clave and config.OTA_REVISAR_SEG)

    def revisar(self):
        """Devuelve True si dejó una versión lista para aplicar al reiniciar."""
        if not self.disponible():
            return False
        if time.ticks_diff(time.ticks_ms(), self._ultimo) < self._espera * 1000:
            return False
        self._ultimo = time.ticks_ms()
        self._espera = config.OTA_REVISAR_SEG
        try:
            return self._descargar()
        except (OSError, ValueError, KeyError, IndexError) as e:
            self._red.falla = "ota_%s" % e
            actualizacion._borrar("ota")
            return False

    def _ruta(self, ruta, **params):
        partes = ["dispositivo=" + secrets.CODIGO_MQTT]
        partes += ["%s=%s" % (k, v) for k, v in params.items()]
        return "/api/v1/puente/firmware/%s?%s" % (ruta, "&".join(partes))

    def _descargar(self):
        estado, cuerpo = self._pedir(self._ruta("", version=config.FIRMWARE_VERSION))
        if estado != 200:
            return False
        manifiesto = json.loads(cuerpo)
        version = manifiesto.get("version")
        if version == config.FIRMWARE_VERSION or version == actualizacion.estado().get("fallida"):
            return False
        if not manifiesto_valido(manifiesto, self._clave):
            self._red.falla = "ota_firma_invalida"
            return False
        actualizacion._borrar("ota")
        for archivo in manifiesto["archivos"]:
            self._alimentar()
            destino = "ota/" + archivo["ruta"]
            actualizacion._carpetas(destino)
            resumen = hashlib.sha256()
            tamano = [0]

            def guardar(trozo, f):
                resumen.update(trozo)
                tamano[0] += len(trozo)
                f.write(trozo)

            with open(destino, "wb") as f:
                estado, _ = self._pedir(
                    self._ruta("archivo/", version=version, ruta=archivo["ruta"]),
                    lambda t: guardar(t, f),
                )
            obtenido = binascii.hexlify(resumen.digest()).decode()
            if estado != 200 or obtenido != archivo["sha256"] or tamano[0] != archivo["tamano"]:
                raise ValueError("archivo_alterado_" + archivo["ruta"])
            gc.collect()
        actualizacion._escribir("ota/manifiesto.json", {
            "version": version,
            "archivos": manifiesto["archivos"],
        })
        with open("ota/listo", "w") as f:
            f.write(version)
        return True

    def _pedir(self, ruta, al_recibir=None):
        """GET por HTTPS (conexión nueva, se cierra al terminar). Sin ``al_recibir`` devuelve el
        cuerpo; con él, lo entrega por trozos."""
        with open(config.RAIZ_PUENTE, "rb") as f:
            raiz = f.read()
        direccion = socket.getaddrinfo(self._host, 443, 0, socket.SOCK_STREAM)[0][-1]
        crudo = socket.socket()
        crudo.settimeout(config.OTA_ESPERA_SEG)
        sock = None
        try:
            crudo.connect(direccion)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.verify_mode = ssl.CERT_REQUIRED
            ctx.load_verify_locations(cadata=raiz)
            sock = ctx.wrap_socket(crudo, server_hostname=self._host)
            sock.write(
                (
                    "GET %s HTTP/1.1\r\nHost: %s\r\nX-Puente-Clave: %s\r\n"
                    "User-Agent: nucleo-ota\r\nConnection: close\r\n\r\n"
                    % (ruta, self._host, self._clave)
                ).encode()
            )
            estado = int(sock.readline().split()[1])
            largo, por_trozos = None, False
            while True:
                h = sock.readline()
                if not h or h == b"\r\n":
                    break
                clave, _, valor = h.decode().partition(":")
                clave, valor = clave.strip().lower(), valor.strip().lower()
                if clave == "content-length":
                    largo = int(valor)
                elif clave == "transfer-encoding" and "chunked" in valor:
                    por_trozos = True
            cuerpo = [b""]

            def entregar(trozo):
                if al_recibir and estado == 200:
                    al_recibir(trozo)
                elif len(cuerpo[0]) < 16384:
                    cuerpo[0] += trozo
                self._alimentar()

            if por_trozos:  # Cloudflare puede reenviar la respuesta en trozos
                while True:
                    tam = int(sock.readline().split(b";")[0].strip(), 16)
                    if tam == 0:
                        break
                    _leer_exacto(sock, tam, entregar)
                    sock.readline()  # CRLF del trozo
            elif largo is not None:
                _leer_exacto(sock, largo, entregar)
            else:
                while True:
                    trozo = sock.read(1024)
                    if not trozo:
                        break
                    entregar(trozo)
            return estado, cuerpo[0]
        finally:
            (sock or crudo).close()
