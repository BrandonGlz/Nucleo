from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connections


class Command(BaseCommand):
    help = (
        "Aplica la retención de lecturas de NUCLEO_LECTURAS_RETENCION_DIAS en TimescaleDB: con un "
        "número, una política borra cada día las lecturas más viejas; con 0 (por defecto) se "
        "guardan todas y se quita la política si existía. Lo corre deploy/instalar.sh."
    )

    def handle(self, *args, **opciones):
        dias = settings.NUCLEO_LECTURAS_RETENCION_DIAS
        with connections["iot"].cursor() as cursor:
            cursor.execute("SELECT remove_retention_policy('lectura', if_exists => true)")
            if dias > 0:
                cursor.execute(
                    "SELECT add_retention_policy('lectura', make_interval(days => %s))", [dias]
                )
        if dias > 0:
            self.stdout.write(f"Retención de lecturas: se borran las de más de {dias} días.")
        else:
            self.stdout.write("Retención de lecturas: desactivada; se guardan todas (comprimidas).")
