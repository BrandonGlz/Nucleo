"""Manda por correo un aviso de operación del servidor.

Lo usan ``deploy/aviso_fallo.sh`` (cuando un servicio de systemd falla) y
``deploy/probar_restauracion.sh`` (resultado de la prueba mensual). Va a
``NUCLEO_CORREOS_AVISOS`` o, si está vacía, a los administradores de plataforma activos.

    manage.py avisar_servidor --asunto "..." --mensaje "..."
    journalctl -u x | manage.py avisar_servidor --asunto "..." --stdin
"""

import sys

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError

from apps.usuarios.models import Usuario
from common import roles


def destinatarios():
    if settings.NUCLEO_CORREOS_AVISOS:
        return list(settings.NUCLEO_CORREOS_AVISOS)
    return [
        u.correo
        for u in Usuario.objects.filter(
            rol_id=roles.ADMIN_PLATAFORMA, estado_usuario_id=roles.USUARIO_ACTIVO
        )
    ]


class Command(BaseCommand):
    help = "Manda por correo un aviso del servidor a los responsables de la plataforma."

    def add_arguments(self, parser):
        parser.add_argument("--asunto", required=True)
        parser.add_argument("--mensaje", default="")
        parser.add_argument("--stdin", action="store_true", help="Agrega al mensaje la entrada.")

    def handle(self, *args, asunto, mensaje, stdin, **opciones):
        cuerpo = mensaje
        if stdin:
            cuerpo = (cuerpo + "\n\n" if cuerpo else "") + sys.stdin.read()[-20000:]
        para = destinatarios()
        if not para:
            raise CommandError("No hay destinatarios (NUCLEO_CORREOS_AVISOS ni ADMINPLAT).")
        send_mail(f"[Núcleo · servidor] {asunto}", cuerpo, settings.DEFAULT_FROM_EMAIL, para)
        self.stdout.write(f"Aviso enviado a {len(para)} destinatario(s).")
