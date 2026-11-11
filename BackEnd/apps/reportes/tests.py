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
from apps.reportes import agente, aprendizaje, ia, puente, servicios
from apps.reportes.models import PreguntaAgente, ProgramacionReporte, Reporte, RespuestaAprendida
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

    @override_settings(IA_PROVEEDOR="")
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

    @override_settings(IA_PROVEEDOR="")
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


class AgenteTests(PruebaBase):
    def setUp(self):
        # Los reportes que genera el agente guardan su PDF: van a una carpeta temporal
        carpeta = tempfile.mkdtemp()
        medios = override_settings(MEDIA_ROOT=carpeta)
        medios.enable()
        self.addCleanup(medios.disable)
        self.e = Escenario()
        ahora = timezone.now()
        for i, valor in enumerate((22, 26.4, 23)):
            Lectura.objects.create(
                sensor_num=self.e.dht22.pk,
                variable_codigo="TEMP",
                valor=valor,
                fecha_hora=ahora - timedelta(minutes=5 - i),
            )
        self.pregunta = {
            "pregunta": "¿Hubo picos de temperatura?",
            "dispositivo": self.e.dispositivo.pk,
        }

    def test_responde_con_las_lecturas_del_dispositivo(self):
        r = cliente_de(self.e.analista).post("/api/v1/agente/", self.pregunta, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        cuerpo = r.json()
        self.assertEqual(cuerpo["picos"][0]["valor"], 26.4)
        self.assertEqual(cuerpo["maximo"], 25.0)
        self.assertIn("Ahora marca 23.0 °C", cuerpo["texto"])

    def test_pregunta_fuera_de_tema(self):
        r = cliente_de(self.e.supervisor).post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "¿Quién ganó el partido?"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn("Solo puedo responder", r.json()["texto"])

    def test_operador_necesita_permiso(self):
        cliente = cliente_de(self.e.operador)
        self.assertEqual(
            cliente.post("/api/v1/agente/", self.pregunta, format="json").status_code, 403
        )
        self.e.operador.acceso_agente = True
        self.e.operador.save(update_fields=["acceso_agente"])
        self.assertEqual(
            cliente.post("/api/v1/agente/", self.pregunta, format="json").status_code, 200
        )

    def _preguntar(self, usuario, pregunta):
        r = cliente_de(usuario).post(
            "/api/v1/agente/", {**self.pregunta, "pregunta": pregunta}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_grafica_suelta_sin_generar_reporte(self):
        cuerpo = self._preguntar(
            self.e.analista, "Muéstrame solo la gráfica de temperatura de los últimos 2 días"
        )
        grafica = cuerpo["grafica"]
        self.assertEqual((grafica["elemento"], grafica["variable"]), ("serie", "TEMP"))
        self.assertEqual(grafica["cifras"]["variables"]["TEMP"]["maximo"], 26.4)
        self.assertIn("máximo de 26.4 °C", cuerpo["texto"])
        self.assertFalse(Reporte.objects.exists())

    def test_dashboard_y_seguimiento_sin_tema(self):
        cuerpo = self._preguntar(self.e.analista, "dame un dashboard de la temperatura")
        self.assertEqual(cuerpo["grafica"]["variable"], "TEMP")
        r = cliente_de(self.e.analista).post(
            "/api/v1/agente/",
            {
                **self.pregunta,
                "pregunta": "¿y el dashboard?",
                "anterior": "¿cómo estuvo la temperatura?",
            },
            format="json",
        )
        self.assertEqual(r.json()["grafica"]["variable"], "TEMP")
        # Con tema propio no se mezcla con la anterior.
        r = cliente_de(self.e.analista).post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "¿y las alertas?", "anterior": "dame un dashboard"},
            format="json",
        )
        self.assertNotIn("grafica", r.json())

    def test_ultimo_dia_registrado_y_por_dispositivo(self):
        cuerpo = self._preguntar(
            self.e.analista, "dame la temperatura del ultimo dia registrado en una grafica"
        )
        grafica = cuerpo["grafica"]
        self.assertIn("último día registrado", grafica["descripcion"])
        self.assertEqual(grafica["donde"], self.e.dispositivo.nombre)
        self.assertEqual(grafica["cifras"]["intervalo_serie"], "hora")
        area = self._preguntar(self.e.analista, "gráfica de temperatura de toda el área")
        self.assertEqual(area["grafica"]["donde"], self.e.dispositivo.area.nombre)

    def test_ultimo_mes_registrado_y_periodos_relativos(self):
        cuerpo = self._preguntar(
            self.e.analista, "dame una grafica de la temperatura del ultimo mes registrado"
        )
        self.assertIn("último mes registrado", cuerpo["grafica"]["descripcion"])
        hoy = timezone.localtime()
        self.assertEqual(
            timezone.localtime(
                timezone.datetime.fromisoformat(cuerpo["grafica"]["periodo_inicio"])
            ).day,
            1,
        )
        for frase, dias in (("último mes", 30), ("últimas 2 semanas", 14), ("último año", 365)):
            inicio, fin, _ = agente.periodo_de(f"temperatura del {frase}", ahora=hoy)
            self.assertEqual((fin - inicio).days, dias, frase)

    def test_grafica_de_alertas(self):
        cuerpo = self._preguntar(self.e.supervisor, "Gráfica de alertas del reporte")
        self.assertEqual(cuerpo["grafica"]["elemento"], "alertas")
        self.assertFalse(Reporte.objects.exists())

    def test_comparativa_de_periodos(self):
        for frase in ("Compara la temperatura con la semana anterior", "Haz una cooperativa"):
            cuerpo = self._preguntar(self.e.analista, frase)
            comparativa = cuerpo["comparativa"]
            self.assertEqual(comparativa["tipo"], "periodos")
            fila = comparativa["filas"][0]
            self.assertEqual(
                (fila["variable"], fila["a"]["maximo"], fila["b"]["maximo"]), ("TEMP", 26.4, None)
            )
            self.assertIn("promedió", cuerpo["texto"])
        self.assertFalse(Reporte.objects.exists())

    def test_comparativa_entre_dispositivos_pide_dos(self):
        cuerpo = self._preguntar(self.e.supervisor, "Compara los dispositivos del área")
        self.assertNotIn("comparativa", cuerpo)
        self.assertIn("al menos dos dispositivos", cuerpo["texto"])

    def test_operador_ve_graficas_solo_de_su_dispositivo(self):
        self.e.operador.acceso_agente = True
        self.e.operador.save(update_fields=["acceso_agente"])
        cuerpo = self._preguntar(self.e.operador, "Gráfica de temperatura")
        self.assertEqual(cuerpo["grafica"]["donde"], self.e.dispositivo.nombre)
        cuerpo = self._preguntar(self.e.operador, "Compara los dispositivos")
        self.assertIn("no otros dispositivos", cuerpo["texto"])

    @override_settings(IA_PROVEEDOR="local")
    def test_genera_un_reporte_del_area_cuando_se_le_pide(self):
        r = cliente_de(self.e.supervisor).post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "Hazme un reporte de la temperatura de hoy"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        reporte = Reporte.objects.get(pk=r.json()["reporte"]["num"])
        self.assertEqual(reporte.origen, Reporte.Origen.AGENTE)
        self.assertEqual(reporte.area, self.e.dispositivo.area)
        self.assertEqual(reporte.generado_por, self.e.supervisor)
        resumen = r.json()["reporte"]
        self.assertEqual(resumen["titulo"].split(" · ")[0], self.e.dispositivo.area.nombre)
        self.assertEqual(resumen["lecturas"], 3)
        temperatura = next(v for v in resumen["variables"] if v["variable"] == "TEMP")
        self.assertEqual((temperatura["minimo"], temperatura["maximo"]), (22.0, 26.4))
        self.assertTrue(resumen["resumen"])

    @override_settings(IA_PROVEEDOR="local")
    def test_operador_no_genera_reportes(self):
        self.e.operador.acceso_agente = True
        self.e.operador.save(update_fields=["acceso_agente"])
        r = cliente_de(self.e.operador).post(
            "/api/v1/agente/", {**self.pregunta, "pregunta": "Dame un reporte"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("reporte", r.json())
        self.assertFalse(Reporte.objects.exists())

    @override_settings(IA_PROVEEDOR="")
    def test_reporte_sin_ia_no_se_guarda(self):
        r = cliente_de(self.e.analista).post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "informe del mes pasado"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn("no está disponible", r.json()["texto"])
        self.assertFalse(Reporte.objects.exists())

    def test_periodos_que_entiende(self):
        ahora = timezone.make_aware(timezone.datetime(2026, 11, 10, 12, 0))
        inicio, fin, texto = agente.periodo_de("reporte de octubre", ahora)
        self.assertEqual((inicio.month, inicio.day, fin.month, fin.day), (10, 1, 11, 1))
        self.assertEqual(texto, "octubre de 2026")
        inicio, _, texto = agente.periodo_de("reporte de diciembre", ahora)
        self.assertEqual((inicio.year, inicio.month), (2025, 12))
        inicio, fin, texto = agente.periodo_de("reporte de los últimos 3 días", ahora)
        self.assertEqual(fin - inicio, timedelta(days=3))
        _, _, texto = agente.periodo_de("un reporte", ahora)
        self.assertEqual(texto, "los últimos 7 días")
        _, _, texto = agente.periodo_de("reporte mensual", ahora)
        self.assertEqual(texto, "noviembre de 2026")

    def test_reconoce_peticiones_de_reporte(self):
        for pregunta in (
            "reporte de la semana",
            "Informe semanal",
            "resumen de esta semana",
            "repote de la semana",
            "genera el de la semana pasada",
            "hazme uno del mes pasado",
        ):
            self.assertTrue(agente.pide_reporte(pregunta), pregunta)
        for pregunta in ("¿cuál fue la temperatura máxima?", "¿está conectado?", "dame la humedad"):
            self.assertFalse(agente.pide_reporte(pregunta), pregunta)

    def test_dispositivo_de_otra_organizacion_no_existe(self):
        otra = Escenario("b")
        r = cliente_de(self.e.admin).post(
            "/api/v1/agente/", {**self.pregunta, "dispositivo": otra.dispositivo.pk}, format="json"
        )
        self.assertEqual(r.status_code, 404)

    def test_supervisor_concede_el_agente_a_un_operador(self):
        r = cliente_de(self.e.supervisor).patch(
            f"/api/v1/usuarios/{self.e.operador.pk}/", {"acceso_agente": True}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.e.operador.refresh_from_db()
        self.assertTrue(self.e.operador.acceso_agente)


class NicoAprendeTests(PruebaBase):
    """Puente del ESP32, IA, registro de preguntas y banco que aprende de las reacciones."""

    def setUp(self):
        AgenteTests.setUp(self)  # mismo escenario, sin volver a correr las pruebas de AgenteTests
        puente._cola = None
        self.addCleanup(setattr, puente, "_cola", None)
        self.cliente = cliente_de(self.e.analista)

    def _pedir(self, pregunta, estado=200):
        r = self.cliente.post(
            "/api/v1/agente/", {**self.pregunta, "pregunta": pregunta}, format="json"
        )
        self.assertEqual(r.status_code, estado, r.content)
        return r.json()

    def _esp(self, responder):
        """Un ESP32 simulado que toma una petición y devuelve ``responder(trabajo)``."""
        import threading

        def correr():
            trabajo = puente.tomar(self.e.dispositivo.codigo_mqtt, espera=5)
            if trabajo:
                puente.entregar(
                    self.e.dispositivo.codigo_mqtt, trabajo["id"], responder(trabajo), None, 120, 18
                )

        hilo = threading.Thread(target=correr)
        hilo.start()
        return hilo

    def test_sin_puente_registra_y_responde_predefinida(self):
        cuerpo = self._pedir("¿Hubo picos de temperatura?")
        self.assertEqual(cuerpo["via"], "PREDEFINIDA")
        registro = PreguntaAgente.objects.get(pk=cuerpo["registro"])
        self.assertEqual((registro.tema, registro.usuario), ("TEMP", self.e.analista))
        self.assertEqual(self._pedir("¿quién ganó el partido?")["via"], "NO_ENTENDIDA")

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k")
    def test_esp_inactivo_deshabilita_el_agente(self):
        cuerpo = self._pedir("¿Hubo picos de temperatura?", 503)
        self.assertTrue(cuerpo["inactivo"])
        estado = self.cliente.get("/api/v1/agente/estado/").json()
        self.assertEqual(
            estado, {"puente": True, "activos": [], "fisicos": [self.e.dispositivo.pk]}
        )

    @override_settings(IA_PUENTE_DISPOSITIVOS=["OTRO"], IA_PUENTE_CLAVE="k")
    def test_dispositivo_simulado_siempre_activo_y_sin_ia(self):
        cuerpo = self._pedir("explícame la temperatura")
        self.assertEqual(cuerpo["via"], "PREDEFINIDA")
        estado = self.cliente.get("/api/v1/agente/estado/").json()
        self.assertEqual(estado["activos"], [self.e.dispositivo.pk])

    @override_settings(
        IA_VOTOS_PARA_APRENDER=1,
        IA_PUENTE_DISPOSITIVOS=["NUC-A"],
        IA_PUENTE_CLAVE="k",
        IA_ESPERA_SEGUNDOS=5,
    )
    def test_ia_por_el_esp_y_banco_con_reacciones(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        hilo = self._esp(lambda t: "Ahora está en 23 °C y el máximo fue 26.4 °C; no es grave.")
        cuerpo = self._pedir("explícame la temperatura")
        hilo.join()
        self.assertEqual(cuerpo["via"], "IA")
        self.assertIn("no es grave", cuerpo["texto"])
        # 👍: se guarda como plantilla con las cifras como espacios.
        r = self.cliente.post(
            "/api/v1/agente/calificar/",
            {"registro": cuerpo["registro"], "voto": "si"},
            format="json",
        )
        self.assertTrue(r.json()["aprendida"])
        aprendida = RespuestaAprendida.objects.get()
        self.assertEqual(
            aprendida.plantilla,
            "Ahora está en {actual} °C y el máximo fue {maximo} °C; no es grave.",
        )
        # La misma pregunta sale del banco, sin IA y con la lectura nueva.
        Lectura.objects.create(
            sensor_num=self.e.dht22.pk,
            variable_codigo="TEMP",
            valor=24.5,
            fecha_hora=timezone.now(),
        )
        self._pedir("¿hay alertas?")  # corta la racha: si no, sería una petición repetida
        otra = self._pedir("Oye, explícame la temperatura")
        self.assertEqual(otra["via"], "BANCO")
        self.assertIn("Ahora está en 24.5 °C", otra["texto"])
        # 👎 la saca del banco.
        self.cliente.post(
            "/api/v1/agente/calificar/", {"registro": otra["registro"], "voto": "no"}, format="json"
        )
        aprendida.refresh_from_db()
        self.assertFalse(aprendida.activa)

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=5)
    def test_banco_pide_dos_confirmaciones_y_preguntas_concretas(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        ruta = '{"herramienta": "variable", "variable": "temperatura", "periodo": "ahora"}'

        def votar(pregunta, anterior=""):
            hilo = self._esp(lambda t: ruta)
            r = self.cliente.post(
                "/api/v1/agente/",
                {**self.pregunta, "pregunta": pregunta, "anterior": anterior},
                format="json",
            ).json()
            hilo.join()
            voto = self.cliente.post(
                "/api/v1/agente/calificar/",
                {"registro": r["registro"], "voto": "si"},
                format="json",
            ).json()
            return r, voto

        # Un 👍 deja la ruta en espera; quitarlo y ponerlo de nuevo no cuenta doble.
        r, voto = votar("¿cómo anda la cosa en la bodega?")
        self.assertEqual(r["via"], "ENRUTADA")
        self.assertFalse(voto["aprendida"])
        for v in (None, "si"):
            self.cliente.post(
                "/api/v1/agente/calificar/", {"registro": r["registro"], "voto": v}, format="json"
            )
        self.assertFalse(RespuestaAprendida.objects.get().activa)
        # Un segundo 👍, en otra ocasión y con la misma ruta, la activa.
        self._pedir("¿hay alertas?")
        _, voto = votar("¿Cómo anda la cosa en la bodega?")
        self.assertTrue(voto["aprendida"])
        self._pedir("¿hay alertas?")
        self.assertEqual(self._pedir("¿cómo anda la cosa en la bodega?")["via"], "BANCO")
        # Frases cortas no se aprenden.
        _, voto = votar("¿y la cosa?")
        self.assertEqual(RespuestaAprendida.objects.count(), 1)

    def test_por_que_y_gravedad_sin_ia(self):
        r = self._pedir("¿por qué subió la temperatura?")
        self.assertEqual(r["via"], "PREDEFINIDA")
        self.assertIn("no indican la causa", r["texto"])
        self.assertIn("La máxima de temperatura", r["texto"])
        r = self._pedir("¿es grave la temperatura?")
        self.assertEqual(r["via"], "PREDEFINIDA")
        self.assertTrue(r["texto"].startswith(("No hay de qué", "Conviene revisarlo")))

    def test_herramientas_posibles_segun_la_pregunta(self):
        self.assertEqual(
            puente.herramientas_posibles("¿qué tan alto llegó?"), ["variable", "ninguna"]
        )
        self.assertIn("alertas", puente.herramientas_posibles("¿sonó algo raro?"))
        self.assertNotIn("reporte", puente.herramientas_posibles("¿cómo anda la cosa?"))

    def test_entiende_antes_de_responder(self):
        r = self._pedir("anskjndiaidsbajswdbjBK")
        self.assertTrue(r["texto"].startswith("No entendí"))
        r = self._pedir("anskjndiaidsbajswdbjBK primer sensor")
        self.assertTrue(r["texto"].startswith("Ignoré «anskjndiaidsbajswdbjBK»"))
        self.assertIn("Sensor", r["texto"])
        r = self._pedir("dame medidas de un sensor del área de ventas")
        self.assertIn("No hay un área llamada «ventas»", r["texto"])
        r = self._pedir("¿qué sensores tiene?")
        self.assertIn("sensor", r["texto"])
        r = self._pedir("dame las medidas del sensor")
        self.assertIn("promedió", r["texto"])
        self.assertIn("Pregúntame por una variable", r["texto"])

    def test_peticion_repetida(self):
        primera = self._pedir("¿cómo está la temperatura?")
        self.assertNotEqual(primera["via"], "REPETIDA")
        # Una precarga de sugerencias no cuenta como repetición.
        self.cliente.post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "¿cómo está la temperatura?", "precarga": True},
            format="json",
        )
        segunda = self._pedir("¿Cómo está la temperatura")
        self.assertEqual(segunda["via"], "REPETIDA")
        self.assertTrue(segunda["texto"].startswith("Repetiste la misma petición"))
        self.assertIn(primera["texto"], segunda["texto"])
        tercera = self._pedir("¿cómo está la temperatura?")
        self.assertEqual(tercera["via"], "REPETIDA")
        self.assertTrue(tercera["texto"].startswith("Omito esta petición"))
        # Otra pregunta corta la racha.
        self._pedir("¿hay alertas?")
        self.assertNotEqual(self._pedir("¿cómo está la temperatura?")["via"], "REPETIDA")

    def test_grafica_repetida_vuelve_con_la_grafica(self):
        self._pedir("gráfica de la temperatura")
        r = self._pedir("gráfica de la temperatura")
        self.assertEqual(r["via"], "REPETIDA")
        self.assertIn("grafica", r)

    def test_ultima_medicion_correccion_y_comentarios(self):
        r = self._pedir("¿cuál fue la última medición del aire?")
        self.assertIn("todavía no tiene lecturas de calidad del aire", r["texto"])
        r = self._pedir("¿cuál fue la última medición de la temperatura?")
        self.assertIn("La última medición de", r["texto"])
        self.assertNotIn("promedió", r["texto"])
        r = self._pedir("dame la última medición")
        self.assertIn("temperatura", r["texto"])
        # Corrección: toma la variable de la pregunta anterior y su propio periodo, sin lo negado.
        r = self.cliente.post(
            "/api/v1/agente/",
            {
                **self.pregunta,
                "pregunta": "te pedí de la última medición, no de los últimos 7 días",
                "anterior": "¿cómo estuvo la temperatura?",
            },
            format="json",
        ).json()
        self.assertIn("La última medición de", r["texto"])
        self.assertIn("temperatura", r["texto"])
        self.assertTrue(PreguntaAgente.objects.get(pk=r["registro"]).datos["contexto"])
        # Un comentario sobre la respuesta no se vuelve a responder con datos.
        r = self.cliente.post(
            "/api/v1/agente/",
            {
                **self.pregunta,
                "pregunta": "pues solo dame eso cuando te lo pida",
                "anterior": "te pedí de la última medición",
            },
            format="json",
        ).json()
        self.assertIn("Entendido", r["texto"])

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=1)
    def test_ia_tarda_responde_predefinida(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        cuerpo = self._pedir("explícame la temperatura")
        self.assertEqual(cuerpo["via"], "PREDEFINIDA")

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=5)
    def test_ia_que_inventa_cifras_usa_la_predefinida(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        hilo = self._esp(lambda t: "Mañana subirá a 31.7 °C. Es grave.")
        cuerpo = self._pedir("explícame la temperatura")
        hilo.join()
        self.assertEqual(cuerpo["via"], "PREDEFINIDA")
        self.assertNotIn("31.7", cuerpo["texto"])

    def test_errores_de_dedo_y_dato_pedido(self):
        self.assertEqual(agente._tema("como esta la temperatrua"), "TEMP")
        cuerpo = self._pedir("¿cuál fue la temperatura máxima?")
        self.assertTrue(cuerpo["texto"].startswith("La máxima de temperatura"))
        self.assertIn(
            "26.4 °C", cuerpo["texto"].split(".")[0] + "." + cuerpo["texto"].split(".")[1]
        )

    def test_solo_espanol(self):
        for pregunta in ("What is the temperature now?", "Show me the humidity chart", "hello"):
            cuerpo = self._pedir(pregunta)
            self.assertEqual(cuerpo["texto"], agente.SOLO_ESPANOL, pregunta)
            self.assertEqual(cuerpo["via"], "NO_ENTENDIDA")
        self.assertTrue(agente.es_espanol("¿Cuál fue la máxima de CO2 la semana pasada?"))
        self.assertTrue(agente.es_espanol("gráfica de alertas por sensor"))

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=5)
    def test_ia_que_responde_en_ingles_usa_la_predefinida(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        hilo = self._esp(lambda t: "It is not serious, the temperature is fine now.")
        cuerpo = self._pedir("explícame la temperatura")
        hilo.join()
        self.assertEqual(cuerpo["via"], "PREDEFINIDA")

    def test_no_responde_sobre_el_futuro(self):
        for pregunta in (
            "¿Cómo estará la temperatura mañana?",
            "Pronóstico de humedad",
            "¿Subirá el CO2?",
            "Gráfica de la próxima semana",
            "Reporte de 2099",
        ):
            cuerpo = self._pedir(pregunta)
            self.assertIn("No puedo responder sobre el futuro", cuerpo["texto"], pregunta)
            self.assertNotIn("grafica", cuerpo)
            self.assertNotIn("reporte", cuerpo)
        self.assertFalse(Reporte.objects.exists())
        # «por la mañana» y «dentro del rango» no son futuro.
        self.assertFalse(agente.pide_futuro("¿cómo estuvo la temperatura por la mañana?"))
        self.assertFalse(agente.pide_futuro("¿está dentro del rango?"))

    def test_hoy_sin_lecturas_no_responde_con_otro_dia(self):
        # Las lecturas de temperatura pasan a ser de hace dos días.
        Lectura.objects.filter(variable_codigo="TEMP").delete()
        Lectura.objects.create(
            sensor_num=self.e.dht22.pk,
            variable_codigo="TEMP",
            valor=22,
            fecha_hora=timezone.now() - timedelta(days=2),
        )
        texto = self._pedir("¿Cómo está la temperatura hoy?")["texto"]
        self.assertTrue(texto.startswith("Hoy todavía no hay lecturas de temperatura"), texto)
        self.assertIn("La última es del", texto)
        self.assertNotIn("Ahora marca", texto)
        alertas = self._pedir("¿Hubo alertas hoy?")["texto"]
        self.assertIn("no tuvo alertas hoy", alertas)

    @override_settings(
        IA_VOTOS_PARA_APRENDER=1,
        IA_PUENTE_DISPOSITIVOS=["NUC-A"],
        IA_PUENTE_CLAVE="k",
        IA_ESPERA_SEGUNDOS=5,
    )
    def test_ia_elige_la_herramienta_y_aprende_la_ruta(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        vistos = []

        def clasificar(trabajo):
            vistos.append(trabajo["cuerpo"])
            return '{"herramienta": "variable", "variable": "temperatura", "periodo": "ahora"}'

        hilo = self._esp(clasificar)
        cuerpo = self._pedir("¿cómo anda la cosa en la bodega?")
        hilo.join()
        self.assertEqual(cuerpo["via"], "ENRUTADA")
        self.assertIn("26.4 °C", cuerpo["texto"])  # cifras de la función de siempre
        self.assertIn("format", vistos[0])
        registro = PreguntaAgente.objects.get(pk=cuerpo["registro"])
        self.assertEqual((registro.tokens_entrada, registro.tokens_salida), (120, 18))
        self.cliente.post(
            "/api/v1/agente/calificar/", {"registro": registro.num, "voto": "si"}, format="json"
        )
        # Con el 👍 la ruta queda aprendida: ya no se pregunta a la IA.
        self._pedir("¿hay alertas?")  # corta la racha: si no, sería una petición repetida
        otra = self._pedir("¿Cómo anda la cosa en la bodega?")
        self.assertEqual(otra["via"], "BANCO")
        self.assertIn("26.4 °C", otra["texto"])

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=5)
    def test_ia_dice_ninguna_herramienta(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        hilo = self._esp(
            lambda t: '{"herramienta": "ninguna", "variable": "ninguna", "periodo": "ahora"}'
        )
        cuerpo = self._pedir("¿qué opinas del clima político?")
        hilo.join()
        self.assertEqual(cuerpo["via"], "NO_ENTENDIDA")

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=5)
    def test_ia_elige_el_dato_pedido(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        hilo = self._esp(
            lambda t: (
                '{"herramienta": "variable", "variable": "temperatura", '
                '"periodo": "los ultimos 7 dias", "dato": "maximo"}'
            )
        )
        cuerpo = self._pedir("¿hasta dónde llegó la cosa en la bodega?")
        hilo.join()
        self.assertEqual(cuerpo["via"], "ENRUTADA")
        registro = PreguntaAgente.objects.get(pk=cuerpo["registro"])
        self.assertIn("maximo", registro.datos["ruta"])

    def test_ia_no_inventa_fechas_ni_causas(self):
        self.assertIsNone(
            puente._limpiar("Llegó a 26.4 °C el 7 de septiembre.", {26.4, 7.0}, "26.4 °C")
        )
        self.assertIsNone(puente._limpiar("Subió debido al sol.", set(), ""))
        self.assertTrue(puente._limpiar("Llegó a 26.4 °C el lunes.", {26.4}, "el Lunes"))
        self.assertTrue(puente._limpiar("Llegó a 26.4 °C.", {26.4}, "26.4 °C"))

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k")
    def test_fuera_del_dominio_no_gasta_tokens(self):
        puente.cola().visto(self.e.dispositivo.codigo_mqtt)
        cuerpo = self._pedir("¿quién ganó el partido?")
        self.assertEqual(cuerpo["via"], "NO_ENTENDIDA")
        self.assertEqual(puente.cola().pendientes(self.e.dispositivo.codigo_mqtt), 0)

    def test_cifra_inventada_no_entra_al_banco(self):
        self.assertIsNone(aprendizaje.a_plantilla("Subirá a 31 °C.", {"actual": 23.0}))
        self.assertEqual(aprendizaje.rellenar("{actual} °C", {"actual": 22.5}), "22.5 °C")

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k")
    def test_puente_pide_clave(self):
        r = self.client.get(
            "/api/v1/puente/tomar/",
            {"dispositivo": self.e.dispositivo.codigo_mqtt},
            HTTP_X_PUENTE_CLAVE="mala",
        )
        self.assertEqual(r.status_code, 403)

    def test_grafica_general_del_dispositivo(self):
        cuerpo = self._pedir("dame una grafica general del dispositivo")
        self.assertEqual(cuerpo["grafica"]["elemento"], "general")
        self.assertEqual(cuerpo["grafica"]["donde"], self.e.dispositivo.nombre)


class RedaccionLocalTests(PruebaBase):
    def test_redacta_con_las_cifras(self):
        e = Escenario()
        ahora = timezone.now()
        Lectura.objects.create(
            sensor_num=e.dht22.pk, variable_codigo="TEMP", valor=29, fecha_hora=ahora
        )
        cifras = servicios.calcular_cifras(
            e.organizacion, None, ahora - timedelta(hours=1), ahora + timedelta(minutes=1)
        )
        with override_settings(IA_PROVEEDOR="local"):
            texto = ia.redactar(cifras)
        self.assertIn("29.0 °C", texto)


class CasosAgenteTests(PruebaBase):
    """El banco de casos de ``casos_agente.py``: cada cambio al agente debe seguir cumpliéndolo."""

    def test_banco_de_casos(self):
        from apps.reportes.evaluacion import evaluar

        e = Escenario()
        ahora = timezone.now()
        for i, (codigo, sensor, valor) in enumerate(
            (("TEMP", e.dht22, 22), ("HUM", e.dht22, 50), ("AIRE", e.ccs811, 600))
        ):
            Lectura.objects.create(
                sensor_num=sensor.pk,
                variable_codigo=codigo,
                valor=valor,
                fecha_hora=ahora - timedelta(minutes=5 - i),
            )
        e.dht22.funcion = "Temperatura y humedad relativa"
        e.dht22.save()
        e.ccs811.funcion = "Calidad del aire (eCO2)"
        e.ccs811.save()
        fallas = [
            f"{r.caso['pregunta']!r}: {'; '.join(r.fallas)} → {r.respuesta[:140]}"
            for r in evaluar(e.admin, e.dispositivo)
            if not r.ok
        ]
        self.assertEqual(fallas, [], "\n" + "\n".join(fallas))
