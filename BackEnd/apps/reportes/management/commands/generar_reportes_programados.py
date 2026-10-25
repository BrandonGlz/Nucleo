from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.reportes import ia, servicios


class Command(BaseCommand):
    help = (
        "Revisa las programaciones de reporte activas, genera los reportes vencidos y los "
        "envía por correo a sus destinatarios. Se programa con cron o un temporizador."
    )

    def handle(self, *args, **opciones):
        ahora = timezone.now()
        fallidas = 0
        for programacion in servicios.programaciones_vencidas(ahora):
            try:
                resultado = servicios.ejecutar_programacion(programacion, ahora)
            except ia.IANoDisponible as error:
                fallidas += 1
                self.stderr.write(f"Programación {programacion.num}: {error}")
                continue
            if resultado is None:
                self.stdout.write(
                    f"Programación {programacion.num}: la organización no está activa"
                )
                continue
            reporte, correos = resultado
            self.stdout.write(
                f"Programación {programacion.num}: reporte {reporte.num} enviado a {len(correos)}"
            )
        if fallidas:
            raise CommandError(
                f"{fallidas} programaciones no se generaron porque la IA no está disponible."
            )
