from django.db import migrations


def apagar(apps, schema_editor):
    """Los documentos dejan de ir en cada petición a la IA (cada respuesta tardaba ~3-4 s más):
    se convierten una vez en respuestas del banco desde la consola."""
    apps.get_model("nico", "DocumentoNico").objects.update(activo=False)


class Migration(migrations.Migration):
    dependencies = [("nico", "0002_contenido_base_documentos")]

    operations = [migrations.RunPython(apagar, migrations.RunPython.noop)]
