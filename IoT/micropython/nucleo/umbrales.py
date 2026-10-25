"""Configuración recibida de la plataforma y clasificación local de las lecturas."""

import json

import config

NORMAL = 0
ADVERTENCIA = 1
PELIGRO = 2

NOMBRES = ("NORMAL", "ADVERT", "PELIGRO")


class Ajustes:
    """Intervalo de muestreo y umbrales vigentes.

    Se guardan en la memoria flash para que el dispositivo siga alertando tras un
    reinicio aunque no tenga conexión (SRS 3.2.7).
    """

    def __init__(self):
        self.intervalo_seg = config.INTERVALO_MUESTREO_SEG
        self._limites = {}
        self._cargar()

    def actualizar(self, carga):
        """Aplica un mensaje de configuración; devuelve True si cambió algo válido."""
        intervalo = carga.get("intervalo_muestreo_seg", self.intervalo_seg)
        if not (config.INTERVALO_MIN_SEG <= intervalo <= config.INTERVALO_MAX_SEG):
            return False
        limites = {}
        for u in carga.get("umbrales", []):
            orden = (
                u["peligro_min"],
                u["advertencia_min"],
                u["advertencia_max"],
                u["peligro_max"],
            )
            if not (orden[0] <= orden[1] < orden[2] <= orden[3]):
                return False
            limites[u["variable"]] = orden
        self.intervalo_seg = intervalo
        self._limites = limites
        self._guardar()
        return True

    def nivel(self, variable, valor):
        """NORMAL dentro de los límites de advertencia; PELIGRO fuera de los de peligro."""
        limites = self._limites.get(variable)
        if limites is None:
            return NORMAL
        peligro_min, adv_min, adv_max, peligro_max = limites
        if valor < peligro_min or valor > peligro_max:
            return PELIGRO
        if valor < adv_min or valor > adv_max:
            return ADVERTENCIA
        return NORMAL

    def _guardar(self):
        try:
            with open(config.ARCHIVO_AJUSTES, "w") as archivo:
                json.dump({"intervalo": self.intervalo_seg, "limites": self._limites}, archivo)
        except OSError:
            pass

    def _cargar(self):
        try:
            with open(config.ARCHIVO_AJUSTES) as archivo:
                datos = json.load(archivo)
            self.intervalo_seg = datos["intervalo"]
            self._limites = {k: tuple(v) for k, v in datos["limites"].items()}
        except (OSError, ValueError, KeyError):
            pass
