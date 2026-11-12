"""Nivel de la batería de litio: medidor MAX17048 por I2C o ADC detrás de un divisor."""

from machine import ADC, Pin

import config

_REG_VCELL = 0x02  # voltaje de la celda, 78.125 µV por unidad
_REG_SOC = 0x04  # carga: byte alto en %, byte bajo en 1/256 %


class Bateria:
    """``porcentaje()`` devuelve 0 a 100, o None si no hay batería medible (el campo se omite).
    Un medidor ausente o que falla no detiene el ciclo: solo se omite el nivel."""

    def __init__(self, i2c=None):
        self._i2c = i2c
        self._adc = None
        self.voltaje = None
        if config.BATERIA == "ADC":
            self._adc = ADC(Pin(config.PIN_BATERIA), atten=ADC.ATTN_11DB)

    def _registro(self, registro):
        datos = self._i2c.readfrom_mem(config.MAX17048_DIRECCION, registro, 2)
        return (datos[0] << 8) | datos[1]

    def _max17048(self):
        try:
            self.voltaje = round(self._registro(_REG_VCELL) * 78.125 / 1_000_000, 3)
            carga = self._registro(_REG_SOC) / 256
        except (OSError, AttributeError):
            self.voltaje = None
            return None
        # Con la celda llena el medidor puede pasar un poco de 100 %.
        return max(0, min(100, round(carga)))

    def _por_voltaje(self):
        microvoltios = sum(self._adc.read_uv() for _ in range(8)) // 8
        voltios = microvoltios / 1_000_000 * config.BATERIA_DIVISOR
        self.voltaje = round(voltios, 3)
        rango = config.BATERIA_LLENA_V - config.BATERIA_VACIA_V
        return max(0, min(100, int((voltios - config.BATERIA_VACIA_V) / rango * 100)))

    def porcentaje(self):
        if config.BATERIA == "MAX17048":
            return self._max17048()
        if self._adc is not None:
            return self._por_voltaje()
        return None
