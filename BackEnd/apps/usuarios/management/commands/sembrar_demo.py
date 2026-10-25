import secrets

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.dispositivos.models import Dispositivo, Sensor
from apps.organizaciones.models import Area, Organizacion
from apps.umbrales.models import Umbral
from apps.usuarios.models import Usuario
from common import roles

USUARIOS = [
    (roles.ADMIN_PLATAFORMA, "Pablo", "Plataforma", "plataforma"),
    (roles.ADMIN, "Ada", "Administradora", "admin"),
    (roles.SUPERVISOR, "Sergio", "Supervisor", "supervisor"),
    (roles.ANALISTA, "Ana", "Analista", "analista"),
    (roles.OPERADOR, "Omar", "Operador", "operador"),
]
SENSORES = [
    ("DHT22", "Temperatura y humedad relativa"),
    ("CCS811", "Calidad del aire (eCO2)"),
]
# (variable, peligro_min, advertencia_min, advertencia_max, peligro_max)
UMBRALES = [("TEMP", 15, 18, 25, 28), ("HUM", 20, 30, 60, 70), ("AIRE", 0, 0, 1000, 2000)]


class Command(BaseCommand):
    help = (
        "Crea datos de demostración: organización, área, un usuario por rol (incluido el "
        "administrador de plataforma) y un dispositivo."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dominio", default="nucleo.local", help="Dominio de los correos de demostración."
        )

    @transaction.atomic
    def handle(self, *args, dominio, **opciones):
        if not settings.DEBUG:
            raise CommandError("Este comando solo se ejecuta con DJANGO_DEBUG=True.")

        organizacion, _ = Organizacion.objects.get_or_create(
            nombre="Universidad Tecnológica de Tijuana", defaults={"ciudad": "Tijuana"}
        )
        area, _ = Area.objects.get_or_create(
            organizacion=organizacion,
            nombre="Laboratorio",
            defaults={"descripcion": "Prueba piloto"},
        )

        usuarios = {}
        for rol, nombre, apellido, alias in USUARIOS:
            correo = f"{alias}@{dominio}"
            usuario = Usuario.objects.filter(correo=correo).first()
            if usuario is None:
                clave = secrets.token_urlsafe(12)
                usuario = Usuario.objects.create_user(
                    correo,
                    clave,
                    organizacion=None if rol == roles.ADMIN_PLATAFORMA else organizacion,
                    area=None if rol in (roles.ADMIN, roles.ADMIN_PLATAFORMA) else area,
                    rol_id=rol,
                    nombre=nombre,
                    primer_apellido=apellido,
                )
                self.stdout.write(f"{correo}  contraseña: {clave}")
            usuarios[rol] = usuario

        dispositivo, creado = Dispositivo.objects.get_or_create(
            codigo_mqtt="NUC-001",
            defaults={
                "area": area,
                "nombre": "Nodo de laboratorio",
                "operador": usuarios[roles.OPERADOR],
                "registrado_por": usuarios[roles.ADMIN],
            },
        )
        if creado:
            for modelo, funcion in SENSORES:
                Sensor.objects.create(dispositivo=dispositivo, modelo=modelo, funcion=funcion)
            for variable, peligro_min, adv_min, adv_max, peligro_max in UMBRALES:
                Umbral.objects.create(
                    dispositivo=dispositivo,
                    variable_id=variable,
                    configurado_por=usuarios[roles.ADMIN],
                    peligro_min=peligro_min,
                    advertencia_min=adv_min,
                    advertencia_max=adv_max,
                    peligro_max=peligro_max,
                )
        self.stdout.write(self.style.SUCCESS("Datos de demostración listos."))
