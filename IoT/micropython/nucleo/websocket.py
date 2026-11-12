"""MQTT dentro de WebSocket (RFC 6455) para pasar por el túnel de Cloudflare.

Cloudflare solo deja pasar HTTPS y WebSocket, no MQTT directo. ``Tubo`` se comporta como el
socket TLS que espera umqtt (``read``, ``write``, ``setblocking``, ``close``), pero mete cada
escritura en una trama binaria enmascarada y arma las lecturas con las tramas del servidor.
Responde los ping y trata el cierre como una desconexión.
"""

import binascii
import os

_BINARIA, _CIERRE, _PING, _PONG = 0x2, 0x8, 0x9, 0xA


def _exacto(sock, n):
    """Lee exactamente n bytes (bloqueante, con el límite de tiempo del socket)."""
    datos = b""
    while len(datos) < n:
        parte = sock.read(n - len(datos))
        if not parte:
            raise OSError(-1)  # el servidor cerró
        datos += parte
    return datos


def trama(opcode, datos, mascara=None):
    """Trama del cliente (siempre enmascarada, como pide el protocolo)."""
    mascara = mascara or os.urandom(4)
    n = len(datos)
    if n < 126:
        cabecera = bytes((0x80 | opcode, 0x80 | n))
    elif n < 65536:
        cabecera = bytes((0x80 | opcode, 0x80 | 126, n >> 8, n & 0xFF))
    else:
        cabecera = bytes((0x80 | opcode, 0x80 | 127)) + n.to_bytes(8, "big")
    cuerpo = bytearray(datos)
    for i in range(n):
        cuerpo[i] ^= mascara[i & 3]
    return cabecera + mascara + bytes(cuerpo)


class Tubo:
    def __init__(self, sock, al_bloquear=None):
        self._sock = sock
        self._al_bloquear = al_bloquear  # pone el límite de tiempo al socket de abajo
        self._datos = b""
        self._bloqueante = True

    def saludo(self, host, ruta):
        """Pide el cambio a WebSocket con el subprotocolo mqtt; falla si no responde 101."""
        clave = binascii.b2a_base64(os.urandom(16)).decode().strip()
        self._sock.write(
            (
                "GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n"
                "Sec-WebSocket-Protocol: mqtt\r\n\r\n" % (ruta, host, clave)
            ).encode()
        )
        respuesta = b""
        while b"\r\n\r\n" not in respuesta:
            respuesta += _exacto(self._sock, 1)
            if len(respuesta) > 2048:
                raise OSError("ws_respuesta_larga")
        if b" 101 " not in respuesta.split(b"\r\n", 1)[0]:
            raise OSError("ws_%s" % respuesta.split(b"\r\n", 1)[0][-40:].decode())

    def _trama(self, primero):
        """Procesa una trama del servidor (ya leído su primer byte)."""
        largo = _exacto(self._sock, 1)[0]
        con_mascara, n = largo & 0x80, largo & 0x7F
        if n == 126:
            b = _exacto(self._sock, 2)
            n = (b[0] << 8) | b[1]
        elif n == 127:
            n = int.from_bytes(_exacto(self._sock, 8), "big")
        mascara = _exacto(self._sock, 4) if con_mascara else None
        datos = _exacto(self._sock, n) if n else b""
        if mascara:
            datos = bytes(d ^ mascara[i & 3] for i, d in enumerate(datos))
        opcode = primero & 0x0F
        if opcode == _CIERRE:
            raise OSError("ws_cerrado")
        if opcode == _PING:
            self._sock.write(trama(_PONG, datos))
        elif opcode != _PONG:
            self._datos += datos  # binaria, de texto o continuación: es parte del flujo MQTT

    def read(self, n):
        while len(self._datos) < n:
            primero = self._sock.read(1)
            if primero is None:  # sin bloqueo y no ha llegado nada
                return None if not self._datos else self._sacar(len(self._datos))
            if not primero:
                raise OSError(-1)
            if not self._bloqueante:
                # Ya empezó una trama: el resto se lee completo (con el límite de tiempo).
                self._bloquear()
                try:
                    self._trama(primero[0])
                finally:
                    self._sock.setblocking(False)
            else:
                self._trama(primero[0])
            if not self._bloqueante and len(self._datos) < n:
                return self._sacar(len(self._datos)) if self._datos else None
        return self._sacar(n)

    def _sacar(self, n):
        datos, self._datos = self._datos[:n], self._datos[n:]
        return datos

    def write(self, datos, n=None):
        datos = bytes(datos[:n] if n is not None else datos)
        self._sock.write(trama(_BINARIA, datos))
        return len(datos)

    def _bloquear(self):
        self._sock.setblocking(True)
        if self._al_bloquear:
            self._al_bloquear()  # bloqueante, pero con límite: nunca espera para siempre

    def setblocking(self, valor):
        self._bloqueante = valor
        if valor:
            self._bloquear()
        else:
            self._sock.setblocking(False)

    def close(self):
        try:
            self._sock.write(trama(_CIERRE, b""))
        except Exception:  # noqa: BLE001 - ya se está cerrando
            pass
        self._sock.close()
