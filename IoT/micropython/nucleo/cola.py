"""Cola de mensajes que no pudieron enviarse por falta de conexión: en memoria y, si hay, en la microSD."""

import config


class ColaDeEnvio:
    """Guarda los mensajes con ``fecha_hora`` para enviarlos al volver la conexión.

    Sin hora válida la plataforma fecharía la lectura al recibirla, lo que falsearía la
    serie; por eso esos mensajes solo se envían en el momento y, si falla, se descartan.
    Con la cola llena, los más antiguos pasan a la tarjeta microSD (``nucleo/tarjeta.py``) si
    está montada; sin tarjeta se descartan. Lo de la tarjeta es lo más antiguo y se envía primero.
    """

    def __init__(self, maximo=None, tarjeta=None):
        self._maximo = maximo or config.COLA_MAX_MENSAJES
        self._mensajes = []
        self._tarjeta = tarjeta
        self._lote = []  # copia en memoria del archivo más antiguo de la tarjeta

    def __len__(self):
        en_tarjeta = self._tarjeta.pendientes if self._tarjeta is not None and self._tarjeta.montada else 0
        return len(self._mensajes) + en_tarjeta

    def agregar(self, mensaje):
        self._mensajes.append(mensaje)
        if len(self._mensajes) <= self._maximo:
            return
        desborde = self._mensajes[: -self._maximo]
        self._mensajes = self._mensajes[-self._maximo :]
        if self._tarjeta is not None:
            self._tarjeta.guardar([m for m in desborde if "fecha_hora" in m])

    def enviar(self, publicar, maximo=None):
        """Envía del más antiguo al más nuevo (primero la tarjeta) hasta ``maximo`` o el primer fallo."""
        maximo = maximo or config.COLA_ENVIOS_POR_CICLO
        enviados = 0
        tarjeta = self._tarjeta
        if tarjeta is None or not tarjeta.montada:
            self._lote = []
        while tarjeta is not None and tarjeta.montada and enviados < maximo:
            if not self._lote:
                self._lote = tarjeta.lote()
                if not self._lote:
                    break
            hechos = 0
            while self._lote and enviados < maximo:
                if not publicar(self._lote[0]):
                    tarjeta.quitar(hechos)
                    return enviados
                self._lote.pop(0)
                hechos += 1
                enviados += 1
            tarjeta.quitar(hechos)
        if tarjeta is not None and tarjeta.montada and (self._lote or tarjeta.pendientes):
            return enviados  # aún quedan pendientes más antiguos en la tarjeta
        while self._mensajes and enviados < maximo:
            if not publicar(self._mensajes[0]):
                self._mensajes = [m for m in self._mensajes if "fecha_hora" in m]
                break
            self._mensajes.pop(0)
            enviados += 1
        return enviados
