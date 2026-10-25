"""Nivel de la batería de litio medido con el ADC detrás de un divisor de tensión."""

from machine import ADC, Pin

import config


class Bateria:
    def __init__(self):
        self._adc = None
        if config.BATERIA_CONECTADA:
            self._adc = ADC(Pin(config.PIN_BATERIA), atten=ADC.ATTN_11DB)

    def porcentaje(self):
        """Devuelve 0 a 100, o None si no hay batería medible (el campo se omite)."""
        if self._adc is None:
            return None
        microvoltios = sum(self._adc.read_uv() for _ in range(8)) // 8
        voltios = microvoltios / 1_000_000 * config.BATERIA_DIVISOR
        rango = config.BATERIA_LLENA_V - config.BATERIA_VACIA_V
        return max(0, min(100, int((voltios - config.BATERIA_VACIA_V) / rango * 100)))
