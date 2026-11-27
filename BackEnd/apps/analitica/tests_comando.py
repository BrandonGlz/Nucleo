"""Prueba del comando de medición de rendimiento."""

from io import StringIO

from django.core.management import call_command

from common.testing import Escenario, PruebaBase


class MedirAnaliticaTests(PruebaBase):
    def test_imprime_las_paginas_de_las_cuatro_plantillas(self):
        Escenario()
        salida = StringIO()
        call_command("medir_analitica", "--periodo", "7d", stdout=salida)
        texto = salida.getvalue()
        for nombre in (
            "Ejecutivo › Resumen",
            "Calidad ambiental › Temperatura",
            "Alertas y respuesta › Alertas",
            "Disponibilidad y operación › Operación",
        ):
            self.assertIn(nombre, texto)
        self.assertIn("Total", texto)
