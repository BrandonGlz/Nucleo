from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.auditoria.models import RegistroAuditoria


class Command(BaseCommand):
    help = "Borra los registros de auditoría más viejos que NUCLEO_AUDITORIA_DIAS (365)."

    def add_arguments(self, parser):
        parser.add_argument("--dias", type=int, default=settings.NUCLEO_AUDITORIA_DIAS)

    def handle(self, *args, dias, **opciones):
        limite = timezone.now() - timedelta(days=dias)
        borrados, _ = RegistroAuditoria.objects.filter(fecha_hora__lt=limite).delete()
        self.stdout.write(f"Registros de auditoría borrados (más de {dias} días): {borrados}")
