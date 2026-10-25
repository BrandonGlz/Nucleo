from datetime import timedelta
from decimal import Decimal

from django.core import mail
from django.db import IntegrityError, connections, transaction
from django.utils import timezone

from apps.alertas.models import Alerta, Notificacion
from apps.mediciones import services
from apps.mediciones.models import Lectura
from apps.mediciones.services import MensajeInvalido
from common import roles
from common.testing import Escenario, PruebaBase, cliente_de


def mensaje(codigo, lecturas, **extra):
    return {"dispositivo": codigo, "lecturas": lecturas, **extra}


def lectura(sensor, variable, valor):
    return {"sensor": sensor, "variable": variable, "valor": valor}


class BasesSeparadasTests(PruebaBase):
    def test_las_lecturas_viven_en_timescaledb(self):
        self.assertEqual(Lectura.objects.db, "iot")
        with connections["iot"].cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM timescaledb_information.hypertables "
                "WHERE hypertable_name = 'lectura'"
            )
            self.assertEqual(cursor.fetchone()[0], 1)
            cursor.execute("SELECT to_regclass('public.usuario')")
            self.assertIsNone(cursor.fetchone()[0])
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT to_regclass('public.lectura')")
            self.assertIsNone(cursor.fetchone()[0])

    def test_la_llave_de_la_hypertable_incluye_la_particion(self):
        with connections["iot"].cursor() as cursor:
            cursor.execute(
                "SELECT a.attname FROM pg_index i "
                "JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) "
                "WHERE i.indrelid = 'lectura'::regclass AND i.indisprimary ORDER BY a.attname"
            )
            self.assertEqual([f[0] for f in cursor.fetchall()], ["fecha_hora", "num"])

    def test_la_base_valida_variable_y_rango_fisico(self):
        for variable, valor in (("OTRA", 1), ("HUM", 150), ("TEMP", -41), ("AIRE", 10001)):
            with self.assertRaises(IntegrityError), transaction.atomic(using="iot"):
                Lectura.objects.create(
                    sensor_num=1,
                    variable_codigo=variable,
                    valor=valor,
                    fecha_hora=timezone.now(),
                )

    def test_estabilizada_es_verdadera_por_defecto(self):
        guardada = Lectura.objects.create(
            sensor_num=1, variable_codigo="TEMP", valor=20, fecha_hora=timezone.now()
        )
        guardada.refresh_from_db()
        self.assertTrue(guardada.estabilizada)
        self.assertIsNotNone(guardada.recibida_en)


class IngestaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.codigo = self.e.dispositivo.codigo_mqtt

    def test_guarda_las_lecturas_y_actualiza_el_dispositivo(self):
        resultado = services.procesar_mensaje(
            mensaje(
                self.codigo,
                [lectura("DHT22", "TEMP", 22.4), lectura("CCS811", "AIRE", 412)],
                fecha_hora="2026-10-24T08:30:00-07:00",
                bateria=87,
            )
        )
        self.assertEqual(len(resultado.lecturas), 2)
        temperatura = Lectura.objects.get(variable_codigo="TEMP")
        self.assertEqual(temperatura.valor, Decimal("22.40"))
        self.assertEqual(temperatura.sensor_num, self.e.dht22.pk)
        self.assertEqual(temperatura.fecha_hora.isoformat(), "2026-10-24T15:30:00+00:00")
        self.assertTrue(temperatura.estabilizada)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_EN_LINEA)
        self.assertEqual(self.e.dispositivo.nivel_bateria, 87)
        self.assertIsNotNone(self.e.dispositivo.ultima_conexion)

    def test_registra_la_hora_de_recepcion_para_medir_la_latencia(self):
        services.procesar_mensaje(mensaje(self.codigo, [lectura("DHT22", "TEMP", 22)]))
        guardada = Lectura.objects.get()
        self.assertLess(abs(guardada.recibida_en - timezone.now()), timedelta(seconds=5))

    def test_bateria_baja_cambia_el_estado(self):
        services.procesar_mensaje(mensaje(self.codigo, [], bateria=10))
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_BATERIA_BAJA)

    def test_un_sensor_con_error_no_impide_guardar_los_demas(self):
        resultado = services.procesar_mensaje(
            mensaje(
                self.codigo,
                [
                    lectura("DHT22", "TEMP", 22),
                    lectura("DHT22", "HUM", 150),  # fuera del rango físico
                    lectura("DHT22", "TEMP", "x"),  # no numérico
                    lectura("XYZ", "TEMP", 20),  # sensor no registrado
                    lectura("CCS811", "OTRA", 1),  # variable desconocida
                ],
            )
        )
        self.assertEqual(len(resultado.lecturas), 1)
        self.assertEqual(len(resultado.descartadas), 4)

    def test_mensajes_invalidos(self):
        with self.assertRaises(MensajeInvalido):
            services.procesar_crudo(b"no es json")
        with self.assertRaises(MensajeInvalido):
            services.procesar_mensaje({"lecturas": []})
        with self.assertRaises(MensajeInvalido):
            services.procesar_mensaje(mensaje("NO-EXISTE", []))
        with self.assertRaises(MensajeInvalido):
            services.procesar_mensaje(mensaje(self.codigo, [], aire_estabilizado="si"))

    def test_dispositivo_dado_de_baja_se_ignora(self):
        self.e.dispositivo.estado_dispositivo_id = roles.DISPOSITIVO_BAJA
        self.e.dispositivo.save()
        with self.assertRaises(MensajeInvalido):
            services.procesar_mensaje(mensaje(self.codigo, [lectura("DHT22", "TEMP", 22)]))
        self.assertFalse(Lectura.objects.exists())


class CalentamientoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.codigo = self.e.dispositivo.codigo_mqtt

    def enviar(self, estabilizado, temperatura=22, aire=412):
        return services.procesar_mensaje(
            mensaje(
                self.codigo,
                [lectura("DHT22", "TEMP", temperatura), lectura("CCS811", "AIRE", aire)],
                aire_estabilizado=estabilizado,
            )
        )

    def test_el_aire_se_guarda_sin_estabilizar_y_la_temperatura_si(self):
        self.enviar(False)
        self.assertFalse(Lectura.objects.get(variable_codigo="AIRE").estabilizada)
        self.assertTrue(Lectura.objects.get(variable_codigo="TEMP").estabilizada)

    def test_el_dispositivo_queda_calentando_y_registra_el_arranque(self):
        self.enviar(False)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_CALENTANDO)
        arranque = self.e.dispositivo.ultimo_arranque
        self.assertIsNotNone(arranque)
        self.enviar(False)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.ultimo_arranque, arranque)
        self.enviar(True)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_EN_LINEA)

    def test_las_lecturas_sin_estabilizar_no_generan_alertas(self):
        from apps.umbrales.models import Umbral

        Umbral.objects.create(
            dispositivo=self.e.dispositivo,
            variable_id="AIRE",
            configurado_por=self.e.admin,
            peligro_min=0,
            advertencia_min=0,
            advertencia_max=1000,
            peligro_max=2000,
        )
        self.assertEqual(self.enviar(False, aire=5000).alertas, [])
        self.assertEqual(len(self.enviar(True, aire=5000).alertas), 1)


class AlertasPorIngestaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.codigo = self.e.dispositivo.codigo_mqtt

    def enviar(self, valor):
        return services.procesar_mensaje(mensaje(self.codigo, [lectura("DHT22", "TEMP", valor)]))

    def test_una_lectura_normal_no_genera_alerta(self):
        self.assertEqual(self.enviar(22).alertas, [])
        self.assertEqual(self.enviar(25).alertas, [])  # el límite mismo sigue siendo normal
        self.assertFalse(Alerta.objects.exists())

    def test_advertencia_crea_alerta_con_copia_de_la_lectura_y_notifica(self):
        resultado = self.enviar(26.5)
        self.assertEqual(len(resultado.alertas), 1)
        alerta = Alerta.objects.get()
        guardada = Lectura.objects.get()
        self.assertEqual(alerta.nivel, Alerta.Nivel.ADVERTENCIA)
        self.assertEqual(alerta.tipo, Alerta.Tipo.POR_ENCIMA)
        self.assertEqual(alerta.estado, Alerta.Estado.PENDIENTE)
        self.assertEqual(alerta.lectura_num, guardada.num)
        self.assertEqual(alerta.lectura_valor, Decimal("26.50"))
        self.assertEqual(alerta.lectura_fecha_hora, guardada.fecha_hora)
        notificacion = Notificacion.objects.get()
        self.assertEqual(notificacion.usuario, self.e.supervisor)
        self.assertEqual(notificacion.canal, Notificacion.Canal.CORREO)
        self.assertIsNone(notificacion.telefono_push)
        self.assertEqual(notificacion.estado_envio, Notificacion.EstadoEnvio.ENVIADA)
        self.assertEqual(mail.outbox[0].to, [self.e.supervisor.correo])
        self.assertIn("Advertencia", mail.outbox[0].subject)

    def test_peligro_por_encima_y_por_debajo(self):
        self.enviar(29)
        alerta = Alerta.objects.get()
        self.assertEqual((alerta.nivel, alerta.tipo), ("PELIGRO", "POR_ENCIMA"))
        Notificacion.objects.all().delete()
        Alerta.objects.all().delete()
        self.enviar(14)
        alerta = Alerta.objects.get()
        self.assertEqual((alerta.nivel, alerta.tipo), ("PELIGRO", "POR_DEBAJO"))

    def test_advertencia_por_debajo(self):
        self.enviar(16)
        alerta = Alerta.objects.get()
        self.assertEqual((alerta.nivel, alerta.tipo), ("ADVERTENCIA", "POR_DEBAJO"))

    def test_no_repite_la_alerta_pendiente_del_mismo_nivel(self):
        self.enviar(26)
        self.enviar(27)
        self.assertEqual(Alerta.objects.count(), 1)
        Alerta.objects.update(estado=Alerta.Estado.ATENDIDA)
        self.enviar(27)
        self.assertEqual(Alerta.objects.count(), 2)

    def test_si_la_advertencia_escala_a_peligro_se_crea_otra_alerta(self):
        self.enviar(26)
        self.enviar(30)
        self.assertEqual(
            sorted(Alerta.objects.values_list("nivel", flat=True)), ["ADVERTENCIA", "PELIGRO"]
        )

    def test_la_base_impide_dos_pendientes_del_mismo_umbral_y_nivel(self):
        self.enviar(26)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Alerta.objects.create(
                umbral=self.e.umbral_temp,
                lectura_num=99,
                lectura_fecha_hora=timezone.now(),
                lectura_valor=27,
                nivel="ADVERTENCIA",
                tipo="POR_ENCIMA",
            )

    def test_sin_supervisor_avisa_a_los_administradores(self):
        self.e.supervisor.delete()
        self.enviar(40)
        self.assertEqual(Notificacion.objects.get().usuario, self.e.admin)

    def test_un_umbral_inactivo_no_genera_alertas(self):
        self.e.umbral_temp.activo = False
        self.e.umbral_temp.save()
        self.enviar(40)
        self.assertFalse(Alerta.objects.exists())

    def test_fallo_del_correo_queda_registrado_como_fallida(self):
        from unittest import mock

        with mock.patch("apps.alertas.notificaciones.send_mail", side_effect=OSError("smtp")):
            self.enviar(40)
        self.assertEqual(Notificacion.objects.get().estado_envio, Notificacion.EstadoEnvio.FALLIDA)
        self.assertEqual(Alerta.objects.count(), 1)

    def test_el_aviso_llega_en_menos_de_dos_minutos(self):
        self.enviar(40)
        alerta = Alerta.objects.get()
        notificacion = Notificacion.objects.get()
        self.assertLess(notificacion.fecha_envio - alerta.lectura_fecha_hora, timedelta(minutes=2))


class ConsultaDeLecturasTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro = Escenario("b")
        ahora = timezone.now()
        for minutos, valor in ((50, 20), (40, 22), (10, 24)):
            Lectura.objects.create(
                sensor_num=self.e.dht22.pk,
                variable_codigo="TEMP",
                valor=valor,
                fecha_hora=ahora - timedelta(minutes=minutos),
            )
        Lectura.objects.create(
            sensor_num=self.otro.dht22.pk, variable_codigo="TEMP", valor=70, fecha_hora=ahora
        )

    def test_historico_filtrado_y_aislado_por_organizacion(self):
        r = cliente_de(self.e.analista).get("/api/v1/lecturas/", {"variable": "temp"})
        valores = sorted(Decimal(x["valor"]) for x in r.json()["results"])
        self.assertEqual(valores, [20, 22, 24])
        self.assertEqual(r.json()["results"][0]["dispositivo"], self.e.dispositivo.pk)
        self.assertEqual(r.json()["results"][0]["unidad"], "°C")

    def test_filtro_por_periodo(self):
        desde = (timezone.now() - timedelta(minutes=45)).isoformat()
        r = cliente_de(self.e.admin).get("/api/v1/lecturas/", {"desde": desde})
        self.assertEqual(len(r.json()["results"]), 2)

    def test_fecha_con_formato_invalido(self):
        r = cliente_de(self.e.admin).get("/api/v1/lecturas/", {"desde": "ayer"})
        self.assertEqual(r.status_code, 400)

    def test_serie_para_graficas_de_tendencia(self):
        r = cliente_de(self.e.analista).get(
            "/api/v1/lecturas/serie/",
            {"dispositivo": self.e.dispositivo.pk, "variable": "TEMP", "intervalo": "dia"},
        )
        self.assertEqual(r.status_code, 200, r.content)
        puntos = r.json()
        self.assertEqual(sum(p["muestras"] for p in puntos), 3)
        self.assertEqual(max(Decimal(p["maximo"]) for p in puntos), 24)

    def test_la_serie_no_cuenta_lecturas_sin_estabilizar(self):
        Lectura.objects.create(
            sensor_num=self.e.ccs811.pk,
            variable_codigo="AIRE",
            valor=9000,
            fecha_hora=timezone.now(),
            estabilizada=False,
        )
        r = cliente_de(self.e.analista).get(
            "/api/v1/lecturas/serie/",
            {"dispositivo": self.e.dispositivo.pk, "variable": "AIRE"},
        )
        self.assertEqual(r.json(), [])
        todas = cliente_de(self.e.analista).get("/api/v1/lecturas/", {"estabilizada": "false"})
        self.assertEqual(len(todas.json()["results"]), 1)

    def test_serie_exige_dispositivo_y_variable(self):
        r = cliente_de(self.e.admin).get("/api/v1/lecturas/serie/")
        self.assertEqual(r.status_code, 400)

    def test_el_operador_solo_ve_las_lecturas_de_su_dispositivo(self):
        r = cliente_de(self.e.operador).get("/api/v1/lecturas/")
        self.assertEqual(len(r.json()["results"]), 3)

    def test_el_administrador_de_plataforma_no_consulta_lecturas(self):
        r = cliente_de(self.e.plataforma).get("/api/v1/lecturas/")
        self.assertEqual(r.status_code, 403)

    def test_ultimas_lecturas_por_variable(self):
        Lectura.objects.create(
            sensor_num=self.e.dht22.pk,
            variable_codigo="HUM",
            valor=45,
            fecha_hora=timezone.now(),
        )
        r = cliente_de(self.e.operador).get(
            f"/api/v1/dispositivos/{self.e.dispositivo.pk}/ultimas-lecturas/"
        )
        porvariable = {x["variable"]: Decimal(x["valor"]) for x in r.json()}
        self.assertEqual(porvariable, {"TEMP": 24, "HUM": 45})
        self.assertEqual({x["sensor_modelo"] for x in r.json()}, {"DHT22"})
