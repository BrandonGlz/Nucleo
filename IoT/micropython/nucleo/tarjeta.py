"""Tarjeta microSD (lector HW-125 por SPI): lecturas pendientes y bitácora del ESP.

- **Pendientes:** cuando la cola en memoria se llena sin conexión, los mensajes con hora pasan a
  archivos ``nucleo/<n>.jsonl`` (``SD_LOTE`` por archivo, uno por línea) en vez de descartarse.
  Sobreviven a un reinicio y se envían primero, del más antiguo al más nuevo, al volver la conexión.
- **Bitácora:** ``nucleo/bitacora.txt`` con arranques y cambios de Wi-Fi y MQTT, para revisar
  qué pasó sin tener el ESP conectado por USB. Al pasar de ``SD_BITACORA_MAX`` se rota a
  ``bitacora.1.txt``.

Sin tarjeta (o si se saca) todo sigue como antes: la cola solo en memoria. Se reintenta montarla
cada ``SD_REINTENTO_SEG``, así que se puede poner con el ESP encendido.
"""

import json
import os
import time

import config

try:
    from machine import SDCard
except ImportError:  # pruebas en la PC
    SDCard = None

_CARPETA = "nucleo"
_BITACORA = "bitacora.txt"


def _marca():
    """Hora UTC si ya está sincronizada; si no, segundos desde el arranque."""
    t = time.gmtime()
    if t[0] < 2024:
        return "+%ds" % (time.ticks_ms() // 1000)
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % t[:6]


class Tarjeta:
    def __init__(self, punto=None, montar=None):
        self.punto = punto or config.SD_PUNTO
        self._montar_fs = montar or self._montar_sd
        self._sd = None
        self._intento = None
        self._archivos = []  # números de los archivos de pendientes, del más antiguo al más nuevo
        self._en_ultimo = 0  # mensajes en el archivo más nuevo
        self.montada = False
        self.pendientes = 0
        self.mantener()

    # --- Montaje ------------------------------------------------------------------------------

    def _montar_sd(self):
        if SDCard is None or not config.SD_ACTIVA:
            raise OSError("sin lector")
        self._sd = SDCard(
            slot=2,
            sck=config.PIN_SD_SCK,
            mosi=config.PIN_SD_MOSI,
            miso=config.PIN_SD_MISO,
            cs=config.PIN_SD_CS,
            freq=config.SD_FRECUENCIA,
        )
        try:
            os.mount(self._sd, self.punto)
        except OSError:
            self._soltar()
            raise

    def _soltar(self):
        if self._sd is not None:
            try:
                self._sd.deinit()
            except (OSError, AttributeError):
                pass
            self._sd = None

    def mantener(self):
        """Monta la tarjeta al arrancar y luego cada ``SD_REINTENTO_SEG`` mientras no haya."""
        if self.montada:
            return
        ahora = time.ticks_ms()
        if self._intento is not None and time.ticks_diff(ahora, self._intento) < config.SD_REINTENTO_SEG * 1000:
            return
        self._intento = ahora
        try:
            self._montar_fs()
            carpeta = self._ruta("")[:-1]
            try:
                os.mkdir(carpeta)
            except OSError:
                pass  # ya existe
            self._archivos = sorted(
                int(n[:-6]) for n in os.listdir(carpeta) if n.endswith(".jsonl") and n[:-6].isdigit()
            )
            conteos = [len(self._lineas(n)) for n in self._archivos]
            self.pendientes = sum(conteos)
            self._en_ultimo = conteos[-1] if conteos else 0
            self.montada = True
        except OSError:
            self._soltar()
            self.montada = False
            return
        self.bitacora("tarjeta montada · %d lecturas pendientes" % self.pendientes)

    def _falla(self):
        """La tarjeta dejó de responder (se sacó o falló): se vuelve a la cola en memoria."""
        self.montada = False
        self.pendientes = 0
        self._archivos = []
        try:
            os.umount(self.punto)
        except (OSError, AttributeError):
            pass
        self._soltar()
        self._intento = time.ticks_ms()

    # --- Estado -------------------------------------------------------------------------------

    def libre_mb(self):
        st = os.statvfs(self.punto)
        return st[0] * st[3] // 1048576

    def diag(self):
        """Valor para el diagnóstico del latido: ``no`` o ``<MB libres>MB;sdpend=<pendientes>``."""
        if not self.montada:
            return "no"
        try:
            return "%dMB;sdpend=%d" % (self.libre_mb(), self.pendientes)
        except OSError:
            self._falla()
            return "no"

    # --- Pendientes ---------------------------------------------------------------------------

    def _ruta(self, nombre):
        return "%s/%s/%s" % (self.punto, _CARPETA, nombre)

    def _archivo(self, numero):
        return self._ruta("%06d.jsonl" % numero)

    def _lineas(self, numero):
        with open(self._archivo(numero)) as f:
            return [linea for linea in f.read().split("\n") if linea.strip()]

    def guardar(self, mensajes):
        """Agrega mensajes al final. Devuelve True si quedaron en la tarjeta."""
        if not self.montada or not mensajes:
            return False
        try:
            for mensaje in mensajes:
                if not self._archivos or self._en_ultimo >= config.SD_LOTE:
                    self._archivos.append(self._archivos[-1] + 1 if self._archivos else 1)
                    self._en_ultimo = 0
                with open(self._archivo(self._archivos[-1]), "a") as f:
                    f.write(json.dumps(mensaje) + "\n")
                self._en_ultimo += 1
                self.pendientes += 1
            # Tope de espacio: con la tarjeta llena de pendientes se borra lo más antiguo.
            while len(self._archivos) > config.SD_MAX_ARCHIVOS:
                numero = self._archivos.pop(0)
                self.pendientes -= len(self._lineas(numero))
                os.remove(self._archivo(numero))
            return True
        except OSError:
            self._falla()
            return False

    def lote(self):
        """Mensajes del archivo más antiguo; lista vacía si no hay pendientes."""
        while self.montada and self._archivos:
            try:
                lineas = self._lineas(self._archivos[0])
            except OSError:
                self._falla()
                return []
            mensajes = []
            for linea in lineas:
                try:
                    mensajes.append(json.loads(linea))
                except ValueError:
                    pass  # línea cortada por un apagón a media escritura
            if mensajes:
                return mensajes
            self.quitar(len(lineas) or 1)  # archivo vacío o dañado: se descarta
        return []

    def quitar(self, cuantos):
        """Borra los primeros ``cuantos`` mensajes del archivo más antiguo (ya enviados)."""
        if not cuantos or not self.montada or not self._archivos:
            return
        numero = self._archivos[0]
        try:
            lineas = self._lineas(numero)
            restantes = lineas[cuantos:]
            if restantes:
                with open(self._archivo(numero), "w") as f:
                    f.write("\n".join(restantes) + "\n")
            else:
                os.remove(self._archivo(numero))
                self._archivos.pop(0)
                if not self._archivos:
                    self._en_ultimo = 0
            self.pendientes = max(0, self.pendientes - (len(lineas) - len(restantes)))
            if len(self._archivos) == 1 and restantes:
                self._en_ultimo = len(restantes)
        except OSError:
            self._falla()

    # --- Bitácora -----------------------------------------------------------------------------

    def bitacora(self, texto):
        if not self.montada:
            return
        ruta = self._ruta(_BITACORA)
        try:
            try:
                if os.stat(ruta)[6] > config.SD_BITACORA_MAX:
                    anterior = self._ruta("bitacora.1.txt")
                    try:
                        os.remove(anterior)
                    except OSError:
                        pass
                    os.rename(ruta, anterior)
            except OSError:
                pass  # todavía no existe
            with open(ruta, "a") as f:
                f.write("%s %s\n" % (_marca(), texto))
        except OSError:
            self._falla()
