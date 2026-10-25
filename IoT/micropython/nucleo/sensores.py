"""Lectura del DHT22 (temperatura y humedad) y del CCS811 (eCO2)."""

import json
import time

import dht
from machine import Pin

import config
from ccs811 import CCS811


def _en_rango(variable, valor):
    minimo, maximo = config.RANGOS[variable]
    return valor is not None and minimo <= valor <= maximo


class Sensores:
    """Un sensor que falla no impide leer los demás (SRS 3.2.1)."""

    def __init__(self, i2c):
        self._i2c = i2c
        self._dht = dht.DHT22(Pin(config.PIN_DHT22))
        self._ccs = None
        self._arranque = time.ticks_ms()
        self._baseline_guardado = None
        self.temperatura = None
        self.humedad = None
        self.eco2 = None
        self.tvoc = None
        self._iniciar_ccs811()

    def _iniciar_ccs811(self):
        try:
            self._ccs = CCS811(self._i2c, addr=config.CCS811_DIRECCION)
        except (ValueError, OSError):
            self._ccs = None  # se reintenta en la siguiente lectura
            return
        self._restaurar_baseline()

    def _restaurar_baseline(self):
        """Devuelve al sensor la referencia guardada para que se estabilice antes."""
        try:
            with open(config.ARCHIVO_BASELINE) as archivo:
                alto, bajo = json.load(archivo)
            self._ccs.put_baseline(alto, bajo)
        except (OSError, ValueError, TypeError):
            pass

    def _guardar_baseline(self):
        """Guarda la referencia del sensor una vez por hora y solo ya estabilizado."""
        ahora = time.ticks_ms()
        if not self.aire_estabilizado() or (
            self._baseline_guardado is not None
            and time.ticks_diff(ahora, self._baseline_guardado) < config.BASELINE_CADA_SEG * 1000
        ):
            return
        try:
            alto, bajo = self._ccs.get_baseline()
            with open(config.ARCHIVO_BASELINE, "w") as archivo:
                json.dump([alto, bajo], archivo)
            self._baseline_guardado = ahora
        except OSError:
            pass

    def aire_estabilizado(self):
        return self.calentamiento_restante_seg() == 0

    def calentamiento_restante_seg(self):
        transcurrido = time.ticks_diff(time.ticks_ms(), self._arranque) // 1000
        return max(0, config.CALENTAMIENTO_AIRE_SEG - transcurrido)

    def leer(self):
        """Actualiza y devuelve las lecturas válidas como {variable: valor}."""
        self.temperatura = self.humedad = self.eco2 = self.tvoc = None
        try:
            self._dht.measure()
            self.temperatura = self._dht.temperature()
            self.humedad = self._dht.humidity()
        except OSError:
            pass

        if self._ccs is None:
            self._iniciar_ccs811()
        if self._ccs is not None:
            try:
                if self.temperatura is not None and self.humedad is not None:
                    self._ccs.put_envdata(self.humedad, self.temperatura)  # compensación
                if self._ccs.data_ready():
                    self.eco2 = self._ccs.eCO2
                    self.tvoc = self._ccs.tVOC
                    self._guardar_baseline()
            except OSError:
                self._ccs = None

        lecturas = {}
        for variable, valor in (
            ("TEMP", self.temperatura),
            ("HUM", self.humedad),
            ("AIRE", self.eco2),
        ):
            if _en_rango(variable, valor):
                lecturas[variable] = valor
        return lecturas

    @staticmethod
    def modelo_de(variable):
        return config.SENSOR_AIRE if variable == "AIRE" else config.SENSOR_TEMP_HUM
