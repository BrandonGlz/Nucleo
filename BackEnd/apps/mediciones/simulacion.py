"""Valores ambientales simulados para la semilla de demostración y el simulador en vivo.

Cada dispositivo tiene un perfil (base, amplitud del ciclo diario y ruido por variable) y
algunos tienen "eventos": tramos de la tarde en los que una variable se dispara, para que
el historial tenga picos y alertas realistas. Mientras el ESP32 no esté instalado, el
simulador manda estas lecturas por el mismo camino que las de MQTT.
"""

import math
import random
from zoneinfo import ZoneInfo

from django.conf import settings

# Perfil por área: (base, amplitud diaria, ruido) para TEMP, HUM y AIRE.
PERFILES = {
    "Moldeo": {"TEMP": (23.3, 2.0, 0.3), "HUM": (47.0, 4.0, 0.8), "AIRE": (760, 140, 25)},
    "Laboratorio": {"TEMP": (20.5, 1.2, 0.2), "HUM": (48.0, 5.0, 0.9), "AIRE": (420, 60, 15)},
    "Guardería": {"TEMP": (22.5, 1.6, 0.25), "HUM": (45.0, 3.0, 0.7), "AIRE": (600, 160, 25)},
    "Almacén": {"TEMP": (19.5, 2.8, 0.35), "HUM": (55.0, 6.0, 1.0), "AIRE": (520, 80, 20)},
    "Urgencias": {"TEMP": (22.0, 1.0, 0.2), "HUM": (46.0, 3.0, 0.6), "AIRE": (650, 120, 20)},
}
# Eventos por (área, variable): probabilidad diaria de un pico por la tarde y su tamaño.
EVENTOS = {
    ("Moldeo", "TEMP"): (0.45, 4.5),
    ("Moldeo", "AIRE"): (0.35, 520),
    ("Laboratorio", "HUM"): (0.55, 18.0),
    ("Guardería", "AIRE"): (0.3, 380),
    ("Almacén", "HUM"): (0.4, 14.0),
    ("Almacén", "TEMP"): (0.2, -6.5),
}
RANGO = {"TEMP": (-40, 80), "HUM": (0, 100), "AIRE": (0, 10000)}


def _zona():
    return ZoneInfo(settings.TIME_ZONE)


class Generador:
    """Serie de un dispositivo: ``valor(variable, fecha)``, continua y reproducible."""

    def __init__(self, area, semilla):
        self.perfil = PERFILES.get(area, PERFILES["Laboratorio"])
        self.area = area
        self.semilla = semilla
        self.desfase = random.Random(semilla).uniform(-0.6, 0.6)
        self._eventos = {}

    def _evento_del_dia(self, variable, dia):
        """``(inicio_hora, duracion_h, magnitud)`` del pico de ese día, o ``None``."""
        clave = (variable, dia)
        if clave not in self._eventos:
            prob, magnitud = EVENTOS.get((self.area, variable), (0.0, 0))
            azar = random.Random(f"{self.semilla}-{variable}-{dia}")
            self._eventos[clave] = (
                (
                    azar.uniform(13.0, 17.5),
                    azar.uniform(0.6, 2.2),
                    magnitud * azar.uniform(0.55, 1.15),
                )
                if azar.random() < prob
                else None
            )
        return self._eventos[clave]

    def valor(self, variable, fecha, ruido=None):
        base, amplitud, desviacion = self.perfil[variable]
        local = fecha.astimezone(_zona())
        hora = local.hour + local.minute / 60
        # Ciclo diario: mínimo de madrugada, máximo a media tarde. La humedad va al revés.
        ciclo = math.sin((hora - 9.0 + self.desfase) / 24 * 2 * math.pi)
        valor = base + (-ciclo if variable == "HUM" else ciclo) * amplitud
        if variable == "AIRE" and local.weekday() < 5 and 7 <= hora < 19:
            valor += amplitud * 0.8  # ocupación en horario laboral
        evento = self._evento_del_dia(variable, local.date())
        if evento:
            inicio, duracion, magnitud = evento
            if inicio <= hora <= inicio + duracion:
                avance = (hora - inicio) / duracion
                valor += magnitud * math.sin(avance * math.pi)
        azar = ruido or random
        valor += azar.gauss(0, desviacion)
        minimo, maximo = RANGO[variable]
        valor = min(max(valor, minimo), maximo)
        return round(valor) if variable == "AIRE" else round(valor, 1)
