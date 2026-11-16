"""Convierte los tokens de DRF (uno por persona) en sesiones, para que nadie pierda la suya al
actualizar. Se guarda solo el SHA-256 de la clave; el cliente se desconoce («Sesión anterior»)."""

import hashlib

from django.db import migrations


def copiar(apps, schema_editor):
    Token = apps.get_model("authtoken", "Token")
    Sesion = apps.get_model("usuarios", "Sesion")
    Sesion.objects.bulk_create(
        [
            Sesion(
                usuario_id=t.user_id,
                clave_hash=hashlib.sha256(t.key.encode()).hexdigest(),
                agente="Sesión anterior a la actualización",
                ultimo_uso=t.created,
            )
            for t in Token.objects.all()
        ],
        ignore_conflicts=True,
    )
    Token.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("usuarios", "0004_sesion"),
        ("authtoken", "0004_alter_tokenproxy_options"),
    ]

    operations = [migrations.RunPython(copiar, migrations.RunPython.noop)]
