import tempfile
from datetime import UTC, timedelta
from io import StringIO
from pathlib import Path

from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone

from apps.alertas.models import Alerta
from apps.mediciones.models import Lectura
from apps.reportes import ia, servicios
from apps.reportes.models import ProgramacionReporte, Reporte
from common.testing import Escenario, PruebaBase, cliente_de


class ReporteTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.ahora = timezone.now()
        valores = (20, 24, 30)
        lecturas = [
            Lectura.objects.create(
                sensor_num=self.e.dht22.pk,
                variable_codigo="TEMP",
                valor=valor,
                fecha_hora=self.ahora - timedelta(hours=3 - i),
            )
            for i, valor in enumerate(valores)
        ]
        # Una lectura del calentamiento del CCS811 no entra en los reportes.
        Lectura.objects.create(
            sensor_num=self.e.ccs811.pk,
            variable_codigo="AIRE",
            valor=9000,
            fecha_hora=self.ahora - timedelta(hours=1),
            estabilizada=False,
        )
        Alerta.objects.create(
            umbral=self.e.umbral_temp,
            lectura_num=lecturas[2].num,
            lectura_fecha_hora=lecturas[2].fecha_hora,
            lectura_valor=lecturas[2].valor,
            nivel=Alerta.Nivel.PELIGRO,
            tipo=Alerta.Tipo.POR_ENCIMA,
        )
        self.inicio = self.ahora - timedelta(days=1)
        self.solicitud = {
            "periodo_inicio": self.inicio.isoformat(),
            "periodo_fin": self.ahora.isoformat(),
        }

    def test_las_cifras_se_calculan_en_el_backend(self):
        cifras = servicios.calcular_cifras(self.e.organizacion, None, self.inicio, self.ahora)
        temperatura = cifras["variables"]["TEMP"]
        self.assertEqual(temperatura["promedio"], 24.67)
        self.assertEqual(temperatura["minimo"], 20.0)
        self.assertEqual(temperatura["maximo"], 30.0)
        self.assertEqual(temperatura["muestras"], 3)
        self.assertEqual(cifras["alertas"]["total"], 1)
        self.assertEqual(cifras["alertas"]["por_tipo"], {"POR_ENCIMA": 1})
        self.assertEqual(cifras["alertas"]["por_nivel"], {"PELIGRO": 1})
        self.assertNotIn("AIRE", cifras["variables"])
        self.assertEqual(cifras["intervalo_serie"], "hora")
        serie = cifras["series"]["TEMP"]
        self.assertEqual([p["maximo"] for p in serie], [20.0, 24.0, 30.0])
        self.assertNotIn("AIRE", cifras["series"])
        self.assertEqual(
            cifras["dispositivos"][self.e.dispositivo.codigo_mqtt]["TEMP"]["promedio"], 24.67
        )

    def test_las_cifras_de_otra_area_o_organizacion_no_se_mezclan(self):
        otro = Escenario("b")
        Lectura.objects.create(
            sensor_num=otro.dht22.pk, variable_codigo="TEMP", valor=70, fecha_hora=self.ahora
        )
        cifras = servicios.calcular_cifras(self.e.organizacion, None, self.inicio, self.ahora)
        self.assertEqual(cifras["variables"]["TEMP"]["maximo"], 30.0)
        de_otra_area = servicios.calcular_cifras(
            self.e.organizacion, self.e.otra_area, self.inicio, self.ahora
        )
        self.assertEqual(de_otra_area["variables"], {})

    def test_sin_servicio_de_ia_responde_503_y_no_guarda_nada(self):
        r = cliente_de(self.e.analista).post("/api/v1/reportes/", self.solicitud, format="json")
        self.assertEqual(r.status_code, 503)
        self.assertFalse(Reporte.objects.exists())

    def test_genera_reporte_con_texto_de_la_ia_y_pdf(self):
        with (
            tempfile.TemporaryDirectory() as carpeta,
            override_settings(IA_PROVEEDOR="prueba", MEDIA_ROOT=carpeta),
        ):
            ia.PROVEEDORES["prueba"] = lambda instrucciones, cifras: "La temperatura subió a 30 °C."
            self.addCleanup(ia.PROVEEDORES.pop, "prueba")
            cliente = cliente_de(self.e.analista)

            r = cliente.post("/api/v1/reportes/", self.solicitud, format="json")
            self.assertEqual(r.status_code, 201, r.content)
            cuerpo = r.json()
            self.assertEqual(cuerpo["contenido"], "La temperatura subió a 30 °C.")
            self.assertEqual(cuerpo["origen"], "MANUAL")
            self.assertEqual(cuerpo["cifras"]["variables"]["TEMP"]["maximo"], 30.0)
            self.assertTrue((Path(carpeta) / cuerpo["archivo_pdf"]).exists())

            pdf = cliente.get(f"/api/v1/reportes/{cuerpo['num']}/pdf/")
            self.assertEqual(pdf.status_code, 200)
            self.assertEqual(pdf["Content-Type"], "application/pdf")
            self.assertTrue(pdf.content.startswith(b"%PDF"))

    def test_el_operador_no_accede_a_reportes(self):
        self.assertEqual(cliente_de(self.e.operador).get("/api/v1/reportes/").status_code, 403)

    def test_periodo_invalido(self):
        invalido = {
            "periodo_inicio": self.ahora.isoformat(),
            "periodo_fin": self.inicio.isoformat(),
        }
        r = cliente_de(self.e.admin).post("/api/v1/reportes/", invalido, format="json")
        self.assertEqual(r.status_code, 400)

    def test_la_base_valida_el_periodo(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Reporte.objects.create(
                organizacion=self.e.organizacion,
                origen="MANUAL",
                periodo_inicio=self.ahora,
                periodo_fin=self.inicio,
                cifras={},
                contenido="x",
            )


class ProgramacionTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.ahora = timezone.now()

    def datos(self, **extra):
        base = {
            "frecuencia": "SEMANAL",
            "destinatarios": [self.e.supervisor.pk, self.e.analista.pk],
        }
        return {**base, **extra}

    def test_crea_una_programacion_con_proxima_ejecucion_por_defecto(self):
        r = cliente_de(self.e.analista).post(
            "/api/v1/programaciones-reporte/", self.datos(), format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        cuerpo = r.json()
        self.assertEqual(cuerpo["creada_por"], self.e.analista.pk)
        self.assertTrue(cuerpo["activa"])
        self.assertEqual(
            cuerpo["area"], self.e.area.pk
        )  # el analista con área solo programa la suya

    def test_el_administrador_programa_toda_la_organizacion(self):
        r = cliente_de(self.e.admin).post(
            "/api/v1/programaciones-reporte/", self.datos(area=None), format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()["area"])

    def test_los_destinatarios_deben_ser_de_la_misma_organizacion(self):
        otro = Escenario("b")
        r = cliente_de(self.e.admin).post(
            "/api/v1/programaciones-reporte/",
            self.datos(destinatarios=[otro.admin.pk]),
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("destinatarios", r.json())

    def test_exige_destinatarios_y_frecuencia_valida(self):
        cliente = cliente_de(self.e.admin)
        self.assertEqual(
            cliente.post(
                "/api/v1/programaciones-reporte/", self.datos(destinatarios=[]), format="json"
            ).status_code,
            400,
        )
        self.assertEqual(
            cliente.post(
                "/api/v1/programaciones-reporte/", self.datos(frecuencia="HORARIA"), format="json"
            ).status_code,
            400,
        )

    def test_la_base_exige_destinatarios(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ProgramacionReporte.objects.create(
                organizacion=self.e.organizacion,
                creada_por=self.e.admin,
                frecuencia="DIARIA",
                destinatarios=[],
                proxima_ejecucion=self.ahora,
            )

    def test_el_operador_no_programa_reportes(self):
        r = cliente_de(self.e.operador).post(
            "/api/v1/programaciones-reporte/", self.datos(), format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_cada_organizacion_ve_solo_sus_programaciones(self):
        cliente_de(self.e.admin).post(
            "/api/v1/programaciones-reporte/", self.datos(), format="json"
        )
        otro = Escenario("b")
        r = cliente_de(otro.admin).get("/api/v1/programaciones-reporte/")
        self.assertEqual(r.json()["results"], [])

    def test_desplazar_respeta_el_fin_de_mes(self):
        from datetime import datetime

        fecha = datetime(2026, 1, 31, 8, 0, tzinfo=UTC)
        self.assertEqual(servicios.desplazar(fecha, "MENSUAL", 1).date().isoformat(), "2026-02-28")
        self.assertEqual(servicios.desplazar(fecha, "MENSUAL", -1).date().isoformat(), "2025-12-31")
        self.assertEqual(servicios.desplazar(fecha, "SEMANAL", 1).date().isoformat(), "2026-02-07")
        self.assertEqual(servicios.desplazar(fecha, "DIARIA", -1).date().isoformat(), "2026-01-30")

    def test_la_tarea_genera_envia_y_reprograma(self):
        programacion = ProgramacionReporte.objects.create(
            organizacion=self.e.organizacion,
            creada_por=self.e.analista,
            frecuencia="DIARIA",
            destinatarios=[self.e.supervisor.pk, self.e.operador.pk],
            proxima_ejecucion=self.ahora - timedelta(hours=1),
        )
        futura = ProgramacionReporte.objects.create(
            organizacion=self.e.organizacion,
            creada_por=self.e.analista,
            frecuencia="DIARIA",
            destinatarios=[self.e.admin.pk],
            proxima_ejecucion=self.ahora + timedelta(days=1),
        )
        with (
            tempfile.TemporaryDirectory() as carpeta,
            override_settings(IA_PROVEEDOR="prueba", MEDIA_ROOT=carpeta),
        ):
            ia.PROVEEDORES["prueba"] = lambda instrucciones, cifras: "Todo normal."
            self.addCleanup(ia.PROVEEDORES.pop, "prueba")
            call_command("generar_reportes_programados", stdout=StringIO())

        reporte = Reporte.objects.get()
        self.assertEqual(reporte.origen, "PROGRAMADO")
        self.assertEqual(reporte.generado_por, self.e.analista)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            sorted(mail.outbox[0].to), sorted([self.e.supervisor.correo, self.e.operador.correo])
        )
        self.assertEqual(mail.outbox[0].attachments[0][0], f"reporte-{reporte.num}.pdf")
        programacion.refresh_from_db()
        futura.refresh_from_db()
        self.assertIsNotNone(programacion.ultima_ejecucion)
        self.assertGreater(programacion.proxima_ejecucion, self.ahora)
        self.assertIsNone(futura.ultima_ejecucion)

    def test_sin_ia_la_programacion_sigue_vencida(self):
        programacion = ProgramacionReporte.objects.create(
            organizacion=self.e.organizacion,
            creada_por=self.e.analista,
            frecuencia="DIARIA",
            destinatarios=[self.e.admin.pk],
            proxima_ejecucion=self.ahora - timedelta(hours=1),
        )
        with self.assertRaises(CommandError):
            call_command("generar_reportes_programados", stdout=StringIO(), stderr=StringIO())
        programacion.refresh_from_db()
        self.assertIsNone(programacion.ultima_ejecucion)
        self.assertFalse(Reporte.objects.exists())
