"""Códigos iniciales de los catálogos del modelo relacional."""

from django.db import migrations

ROLES = [
    (
        "ADMINPLAT",
        "Administrador de plataforma",
        "Equipo Núcleo: alta, baja y suspensión de organizaciones",
    ),
    (
        "ADMIN",
        "Administrador",
        "Áreas, dispositivos, usuarios, permisos y umbrales de su organización",
    ),
    ("SUPER", "Supervisor", "Operadores de su área, umbrales, intervalo de muestreo y alertas"),
    ("ANALISTA", "Analista", "Histórico de mediciones y reportes con IA"),
    ("OPER", "Operador", "Monitoreo en tiempo real de su dispositivo asignado"),
]
ESTADOS_USUARIO = [("ACT", "Activo"), ("INA", "Inactivo"), ("BLQ", "Bloqueado")]
ESTADOS_DISPOSITIVO = [
    ("LINEA", "En línea", "Envía lecturas con normalidad"),
    ("CALENT", "Calentando", "Primeros 20 minutos del CCS811 tras el arranque"),
    ("SINCONEX", "Sin conexión", "Más de 3 intervalos de muestreo sin lecturas"),
    ("BATBAJA", "Batería baja", "Nivel de batería bajo"),
    ("MANT", "Mantenimiento", "Fuera de servicio por mantenimiento"),
    ("BAJA", "Dado de baja", "Ya no se utiliza"),
]
ESTADOS_SENSOR = [
    ("OPERA", "Operando"),
    ("CALIB", "Requiere calibración"),
    ("FALLA", "Falla"),
]
VARIABLES = [
    ("TEMP", "Temperatura", "°C", -40, 80),
    ("HUM", "Humedad relativa", "%HR", 0, 100),
    ("AIRE", "Calidad del aire (eCO2)", "ppm", 0, 10000),
]


def cargar_catalogos(apps, schema_editor):
    Rol = apps.get_model("catalogos", "Rol")
    EstadoUsuario = apps.get_model("catalogos", "EstadoUsuario")
    EstadoDispositivo = apps.get_model("catalogos", "EstadoDispositivo")
    EstadoSensor = apps.get_model("catalogos", "EstadoSensor")
    VariableAmbiental = apps.get_model("catalogos", "VariableAmbiental")

    for codigo, nombre, descripcion in ROLES:
        Rol.objects.update_or_create(
            codigo=codigo, defaults={"nombre": nombre, "descripcion": descripcion}
        )
    for codigo, nombre in ESTADOS_USUARIO:
        EstadoUsuario.objects.update_or_create(codigo=codigo, defaults={"nombre": nombre})
    for codigo, nombre, descripcion in ESTADOS_DISPOSITIVO:
        EstadoDispositivo.objects.update_or_create(
            codigo=codigo, defaults={"nombre": nombre, "descripcion": descripcion}
        )
    for codigo, nombre in ESTADOS_SENSOR:
        EstadoSensor.objects.update_or_create(codigo=codigo, defaults={"nombre": nombre})
    for codigo, nombre, unidad, rango_min, rango_max in VARIABLES:
        VariableAmbiental.objects.update_or_create(
            codigo=codigo,
            defaults={
                "nombre": nombre,
                "unidad": unidad,
                "rango_min": rango_min,
                "rango_max": rango_max,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("catalogos", "0001_initial")]

    operations = [migrations.RunPython(cargar_catalogos, migrations.RunPython.noop)]
