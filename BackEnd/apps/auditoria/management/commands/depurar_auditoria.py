from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.auditoria.models import RegistroAuditoria


class Command(BaseCommand):
    help = "Borra los registros de auditoría más viejos que los días de la política de seguridad."

    def add_arguments(self, parser):
        parser.add_argument("--dias", type=int, default=None)

    def handle(self, *args, dias, **opciones):
        if dias is None:
            from apps.consola.politicas import politica

            dias = politica().dias_auditoria
        limite = timezone.now() - timedelta(days=dias)
        borrados, _ = RegistroAuditoria.objects.filter(fecha_hora__lt=limite).delete()
        self.stdout.write(f"Registros de auditoría borrados (más de {dias} días): {borrados}")
