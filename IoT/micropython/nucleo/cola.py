"""Cola en memoria de mensajes que no pudieron enviarse por falta de conexión."""

import config


class ColaDeEnvio:
    """Guarda los mensajes con ``fecha_hora`` para enviarlos al volver la conexión.

    Sin hora válida la plataforma fecharía la lectura al recibirla, lo que falsearía la
    serie; por eso esos mensajes solo se envían en el momento y, si falla, se descartan.
    Con la cola llena se descarta el mensaje más antiguo.
    """

    def __init__(self, maximo=None):
        self._maximo = maximo or config.COLA_MAX_MENSAJES
        self._mensajes = []

    def __len__(self):
        return len(self._mensajes)

    def agregar(self, mensaje):
        self._mensajes.append(mensaje)
        while len(self._mensajes) > self._maximo:
            self._mensajes.pop(0)

    def enviar(self, publicar, maximo=None):
        """Envía del más antiguo al más nuevo hasta ``maximo`` o hasta el primer fallo."""
        maximo = maximo or config.COLA_ENVIOS_POR_CICLO
        enviados = 0
        while self._mensajes and enviados < maximo:
            if not publicar(self._mensajes[0]):
                self._mensajes = [m for m in self._mensajes if "fecha_hora" in m]
                break
            self._mensajes.pop(0)
            enviados += 1
        return enviados
