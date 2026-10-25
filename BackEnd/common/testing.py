"""Datos de prueba compartidos por las pruebas de las apps."""

from django.core.cache import cache
from django.test import TestCase, TransactionTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.dispositivos.models import Dispositivo, Sensor
from apps.organizaciones.models import Area, Organizacion
from apps.umbrales.models import Umbral
from apps.usuarios.models import Usuario
from common import roles

CLAVE = "Clave-de-prueba-2026"


class PruebaBase(TestCase):
    """Base de las pruebas con base de datos: usa nucleo_db y nucleo_iot (lecturas)."""

    databases = {"default", "iot"}


class Escenario:
    """Una organización con un área, un usuario por rol y un dispositivo con sensores."""

    def __init__(self, sufijo="a"):
        cache.clear()  # el límite de intentos de inicio de sesión se acumula entre pruebas
        self.organizacion = Organizacion.objects.create(nombre=f"Organización {sufijo}")
        self.area = Area.objects.create(organizacion=self.organizacion, nombre=f"Área {sufijo}")
        self.otra_area = Area.objects.create(
            organizacion=self.organizacion, nombre=f"Otra {sufijo}"
        )
        self.admin = self.usuario(roles.ADMIN, f"admin-{sufijo}", area=None)
        self.plataforma = Usuario.objects.create_superuser(
            f"plataforma-{sufijo}@prueba.local",
            CLAVE,
            nombre="Plataforma",
            primer_apellido="Prueba",
        )
        self.supervisor = self.usuario(roles.SUPERVISOR, f"super-{sufijo}")
        self.analista = self.usuario(roles.ANALISTA, f"analista-{sufijo}")
        self.operador = self.usuario(roles.OPERADOR, f"oper-{sufijo}")
        self.dispositivo = Dispositivo.objects.create(
            area=self.area,
            nombre=f"Nodo {sufijo}",
            codigo_mqtt=f"NUC-{sufijo.upper()}",
            operador=self.operador,
            registrado_por=self.admin,
        )
        self.dht22 = Sensor.objects.create(dispositivo=self.dispositivo, modelo="DHT22")
        self.ccs811 = Sensor.objects.create(dispositivo=self.dispositivo, modelo="CCS811")
        # Advertencia fuera de 18 a 25 °C y peligro fuera de 15 a 28 °C.
        self.umbral_temp = Umbral.objects.create(
            dispositivo=self.dispositivo,
            variable_id=roles.VARIABLE_TEMPERATURA,
            configurado_por=self.admin,
            peligro_min=15,
            advertencia_min=18,
            advertencia_max=25,
            peligro_max=28,
        )

    def usuario(self, rol, alias, area="por_defecto"):
        return Usuario.objects.create_user(
            f"{alias}@prueba.local",
            CLAVE,
            organizacion=self.organizacion,
            area=self.area if area == "por_defecto" else area,
            rol_id=rol,
            nombre=alias,
            primer_apellido="Prueba",
        )


class PruebaTransaccional(TransactionTestCase):
    """Para el canal en vivo: Channels cierra conexiones y necesita transacciones reales.

    ``serialized_rollback`` restaura los catálogos que cargan las migraciones.
    """

    databases = {"default", "iot"}
    serialized_rollback = True


def cliente_de(usuario):
    """Cliente de API autenticado con el token del usuario."""
    token, _ = Token.objects.get_or_create(user=usuario)
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return cliente
