"""Pantalla OLED SSD1306 de 128x64: 8 renglones de 16 caracteres."""

from ssd1306 import SSD1306_I2C

import config
from nucleo.umbrales import NOMBRES


class Pantalla:
    def __init__(self, i2c):
        try:
            self._oled = SSD1306_I2C(config.OLED_ANCHO, config.OLED_ALTO, i2c)
        except OSError:
            self._oled = None  # sin pantalla el dispositivo sigue midiendo y publicando

    def renglones(self, *textos):
        if self._oled is None:
            return
        self._oled.fill(0)
        for fila, texto in enumerate(textos[:8]):
            self._oled.text(texto[:16], 0, fila * 8)
        self._oled.show()

    def lecturas(self, lecturas, nivel, wifi, mqtt, restante_calentamiento_seg, bateria):
        temperatura = lecturas.get("TEMP")
        humedad = lecturas.get("HUM")
        aire = lecturas.get("AIRE")
        if restante_calentamiento_seg:
            estado_aire = "Calentando %d:%02d" % divmod(restante_calentamiento_seg, 60)
        else:
            estado_aire = "CO2 %s ppm" % ("--" if aire is None else int(aire))
        self.renglones(
            "Nucleo",
            "",
            "Temp %s C" % ("--" if temperatura is None else "%.1f" % temperatura),
            "Hum  %s %%" % ("--" if humedad is None else "%.0f" % humedad),
            estado_aire,
            "",
            "WiFi:%s MQTT:%s" % ("OK" if wifi else "--", "OK" if mqtt else "--"),
            "%s%s" % (NOMBRES[nivel], "" if bateria is None else "  Bat %d%%" % bateria),
        )
