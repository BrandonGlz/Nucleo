import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections, transaction

from apps.reportes import servicios
from apps.reportes.models import Reporte


class Command(BaseCommand):
    help = (
        "Procesa la cola de reportes: calcula cifras, redacta con IA, arma el PDF y envía "
        "los programados. Es un bucle; con --una-vez procesa lo pendiente y termina."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--una-vez",
            action="store_true",
            help="Procesa los reportes pendientes actuales y termina.",
        )

    def handle(self, *args, **opciones):
        una_vez = opciones["una_vez"]
        while True:
            with transaction.atomic():
                reporte = (
                    Reporte.objects.select_for_update(skip_locked=True)
                    .filter(estado=Reporte.Estado.GENERANDO)
                    .order_by("fecha_generacion", "num")
                    .first()
                )
                if reporte is not None:
                    servicios.procesar_reporte(reporte)
            if una_vez:
                if reporte is None:
                    break
                continue
            if reporte is None:
                time.sleep(3)
                # El servidor suspende a diario: tras esperar, descarta conexiones vencidas.
                close_old_connections()
