import time

from django.core.management.base import BaseCommand

from apps.dispositivos.services import marcar_sin_conexion


class Command(BaseCommand):
    help = 'Marca como "Sin conexión" los dispositivos que dejaron de enviar lecturas.'

    def add_arguments(self, parser):
        parser.add_argument(
            "--cada",
            type=int,
            default=0,
            metavar="SEGUNDOS",
            help="Repite la revisión cada N segundos. Sin este valor se ejecuta una sola vez.",
        )

    def handle(self, *args, cada, **opciones):
        while True:
            marcados = marcar_sin_conexion()
            self.stdout.write(f"Dispositivos marcados sin conexión: {len(marcados)}")
            if not cada:
                return
            time.sleep(cada)
