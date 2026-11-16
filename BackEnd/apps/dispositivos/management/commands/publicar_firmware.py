from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.dispositivos import firmware


class Command(BaseCommand):
    help = (
        "Publica el firmware de IoT/micropython para la actualización remota (OTA) de los ESP32. "
        "La versión sale de FIRMWARE_VERSION en config.py; la reciben los dispositivos de "
        "NUCLEO_FIRMWARE_DISPOSITIVOS."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--origen",
            default=str(Path(settings.BASE_DIR).parent / "IoT" / "micropython"),
            help="Carpeta del firmware (por defecto IoT/micropython).",
        )

    def handle(self, *args, origen, **opciones):
        try:
            manifiesto = firmware.publicar(origen)
        except firmware.FirmwareError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(
            f"Firmware {manifiesto['version']} publicado ({len(manifiesto['archivos'])} archivos)."
        )
        destino = settings.NUCLEO_FIRMWARE_DISPOSITIVOS
        self.stdout.write(
            "Lo reciben: "
            + ("todos los dispositivos" if "*" in destino else ", ".join(destino) or "ninguno")
            + " (NUCLEO_FIRMWARE_DISPOSITIVOS)."
        )
