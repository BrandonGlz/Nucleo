from django.test import TestCase

from apps.catalogos.models import (
    EstadoDispositivo,
    EstadoSensor,
    EstadoUsuario,
    Rol,
    VariableAmbiental,
)


class CatalogosInicialesTests(TestCase):
    def test_los_catalogos_traen_los_codigos_del_modelo(self):
        self.assertEqual(
            set(Rol.objects.values_list("codigo", flat=True)),
            {"ADMINPLAT", "ADMIN", "SUPER", "ANALISTA", "OPER"},
        )
        self.assertEqual(EstadoUsuario.objects.count(), 3)
        self.assertEqual(
            set(EstadoDispositivo.objects.values_list("codigo", flat=True)),
            {"LINEA", "CALENT", "SINCONEX", "BATBAJA", "MANT", "BAJA"},
        )
        self.assertEqual(EstadoSensor.objects.count(), 3)
        self.assertEqual(
            dict(VariableAmbiental.objects.values_list("codigo", "unidad")),
            {"TEMP": "°C", "HUM": "%HR", "AIRE": "ppm"},
        )

    def test_las_variables_traen_su_rango_fisico(self):
        rangos = {
            v.codigo: (int(v.rango_min), int(v.rango_max)) for v in VariableAmbiental.objects.all()
        }
        self.assertEqual(rangos, {"TEMP": (-40, 80), "HUM": (0, 100), "AIRE": (0, 10000)})
