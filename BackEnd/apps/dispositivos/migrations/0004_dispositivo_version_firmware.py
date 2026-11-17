from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dispositivos', '0003_dispositivo_puente_ia'),
    ]

    operations = [
        migrations.AddField(
            model_name='dispositivo',
            name='version_firmware',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='dispositivo',
            name='version_reportada_en',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
