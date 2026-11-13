from django.db import migrations


def consolidar(apps, schema_editor):
    """Los documentos (SOUL, IDENTITY…) pasan a ser secciones de un único NICO.md. Lo que ya se
    había escrito se conserva; un documento extra queda como una sección más con su nombre."""
    from apps.nico.configuracion import (
        CONTENIDO_BASE,
        DESCRIPCION_DOCUMENTO,
        DOCUMENTO,
        SECCIONES,
        componer,
    )

    DocumentoNico = apps.get_model("nico", "DocumentoNico")
    existentes = {d.clave: d for d in DocumentoNico.objects.order_by("orden", "num")}
    if DOCUMENTO in existentes:
        return
    secciones = [
        (titulo, (existentes[clave].contenido if clave in existentes else "") or CONTENIDO_BASE[clave])
        for clave, titulo, _ in SECCIONES
    ]
    base = {clave for clave, _, _ in SECCIONES}
    secciones += [(d.clave.title(), d.contenido) for d in existentes.values() if d.clave not in base and d.contenido.strip()]
    DocumentoNico.objects.exclude(clave=DOCUMENTO).delete()
    DocumentoNico.objects.create(
        clave=DOCUMENTO, descripcion=DESCRIPCION_DOCUMENTO, contenido=componer(secciones), activo=False
    )


class Migration(migrations.Migration):
    dependencies = [("nico", "0003_documentos_apagados")]

    operations = [migrations.RunPython(consolidar, migrations.RunPython.noop)]
