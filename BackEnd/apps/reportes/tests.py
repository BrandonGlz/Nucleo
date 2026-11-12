import tempfile
from datetime import UTC, timedelta
from io import StringIO
from pathlib import Path
from unittest import mock

from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone

from apps.alertas.models import Alerta
from apps.mediciones.models import Lectura
from apps.reportes import agente, aprendizaje, carga, herramientas, ia, puente, servicios
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

    def _reporte_confirmado(self, usuario, pedido):
        cliente = cliente_de(usuario)
        r = cliente.post("/api/v1/agente/", {**self.pregunta, "pregunta": pedido}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("¿Lo genero?", r.json()["texto"])
        self.assertIn("accion", r.json())
        self.assertFalse(Reporte.objects.exists())  # preparar no guarda nada
        return cliente.post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "sí", "anterior": pedido},
            format="json",
        )

    @override_settings(IA_PROVEEDOR="local")
    def test_genera_un_reporte_del_area_cuando_se_le_pide(self):
        r = self._reporte_confirmado(self.e.supervisor, "Hazme un reporte de la temperatura de hoy")
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
        r = self._reporte_confirmado(self.e.analista, "informe de hoy")
        self.assertEqual(r.status_code, 200)
        self.assertIn("no está disponible", r.json()["texto"])
        self.assertEqual(r.json()["codigo"], "ia_no_disponible")
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
        """Un ESP32 simulado: firma la siguiente petición (como por MQTT) y la IA del servidor
        contesta ``responder(trabajo)``."""
        import threading
        from unittest import mock

        def ia(trabajo, espera):
            return {
                "texto": responder(trabajo),
                "error": None,
                "tokens_entrada": 120,
                "tokens_salida": 18,
            }

        parche = mock.patch.object(puente, "_llamar_ia", side_effect=ia)
        parche.start()
        self.addCleanup(parche.stop)
        codigo = self.e.dispositivo.codigo_mqtt

        def correr():
            salida = puente.cola().siguiente_salida(5)
            if salida:
                carga = salida[1]
                puente.recibir_autorizacion(
                    codigo,
                    {"id": carga["id"], "firma": puente.firma(codigo, carga["id"], carga["reto"])},
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

    def test_ia_solo_dice_lo_que_dicen_los_hechos(self):
        # Respuestas reales del modelo en el servidor: solo pasan las fieles a los hechos.
        hechos = (
            "Revisé de nuevo y no hay un área «ventas» registrada en tu organización, así que no "
            "tengo lecturas suyas. Si el área existe, un administrador debe darla de alta en "
            "Empresa y áreas y asignarle un dispositivo."
        )
        self.assertFalse(puente._fiel("¡Hola! Estoy bien.", hechos, "si, si tengo"))
        self.assertTrue(
            puente._fiel(
                "Entiendo, pero «Ventas» no aparece registrada en tu organización; si existe, un "
                "administrador debe darla de alta en Empresa y áreas.",
                hechos,
                "si, si tengo",
            )
        )
        medicion = (
            "Lo reviso con los sensores. La última medición de Núcleo A-01 fue del Lun 9 · 02:21: "
            "temperatura 16.1 °C, dentro del rango (14–25 °C)."
        )
        self.assertFalse(
            puente._fiel(medicion + " Hasta ahora, el ambiente es muy caloroso.", medicion, "")
        )
        equipo = "Reviso el equipo. Sensores: DHT22 operando, CCS811 operando."
        self.assertFalse(
            puente._fiel(
                "El sensor DHT22 y CCS811 están funcionando correctamente, pero fallan.", equipo
            )
        )

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=5)
    def test_ia_conversa_cuando_el_usuario_insiste(self):
        codigo = self.e.dispositivo.codigo_mqtt
        anterior = "como esta la temperatura del departamento de ventas"
        puente.cola().visto(codigo)
        vistos = []

        def responder(trabajo):
            vistos.append(trabajo["cuerpo"]["messages"][-1]["content"])
            return (
                "Entiendo, pero «ventas» no aparece registrada en tu organización; si existe, "
                "un administrador debe darla de alta en Empresa y áreas."
            )

        hilo = self._esp(responder)
        r = self.cliente.post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "si si tengo uno", "anterior": anterior},
            format="json",
        ).json()
        hilo.join()
        self.assertEqual(r["via"], "IA")
        self.assertIn("no aparece registrada", r["texto"])
        self.assertIn("Hechos: Revisé de nuevo", vistos[0])
        self.assertIn("Usuario: si si tengo uno", vistos[0])
        registro = PreguntaAgente.objects.get(pk=r["registro"])
        self.assertEqual(registro.tokens_salida, 18)
        # Si la IA inventa una cifra, se queda el texto de las reglas.
        puente.cola().visto(codigo)
        hilo = self._esp(lambda t: "Ventas marca 31 °C ahora mismo.")
        r = self.cliente.post(
            "/api/v1/agente/",
            {**self.pregunta, "pregunta": "pero si existe", "anterior": anterior},
            format="json",
        ).json()
        hilo.join()
        self.assertNotEqual(r["via"], "IA")
        self.assertIn("Revisé de nuevo", r["texto"])

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

    def test_conversacion_si_a_lo_que_propuso(self):
        from apps.reportes.models import PreguntaAgente

        r = self._pedir("¿cómo está la humedad?")
        registro = PreguntaAgente.objects.get(pk=r["registro"])
        registro.datos = {**registro.datos, "propuesta": "última medición de temperatura"}
        registro.save()
        r = self._pedir("sí")
        self.assertIn("última medición", r["texto"])
        self.assertIn("temperatura", r["texto"])
        r = self._pedir("sí")  # ya no hay propuesta pendiente: conversación normal
        self.assertIn("Qué más quieres saber", r["texto"])
        registro = PreguntaAgente.objects.order_by("-num").first()
        registro.datos = {**registro.datos, "propuesta": "gráfica de humedad"}
        registro.save()
        r = self._pedir("no era eso")
        self.assertIn("no era eso", r["texto"])

    def test_otra_area_nombrada_sin_decir_area(self):
        self.e.otra_area.nombre = "Moldeo"
        self.e.otra_area.save()
        r = self._pedir("¿Cómo estuvo la temperatura en Moldeo esta semana?")
        self.assertIn("Para Moldeo, abre el agente", r["texto"])
        self.assertIn("Encontré el área Moldeo", r["pasos"])

    def test_el_de_este_area_retoma_la_peticion(self):
        self.e.otra_area.nombre = "Moldeo"
        self.e.otra_area.save()
        self.e.area.nombre = "Almacén"
        self.e.area.save()
        q = "¿Cómo estuvo la temperatura en Moldeo esta semana?"
        self.assertIn("Para Moldeo", self._pedir(q)["texto"])
        for seguimiento in (
            "bueno, entonces dame el de este area",
            "te dije que me dieras el de este area, eres el agente del almacen, debiste darme "
            "lo del almacen",
        ):
            r = self.cliente.post(
                "/api/v1/agente/",
                {**self.pregunta, "pregunta": seguimiento, "anterior": q},
                format="json",
            ).json()
            self.assertIn("temperatura", r["texto"].lower())
            self.assertIn("esta semana", r["texto"])
            self.assertNotIn("Moldeo", r["texto"])
            self.assertIn("Entendí que te refieres al área Almacén de Nodo a", r["pasos"])

    def test_ia_no_relaciona_lo_que_los_hechos_no_relacionan(self):
        hechos = (
            "Este agente es de Núcleo A-01 y solo ve sus sensores, que están en el área "
            "Almacén. Para Moldeo, abre el agente de uno de los dispositivos de esa área."
        )
        entidades = ["nucleo a-01", "almacen", "moldeo"]
        self.assertFalse(
            puente._relaciones(
                "El área Moldeo de Núcleo A-01 tiene un agente de Moldeo.", hechos, entidades
            )
        )
        self.assertTrue(
            puente._relaciones(
                "Este agente solo ve Núcleo A-01, en el área Almacén.", hechos, entidades
            )
        )

    def test_ofrece_la_ultima_medicion_si_no_hay_del_periodo(self):
        Lectura.objects.filter(sensor_num=self.e.dht22.pk).delete()
        Lectura.objects.create(
            sensor_num=self.e.dht22.pk,
            variable_codigo="TEMP",
            valor=21,
            fecha_hora=timezone.now() - timedelta(days=20),
        )
        r = self._pedir("¿cómo estuvo la temperatura esta semana?")
        self.assertIn("¿Quieres que te la muestre?", r["texto"])
        r = self._pedir("sí")
        self.assertIn("última medición", r["texto"])
        self.assertIn("temperatura", r["texto"])

    def test_insiste_en_un_area_que_no_existe(self):
        r = self._pedir("como esta la temperatura del departamento de ventas")
        self.assertIn("No hay un área llamada «ventas»", r["texto"])
        r = self.cliente.post(
            "/api/v1/agente/",
            {
                **self.pregunta,
                "pregunta": "si si tengo uno",
                "anterior": "como esta la temperatura del departamento de ventas",
            },
            format="json",
        ).json()
        self.assertIn("Revisé de nuevo", r["texto"])
        self.assertNotIn("promedió", r["texto"])
        self.assertEqual(
            r["pasos"],
            [
                "Retomé tu mensaje anterior",
                "Busqué «ventas» entre las áreas de tu organización",
                "No la encontré",
                "Revisé las áreas que puedes consultar",
            ],
        )
        r = self._pedir("¿cuál fue la humedad máxima de hoy?")
        self.assertIn("Entendí que pides máxima de humedad de hoy", r["pasos"])
        self.assertIn(
            "Revisé las lecturas de humedad de hoy y las comparé con los umbrales", r["pasos"]
        )

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

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k")
    def test_ia_puede_repetir_la_cifra_que_dio_el_usuario(self):
        def responde(texto):
            return lambda codigo, trabajo, espera: {"texto": texto}

        pregunta = "¿es grave si llega a 29 grados?"
        base, datos = "La temperatura está en 24 °C, dentro del rango.", {"actual": 24.0}
        with mock.patch.object(
            puente, "_ejecutar", responde("Si llega a 29 °C sí conviene revisar.")
        ):
            texto, _ = puente.redactar(self.e.dispositivo, pregunta, base, datos)
        self.assertIn("29", texto)
        with mock.patch.object(puente, "_ejecutar", responde("Mañana llegará a 31.7 °C.")):
            texto, _ = puente.redactar(self.e.dispositivo, pregunta, base, datos)
        self.assertIsNone(texto)

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

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k", IA_ESPERA_SEGUNDOS=5)
    def test_sin_firma_valida_no_se_usa_la_ia(self):
        from unittest import mock

        codigo = self.e.dispositivo.codigo_mqtt
        puente.recibir_latido(codigo, {"diag": "red=UTT;rssi=-72;rec=2;falla=ninguna;mem=180000"})
        self.assertTrue(puente.activo(self.e.dispositivo))
        diag = puente.diagnostico(codigo)["datos"]
        self.assertEqual((diag["red"], diag["rssi"]), ("UTT", "-72"))
        with (
            mock.patch.object(puente, "ESPERA_AUTORIZA", 1),
            mock.patch.object(puente, "_llamar_ia") as ia,
        ):
            import threading

            def falsificar():
                carga = puente.cola().siguiente_salida(3)[1]
                self.assertFalse(
                    puente.recibir_autorizacion(codigo, {"id": carga["id"], "firma": "mala"})
                )

            hilo = threading.Thread(target=falsificar)
            hilo.start()
            texto, _ = puente.redactar(self.e.dispositivo, "¿es grave?", "Está en 23 °C.", {})
            hilo.join()
        self.assertIsNone(texto)
        ia.assert_not_called()

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k")
    def test_el_ultimo_mensaje_del_esp_lo_desactiva(self):
        codigo = self.e.dispositivo.codigo_mqtt
        puente.recibir_latido(codigo, {})
        self.assertTrue(puente.activo(self.e.dispositivo))
        puente.recibir_latido(codigo, {"estado": "offline"})
        self.assertFalse(puente.activo(self.e.dispositivo))

    @override_settings(IA_PUENTE_DISPOSITIVOS=["NUC-A"], IA_PUENTE_CLAVE="k")
    def test_respaldo_https_marca_activo_y_autoriza(self):
        codigo = self.e.dispositivo.codigo_mqtt
        puente.cola().guardar_reto("t1", codigo, "abc")
        r = self.client.get(
            "/api/v1/puente/tomar/",
            {"dispositivo": codigo},
            HTTP_X_PUENTE_CLAVE="k",
            HTTP_X_PUENTE_DIAG="red=UTT;rssi=-70;falla=mqtt_bloqueado",
        )
        self.assertEqual(r.json(), {"autorizadas": 1})
        self.assertTrue(puente.cola().esperar_autorizacion("t1", 1))
        self.assertTrue(puente.activo(self.e.dispositivo))
        self.assertEqual(puente.diagnostico(codigo)["datos"]["falla"], "mqtt_bloqueado")

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


class HerramientasAgenteTests(PruebaBase):
    """Catálogo de herramientas de Nico AI: banco de memoria, pendientes, detalle de alertas,
    programaciones y el reporte en dos pasos (preparar, confirmar, cancelar, vencer)."""

    def setUp(self):
        carpeta = tempfile.mkdtemp()
        medios = override_settings(MEDIA_ROOT=carpeta)
        medios.enable()
        self.addCleanup(medios.disable)
        self.e = Escenario()
        self.ahora = timezone.now()
        self.lectura = Lectura.objects.create(
            sensor_num=self.e.dht22.pk,
            variable_codigo="TEMP",
            valor=31,
            fecha_hora=self.ahora - timedelta(minutes=3),
        )

    def _pedir(self, usuario, pregunta, anterior=""):
        r = cliente_de(usuario).post(
            "/api/v1/agente/",
            {"pregunta": pregunta, "dispositivo": self.e.dispositivo.pk, "anterior": anterior},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _alerta(self, umbral=None, **campos):
        return Alerta.objects.create(
            umbral=umbral or self.e.umbral_temp,
            lectura_num=self.lectura.num,
            lectura_fecha_hora=self.lectura.fecha_hora,
            lectura_valor=self.lectura.valor,
            nivel=Alerta.Nivel.PELIGRO,
            tipo=Alerta.Tipo.POR_ENCIMA,
            **campos,
        )

    def test_banco_explica_con_texto_fijo(self):
        banco = herramientas.banco()
        r = self._pedir(self.e.admin, "¿por qué dice calentando?")
        calentando = next(e for e in banco["explicaciones"] if e["clave"] == "calentando")
        self.assertEqual(r["texto"], calentando["texto"])
        self.assertIn("certifica", self._pedir(self.e.admin, "¿cumplimos la norma?")["texto"])
        r = self._pedir(self.e.analista, "¿qué puedes hacer?")
        self.assertEqual(r["texto"], banco["capacidades"]["ANALISTA"])
        consulta = herramientas.consultar_banco_memoria(intencion="reporte")
        self.assertEqual(
            consulta["preguntas_faltantes"]["periodo"], banco["preguntas_faltantes"]["periodo"]
        )

    def test_cambios_fuera_de_alcance(self):
        r = self._pedir(self.e.admin, "atiende la alerta de ayer")
        self.assertIn("panel de Alertas", r["texto"])
        r = self._pedir(self.e.admin, "cambia el intervalo de muestreo a 30 segundos")
        self.assertIn("No puedo modificar dispositivos", r["texto"])

    def test_pendientes_de_su_alcance_y_aislados(self):
        self._alerta()
        otra = Escenario("b")
        lectura = Lectura.objects.create(
            sensor_num=otra.dht22.pk, variable_codigo="TEMP", valor=40, fecha_hora=self.ahora
        )
        Alerta.objects.create(
            umbral=otra.umbral_temp,
            lectura_num=lectura.num,
            lectura_fecha_hora=lectura.fecha_hora,
            lectura_valor=40,
            nivel=Alerta.Nivel.ADVERTENCIA,
            tipo=Alerta.Tipo.POR_ENCIMA,
        )
        r = self._pedir(self.e.admin, "¿qué hay pendiente?")
        self.assertIn("1 alerta pendiente: 1 de peligro", r["texto"])
        self.assertNotIn(otra.dispositivo.nombre, r["texto"])
        # Un supervisor de otra área no ve las alertas de esta.
        self.e.supervisor.area = self.e.otra_area
        self.e.supervisor.save(update_fields=["area"])
        texto = herramientas.pendientes(self.e.supervisor)["texto"]
        self.assertIn("No hay alertas pendientes", texto)

    def test_detalle_de_la_alerta(self):
        alerta = self._alerta(
            estado=Alerta.Estado.ATENDIDA,
            atendida_por=self.e.supervisor,
            fecha_atencion=self.ahora,
        )
        r = self._pedir(self.e.admin, "¿quién atendió la alerta?")
        self.assertIn("31 °C", r["texto"])
        self.assertIn("atendida", r["texto"].lower())
        self.assertIn(self.e.supervisor.get_full_name() or "alguien", r["texto"])
        alerta.delete()
        r = self._pedir(self.e.admin, "detalle de la última alerta")
        self.assertIn("no tiene alertas", r["texto"])

    def test_programaciones_propias(self):
        ProgramacionReporte.objects.create(
            organizacion=self.e.organizacion,
            area=self.e.area,
            creada_por=self.e.supervisor,
            frecuencia=ProgramacionReporte.Frecuencia.SEMANAL,
            destinatarios=[self.e.supervisor.pk],
            proxima_ejecucion=self.ahora + timedelta(days=2),
        )
        r = self._pedir(self.e.supervisor, "¿qué reportes tengo programados?")
        self.assertIn("semanal", r["texto"])
        r = self._pedir(self.e.analista, "¿qué reportes tengo programados?")
        self.assertIn("No tienes reportes programados", r["texto"])

    def test_reporte_pide_periodo_y_se_puede_cancelar(self):
        r = self._pedir(self.e.supervisor, "hazme un reporte")
        self.assertEqual(r["codigo"], "datos_faltantes")
        r = self._pedir(self.e.supervisor, "de hoy", "hazme un reporte")
        self.assertIn("¿Lo genero?", r["texto"])
        r = self._pedir(self.e.supervisor, "cancela")
        self.assertIn("cancelé", r["texto"])
        r = self._pedir(self.e.supervisor, "sí")
        self.assertNotIn("reporte", r)
        self.assertFalse(Reporte.objects.exists())

    @override_settings(IA_PROVEEDOR="local")
    def test_accion_vencida_no_genera(self):
        r = self._pedir(self.e.supervisor, "genera el reporte de hoy")
        registro = PreguntaAgente.objects.order_by("-num").first()
        registro.datos["accion"]["vence"] = (self.ahora - timedelta(minutes=1)).isoformat()
        registro.save(update_fields=["datos"])
        r = self._pedir(self.e.supervisor, "sí")
        self.assertEqual(r["codigo"], "accion_vencida")
        self.assertFalse(Reporte.objects.exists())
        # «Sí» a volver a prepararlo: prepara de nuevo, sin generar.
        r = self._pedir(self.e.supervisor, "sí")
        self.assertIn("¿Lo genero?", r["texto"])
        self.assertFalse(Reporte.objects.exists())

    def test_reporte_sin_datos_del_periodo(self):
        r = self._pedir(self.e.analista, "reporte de enero de 2020")
        self.assertIn(r.get("codigo"), ("sin_datos", "periodo_invalido"))
        self.assertNotIn("accion", r)

    def _nombrar(self):
        for u, nombre, apellido in (
            (self.e.supervisor, "Ana", "López"),
            (self.e.analista, "Ana", "Ruiz"),
            (self.e.admin, "Luis", "Mora"),
        ):
            u.nombre, u.primer_apellido = nombre, apellido
            u.save(update_fields=["nombre", "primer_apellido"])

    def test_programar_con_confirmacion(self):
        self._nombrar()
        r = self._pedir(self.e.admin, "programa un reporte semanal")
        self.assertEqual(r["codigo"], "datos_faltantes")  # falta a quién
        r = self._pedir(self.e.admin, "para Ana")
        self.assertEqual(r["codigo"], "ambiguo")  # dos Anas
        r = self._pedir(self.e.admin, "Ana López y a mí")
        self.assertIn("¿Lo programo?", r["texto"])
        self.assertFalse(ProgramacionReporte.objects.exists())
        r = self._pedir(self.e.admin, "sí")
        p = ProgramacionReporte.objects.get()
        self.assertEqual(p.frecuencia, "SEMANAL")
        self.assertEqual(p.area, self.e.dispositivo.area)  # solo el área, nunca la organización
        self.assertEqual(set(p.destinatarios), {self.e.supervisor.pk, self.e.admin.pk})
        # Cambiar la frecuencia y agregar a alguien, y cancelar.
        r = self._pedir(self.e.admin, "cambia la programación semanal a mensual")
        self.assertIn("mensual", r["texto"])
        self._pedir(self.e.admin, "sí")
        p.refresh_from_db()
        self.assertEqual(p.frecuencia, "MENSUAL")
        self._pedir(self.e.admin, "agrega a Ana Ruiz a la programación")
        self._pedir(self.e.admin, "sí")
        p.refresh_from_db()
        self.assertIn(self.e.analista.pk, p.destinatarios)
        r = self._pedir(self.e.admin, "cancela la programación")
        self.assertIn("¿La cancelo?", r["texto"])
        self._pedir(self.e.admin, "sí")
        p.refresh_from_db()
        self.assertFalse(p.activa)

    def test_no_programa_para_otra_organizacion(self):
        otra = Escenario("b")
        otra.supervisor.nombre, otra.supervisor.primer_apellido = "Zoe", "Paz"
        otra.supervisor.save(update_fields=["nombre", "primer_apellido"])
        r = self._pedir(self.e.admin, "programa un reporte diario para Zoe Paz")
        self.assertEqual(r["codigo"], "datos_faltantes")
        self.assertNotIn("Zoe", r["texto"])

    @override_settings(IA_PROVEEDOR="local")
    def test_reporte_y_envio_por_correo(self):
        self._nombrar()
        r = self._pedir(self.e.admin, "genera el reporte de hoy y envíaselo a Ana López")
        self.assertIn("enviarlo por correo a Ana López", r["texto"])
        self.assertEqual(len(mail.outbox), 0)
        r = self._pedir(self.e.admin, "sí")
        self.assertIn("reporte", r)
        self.assertEqual(mail.outbox[-1].to, [self.e.supervisor.correo])
        # Reenviar el último reporte a otra persona.
        r = self._pedir(self.e.admin, "envía el último reporte a Ana Ruiz")
        self.assertIn("¿Lo envío?", r["texto"])
        self._pedir(self.e.admin, "sí")
        self.assertEqual(mail.outbox[-1].to, [self.e.analista.correo])
        self.assertEqual(len(mail.outbox), 2)

    def test_operador_no_envia_ni_programa(self):
        self.e.operador.acceso_agente = True
        self.e.operador.save(update_fields=["acceso_agente"])
        self.e.dispositivo.operador = self.e.operador
        self.e.dispositivo.save(update_fields=["operador"])
        r = self._pedir(self.e.operador, "programa un reporte semanal para mí")
        self.assertEqual(r["codigo"], "sin_permiso")

    def test_limite_por_carga_del_servidor(self):
        with (
            mock.patch.object(carga, "memoria_disponible_mb", return_value=300),
            override_settings(NUCLEO_AGENTE_LIMITE_CRITICA=2),
        ):
            self.assertTrue(carga.ia_suspendida())
            self._pedir(self.e.admin, "¿qué hay pendiente?")
            self._pedir(self.e.admin, "¿sigue conectado?")
            r = self._pedir(self.e.admin, "¿cómo está la temperatura?")
            self.assertEqual(r["codigo"], "limite_peticiones")
            precarga = cliente_de(self.e.admin).post(
                "/api/v1/agente/",
                {"pregunta": "hola", "dispositivo": self.e.dispositivo.pk, "precarga": True},
                format="json",
            )
            self.assertEqual(precarga.status_code, 429)

    def test_mantenimiento(self):
        carpeta = Path(tempfile.mkdtemp())
        with override_settings(NUCLEO_AGENTE_MANTENIMIENTO=str(carpeta / "marca")):
            call_command("agente_mantenimiento", "on", stdout=StringIO())
            r = self._pedir(self.e.admin, "¿cómo está la temperatura?")
            self.assertEqual(r["codigo"], "mantenimiento")
            call_command("agente_mantenimiento", "off", stdout=StringIO())
            r = self._pedir(self.e.admin, "¿cómo está la temperatura?")
            self.assertNotIn("codigo", r)
