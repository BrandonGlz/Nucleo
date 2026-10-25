"""Módulos de MicroPython simulados para probar la lógica del firmware en una computadora.

Se importa antes que cualquier módulo de ``micropython/``. Los módulos de hardware se
reemplazan por clases falsas que cada prueba puede controlar.
"""

import os
import sys
import tempfile
import time
import types

RAIZ = os.path.join(os.path.dirname(__file__), "..", "micropython")
sys.path.insert(0, os.path.abspath(RAIZ))
sys.dont_write_bytecode = True


class Pin:
    OUT = 1

    def __init__(self, *args, **kwargs):
        self.valor = 0

    def value(self, nuevo=None):
        if nuevo is not None:
            self.valor = int(bool(nuevo))
        return self.valor


class DHT22:
    temperatura = 22.0
    humedad = 48.0
    falla = False

    def __init__(self, pin):
        pass

    def measure(self):
        if DHT22.falla:
            raise OSError("sin respuesta")

    def temperature(self):
        return DHT22.temperatura

    def humidity(self):
        return DHT22.humedad


class CCS811:
    presente = True
    listo = True
    eco2 = 450
    guardado = None
    baseline = (12, 34)

    def __init__(self, i2c=None, addr=0x5A):
        if not CCS811.presente:
            raise ValueError("CCS811 not found")
        self.eCO2 = 0
        self.tVOC = 0

    def put_envdata(self, humedad, temperatura):
        pass

    def data_ready(self):
        if CCS811.listo:
            self.eCO2 = CCS811.eco2
            self.tVOC = 5
        return CCS811.listo

    def get_baseline(self):
        return CCS811.baseline

    def put_baseline(self, alto, bajo):
        CCS811.guardado = (alto, bajo)


def _modulo(nombre, **atributos):
    modulo = types.ModuleType(nombre)
    modulo.__dict__.update(atributos)
    sys.modules[nombre] = modulo
    return modulo


_modulo("machine", Pin=Pin, SoftI2C=object, WDT=object, ADC=object)
_modulo("dht", DHT22=DHT22)
_modulo("ccs811", CCS811=CCS811)
_modulo("ssd1306", SSD1306_I2C=object)
_modulo("network")
_modulo("ntptime")
_modulo("esp")
_modulo("umqtt")
_modulo("umqtt.simple", MQTTClient=object)
_modulo(
    "secrets",
    CODIGO_MQTT="NUC-001",
    WIFI_SSID="red",
    WIFI_PASSWORD="clave",
    MQTT_HOST="127.0.0.1",
    MQTT_PASSWORD="clave",
)

# time.ticks_* existen solo en MicroPython; el reloj se puede adelantar en las pruebas.
reloj = {"ms": 0}
time.ticks_ms = lambda: reloj["ms"]
time.ticks_diff = lambda a, b: a - b

import config  # noqa: E402

carpeta = tempfile.mkdtemp()
config.ARCHIVO_AJUSTES = os.path.join(carpeta, "ajustes.json")
config.ARCHIVO_BASELINE = os.path.join(carpeta, "baseline.json")
