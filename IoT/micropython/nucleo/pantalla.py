"""Pantalla OLED SSD1306 de 128x64: 8 renglones de 16 caracteres."""

from ssd1306 import SSD1306_I2C

import config
from nucleo.umbrales import NOMBRES


# La fuente de 8x8 solo tiene ASCII: las minúsculas con acento se dibujan como la letra base
# más la tilde en los dos renglones libres de arriba; las mayúsculas pierden el acento.
_ACENTOS = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
            "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U", "Ñ": "N"}
_TILDE = ((3, 0), (2, 1))  # las letras ocupan las columnas 0–4
_VIRGULILLA = ((0, 1), (1, 0), (2, 0), (3, 1), (4, 0))


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
            self._texto(texto[:16], 0, fila * 8)
        self._oled.show()

    def _texto(self, texto, x, y):
        base = "".join(_ACENTOS.get(c, c) for c in texto)
        self._oled.text(base, x, y)
        for i, c in enumerate(texto):
            if c in "áéíóú":
                marca = _TILDE
            elif c == "ñ":
                marca = _VIRGULILLA
            else:
                continue
            for dx, dy in marca:
                self._oled.pixel(x + i * 8 + dx, y + dy, 1)

    def lecturas(self, nombre, lecturas, nivel, red_wifi, restante_calentamiento_seg, bateria):
        """``red_wifi`` es el nombre de la red conectada o vacío sin conexión. El estado de MQTT
        no se muestra: es técnico y se revisa en el servidor (``estadoServer.sh``)."""
        temperatura = lecturas.get("TEMP")
        humedad = lecturas.get("HUM")
        aire = lecturas.get("AIRE")
        if restante_calentamiento_seg:
            estado_aire = "Calentando %d:%02d" % divmod(restante_calentamiento_seg, 60)
        else:
            estado_aire = "CO2 %s ppm" % ("--" if aire is None else int(aire))
        self.renglones(
            nombre,
            "",
            "Temp %s C" % ("--" if temperatura is None else "%.1f" % temperatura),
            "Hum  %s %%" % ("--" if humedad is None else "%.0f" % humedad),
            estado_aire,
            "",
            ("WiFi " + red_wifi) if red_wifi else "Sin WiFi",
            "%s%s" % (NOMBRES[nivel], "" if bateria is None else "  Bat %d%%" % bateria),
        )
