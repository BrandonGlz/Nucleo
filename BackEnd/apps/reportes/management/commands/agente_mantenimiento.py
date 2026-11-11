from django.core.management.base import BaseCommand

from apps.reportes import carga


class Command(BaseCommand):
    help = "Pone a Nico AI en mantenimiento (on), lo regresa (off) o muestra su estado."

    def add_arguments(self, parser):
        parser.add_argument("estado", nargs="?", choices=["on", "off"])

    def handle(self, *args, **opciones):
        archivo = carga.archivo_mantenimiento()
        if opciones["estado"] == "on":
            archivo.parent.mkdir(parents=True, exist_ok=True)
            archivo.touch()
        elif opciones["estado"] == "off":
            archivo.unlink(missing_ok=True)
        self.stdout.write(
            f"Nico AI: {carga.nivel()} · memoria libre: {carga.memoria_disponible_mb()} MB"
        )
