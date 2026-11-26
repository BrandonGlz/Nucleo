from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.reportes import servicios


class Command(BaseCommand):
    help = (
        "Revisa las programaciones de reporte activas y deja en la cola los reportes vencidos. "
        "El comando procesar_reportes los calcula, envía y avisa. Se programa con un temporizador."
    )

    def handle(self, *args, **opciones):
        ahora = timezone.now()
        for programacion in servicios.programaciones_vencidas(ahora):
            resultado = servicios.ejecutar_programacion(programacion, ahora)
            if resultado is None:
                self.stdout.write(
                    f"Programación {programacion.num}: la organización no está activa"
                )
                continue
            reporte, destinatarios = resultado
            self.stdout.write(
                f"Programación {programacion.num}: reporte {reporte.num} en cola para "
                f"{len(destinatarios)} destinatarios"
            )
