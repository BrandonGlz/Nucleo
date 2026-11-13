from django.db import migrations


def llenar(apps, schema_editor):
    """Los documentos base que siguen vacíos reciben su contenido de ejemplo y se activan."""
    from apps.nico.configuracion import CONTENIDO_BASE

    DocumentoNico = apps.get_model("nico", "DocumentoNico")
    for doc in DocumentoNico.objects.filter(clave__in=CONTENIDO_BASE, contenido=""):
        doc.contenido = CONTENIDO_BASE[doc.clave]
        doc.activo = True
        doc.save(update_fields=["contenido", "activo"])


class Migration(migrations.Migration):
    dependencies = [("nico", "0001_initial")]

    operations = [migrations.RunPython(llenar, migrations.RunPython.noop)]
