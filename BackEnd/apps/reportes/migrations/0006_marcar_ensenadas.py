"""Corrige las preguntas «No entendidas» que ya se enseñaron antes de existir ``ensenada``.

Hasta ahora «Enseñar» en el registro de la consola solo creaba la respuesta en el banco: la
pregunta original seguía como no entendida. Aquí se enlaza cada pregunta no entendida con la
respuesta fija o ruta que hoy existe para esa misma pregunta (normalizada) en su organización.
"""

from django.db import migrations


def marcar(apps, schema_editor):
    PreguntaAgente = apps.get_model("reportes", "PreguntaAgente")
    RespuestaAprendida = apps.get_model("reportes", "RespuestaAprendida")
    respuestas = {}
    # FIJA antes que RUTA: si hay las dos, se enlaza la respuesta escrita.
    for r in RespuestaAprendida.objects.filter(tema__in=["RUTA", "FIJA"]).order_by("tema", "num"):
        respuestas.setdefault((r.organizacion_id, r.pregunta_normalizada), r)
    if not respuestas:
        return
    pendientes = PreguntaAgente.objects.filter(
        via="NO_ENTENDIDA", ensenada__isnull=True
    ).select_related("dispositivo__area")
    for p in pendientes.iterator():
        clave = (p.dispositivo.area.organizacion_id, p.pregunta_normalizada[:500])
        r = respuestas.get(clave)
        if r is not None:
            PreguntaAgente.objects.filter(pk=p.pk).update(
                ensenada=r, fecha_ensenada=r.fecha_creacion
            )


class Migration(migrations.Migration):
    dependencies = [
        ("reportes", "0005_pregunta_ensenada"),
    ]

    operations = [migrations.RunPython(marcar, migrations.RunPython.noop)]
