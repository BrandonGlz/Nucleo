from django.core.management.base import BaseCommand

from apps.mediciones.mqtt import ClienteMQTT


class Command(BaseCommand):
    help = "Recibe las lecturas publicadas por los dispositivos en el broker MQTT y las guarda."

    def handle(self, *args, **opciones):
        self.stdout.write("Escuchando lecturas MQTT. Ctrl+C para detener.")
        try:
            ClienteMQTT.obtener().escuchar()
        except KeyboardInterrupt:
            self.stdout.write("Detenido.")
