# Compresión de TimescaleDB para las lecturas: los chunks de más de 30 días se comprimen solos
# (columnar, agrupado por sensor y variable). No borra nada: las consultas, los reportes y los
# respaldos siguen igual; solo ocupan mucho menos disco. La retención (borrar lecturas viejas) es
# aparte y opcional: manage.py retencion_lecturas con NUCLEO_LECTURAS_RETENCION_DIAS.

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("mediciones", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "ALTER TABLE lectura SET ("
                "timescaledb.compress, "
                "timescaledb.compress_segmentby = 'sensor_num, variable_codigo', "
                "timescaledb.compress_orderby = 'fecha_hora DESC')",
                "SELECT add_compression_policy('lectura', INTERVAL '30 days', if_not_exists => true)",
            ],
            reverse_sql=[
                "SELECT remove_compression_policy('lectura', if_exists => true)",
                "SELECT decompress_chunk(c, true) FROM show_chunks('lectura') c",
                "ALTER TABLE lectura SET (timescaledb.compress = false)",
            ],
        ),
    ]
