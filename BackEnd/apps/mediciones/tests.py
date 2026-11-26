import re
from datetime import datetime, timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.core import mail
from django.db import IntegrityError, connections, transaction
from django.test import override_settings
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
        # Un correo por responsable: supervisor del área, administrador y operador.
        notificaciones = Notificacion.objects.all()
        self.assertEqual(
            {n.usuario_id for n in notificaciones},
            {self.e.supervisor.pk, self.e.admin.pk, self.e.operador.pk},
        )
        for notificacion in notificaciones:
            self.assertEqual(notificacion.canal, Notificacion.Canal.CORREO)
            self.assertIsNone(notificacion.telefono_push)
            self.assertEqual(notificacion.estado_envio, Notificacion.EstadoEnvio.ENVIADA)
        self.assertEqual(
            sorted(c.to[0] for c in mail.outbox),
            sorted([self.e.supervisor.correo, self.e.admin.correo, self.e.operador.correo]),
        )
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

    def test_sin_supervisor_avisa_a_administradores_y_operador(self):
        self.e.supervisor.delete()
        self.enviar(40)
        self.assertEqual(
            set(Notificacion.objects.values_list("usuario_id", flat=True)),
            {self.e.admin.pk, self.e.operador.pk},
        )

    def test_un_umbral_inactivo_no_genera_alertas(self):
        self.e.umbral_temp.activo = False
        self.e.umbral_temp.save()
        self.enviar(40)
        self.assertFalse(Alerta.objects.exists())

    def test_fallo_del_correo_queda_registrado_como_fallida(self):
        from unittest import mock

        with mock.patch("apps.alertas.notificaciones.correo.enviar", side_effect=OSError("smtp")):
            self.enviar(40)
        estados = set(Notificacion.objects.values_list("estado_envio", flat=True))
        self.assertEqual(estados, {Notificacion.EstadoEnvio.FALLIDA})
        self.assertEqual(Alerta.objects.count(), 1)

    def test_el_aviso_llega_en_menos_de_dos_minutos(self):
        self.enviar(40)
        alerta = Alerta.objects.get()
        for notificacion in Notificacion.objects.all():
            self.assertLess(
                notificacion.fecha_envio - alerta.lectura_fecha_hora, timedelta(minutes=2)
            )


class BateriaSinDatoTests(PruebaBase):
    def test_sin_bateria_en_el_mensaje_el_nivel_queda_vacio(self):
        e = Escenario()
        temp = [lectura("DHT22", "TEMP", 22)]
        services.procesar_mensaje(mensaje(e.dispositivo.codigo_mqtt, temp, bateria=81))
        e.dispositivo.refresh_from_db()
        self.assertEqual(e.dispositivo.nivel_bateria, 81)
        services.procesar_mensaje(mensaje(e.dispositivo.codigo_mqtt, temp))
        e.dispositivo.refresh_from_db()
        self.assertIsNone(e.dispositivo.nivel_bateria)
        self.assertEqual(e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_EN_LINEA)


class VoltajeEIntervaloInformadoTests(PruebaBase):
    """Desde el firmware 1.1.5 el ESP manda el voltaje de la celda y el intervalo que usa."""

    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.e = Escenario()
        self.temp = [lectura("DHT22", "TEMP", 22)]
        parche = mock.patch("apps.mediciones.mqtt.publicar_configuracion")
        self.publicar = parche.start()
        self.addCleanup(parche.stop)

    def procesar(self, **extra):
        services.procesar_mensaje(mensaje(self.e.dispositivo.codigo_mqtt, self.temp, **extra))
        self.e.dispositivo.refresh_from_db()

    def test_guarda_el_voltaje_y_el_intervalo(self):
        self.procesar(
            bateria=64, bateria_v=3.8714, intervalo_seg=self.e.dispositivo.intervalo_muestreo_seg
        )
        self.assertEqual(self.e.dispositivo.voltaje_bateria, Decimal("3.871"))
        self.assertEqual(
            self.e.dispositivo.intervalo_reportado_seg, self.e.dispositivo.intervalo_muestreo_seg
        )
        self.publicar.assert_not_called()

    def test_un_voltaje_imposible_o_mal_tipado_se_ignora(self):
        for valor in (0, 0.0, 7.2, "3.9", True):
            self.procesar(bateria=50, bateria_v=valor)
            self.assertIsNone(self.e.dispositivo.voltaje_bateria, valor)

    @override_settings(MQTT_PUBLICAR_CONFIG=True)
    def test_si_el_esp_usa_otro_intervalo_se_le_reenvia_la_configuracion_una_vez(self):
        self.procesar(intervalo_seg=120)
        self.procesar(intervalo_seg=120)
        self.assertEqual(self.e.dispositivo.intervalo_reportado_seg, 120)
        self.publicar.assert_called_once()

    @override_settings(MQTT_PUBLICAR_CONFIG=False)
    def test_sin_envio_de_configuracion_no_se_reenvia(self):
        self.procesar(intervalo_seg=120)
        self.publicar.assert_not_called()

    @override_settings(MQTT_PUBLICAR_CONFIG=True)
    def test_un_mensaje_rezagado_no_cambia_el_intervalo_informado(self):
        antes = (timezone.now() - timedelta(hours=1)).isoformat()
        self.procesar(intervalo_seg=120, fecha_hora=antes)
        self.assertIsNone(self.e.dispositivo.intervalo_reportado_seg)
        self.publicar.assert_not_called()


class LecturasRezagadasTests(PruebaBase):
    """Lo que el ESP guardó sin conexión (memoria o microSD) y manda al volver."""

    def setUp(self):
        self.e = Escenario()
        self.codigo = self.e.dispositivo.codigo_mqtt

    def enviar(self, valor, hace=None, **extra):
        fecha = {} if hace is None else {"fecha_hora": (timezone.now() - hace).isoformat()}
        return services.procesar_mensaje(
            mensaje(self.codigo, [lectura("DHT22", "TEMP", valor)], **fecha, **extra)
        )

    def test_se_guarda_con_la_hora_en_que_midio(self):
        self.enviar(22, hace=timedelta(days=3))
        guardada = Lectura.objects.get()
        esperada = timezone.now() - timedelta(days=3)
        self.assertLess(abs(esperada - guardada.fecha_hora), timedelta(seconds=5))
        self.e.dispositivo.refresh_from_db()
        self.assertLess(timezone.now() - self.e.dispositivo.ultima_conexion, timedelta(seconds=5))

    def test_alerta_rezagada_se_registra_sin_correo_ni_push(self):
        resultado = self.enviar(40, hace=timedelta(hours=5))
        self.assertEqual(len(resultado.alertas), 1)
        alerta = Alerta.objects.get()
        self.assertIn("Registrada al reconectarse", alerta.observaciones)
        self.assertFalse(Notificacion.objects.exists())
        self.assertEqual(mail.outbox, [])

    def test_alerta_de_hace_poco_si_avisa(self):
        self.enviar(40, hace=timedelta(minutes=3))
        self.assertIsNone(Alerta.objects.get().observaciones)
        self.assertEqual(Notificacion.objects.count(), 3)  # supervisor, administrador y operador

    def test_un_mensaje_repetido_no_duplica_lecturas(self):
        fecha = (timezone.now() - timedelta(hours=1)).isoformat()
        lecturas = [lectura("DHT22", "TEMP", 22), lectura("DHT22", "HUM", 50)]
        datos = mensaje(self.codigo, lecturas, fecha_hora=fecha)
        services.procesar_mensaje(datos)
        segundo = services.procesar_mensaje(datos)
        self.assertEqual(Lectura.objects.count(), 2)
        self.assertEqual(segundo.lecturas, [])
        self.assertEqual(len(segundo.descartadas), 2)

    def test_misma_hora_pero_otra_variable_si_se_guarda(self):
        fecha = (timezone.now() - timedelta(hours=1)).isoformat()
        for variable, valor in (("TEMP", 22), ("HUM", 50)):
            datos = mensaje(self.codigo, [lectura("DHT22", variable, valor)], fecha_hora=fecha)
            services.procesar_mensaje(datos)
        self.assertEqual(Lectura.objects.count(), 2)

    def test_fecha_en_el_futuro_se_rechaza(self):
        with self.assertRaises(MensajeInvalido):
            self.enviar(22, hace=-timedelta(hours=2))
        self.assertFalse(Lectura.objects.exists())
        self.enviar(22, hace=-timedelta(minutes=1))  # un par de minutos de desfase se tolera
        self.assertEqual(Lectura.objects.count(), 1)


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


class PaginasPorMomentoTests(PruebaBase):
    """Las páginas del histórico no parten un momento (varias filas con la misma ``fecha_hora``)."""

    def setUp(self):
        self.e = Escenario()
        self.cliente = cliente_de(self.e.analista)
        self.ahora = timezone.now().replace(microsecond=0)
        # Tres momentos de 3 filas (DHT22 TEMP y HUM, CCS811 AIRE), creadas en desorden.
        self.momentos = [self.ahora - timedelta(minutes=m) for m in (1, 2, 3)]
        for fecha in reversed(self.momentos):
            for sensor, variable, valor in (
                (self.e.ccs811, "AIRE", 600),
                (self.e.dht22, "TEMP", 22),
                (self.e.dht22, "HUM", 50),
            ):
                Lectura.objects.create(
                    sensor_num=sensor.pk, variable_codigo=variable, valor=valor, fecha_hora=fecha
                )

    def _pagina(self, tamano, numero=1, estado=200):
        r = self.cliente.get("/api/v1/lecturas/", {"page_size": tamano, "page": numero})
        self.assertEqual(r.status_code, estado, r.content)
        return r.json()

    def _todas(self, tamano):
        """Recorre las páginas siguiendo ``next``, como la web («Cargar más»)."""
        filas, numero = [], 1
        while True:
            pagina = self._pagina(tamano, numero)
            self.assertEqual(pagina["count"], 9)
            self.assertTrue(pagina["results"], "next llevó a una página vacía")
            filas.append(pagina["results"])
            if not pagina["next"]:
                return filas
            siguiente = int(re.search(r"[?&]page=(\d+)", pagina["next"]).group(1))
            self.assertGreater(siguiente, numero)
            numero = siguiente

    def test_orden_estable_dentro_del_momento(self):
        filas = self._pagina(50)["results"]
        claves = [
            (
                -datetime.fromisoformat(x["fecha_hora"]).timestamp(),
                x["sensor_num"],
                x["variable_codigo"],
            )
            for x in filas
        ]
        self.assertEqual(claves, sorted(claves))
        self.assertEqual(len(set(claves)), 9)

    def test_ninguna_pagina_parte_un_momento(self):
        for tamano in (1, 2, 3, 4, 5, 8, 9, 10):
            with self.subTest(page_size=tamano):
                paginas = self._todas(tamano)
                nums = [x["num"] for p in paginas for x in p]
                self.assertEqual(len(nums), 9)  # ni repetidas ni perdidas
                self.assertEqual(len(set(nums)), 9)
                vistos = set()
                for pagina in paginas:
                    momentos = {x["fecha_hora"] for x in pagina}
                    self.assertFalse(momentos & vistos, "un momento quedó en dos páginas")
                    vistos |= momentos
                    for momento in momentos:
                        self.assertEqual(sum(x["fecha_hora"] == momento for x in pagina), 3)

    def test_la_pagina_se_extiende_hasta_cerrar_el_momento(self):
        # page_size=4 corta el 2.º momento: la 1.ª página lo trae completo (6 filas), la 2.ª
        # trae el 3.º y no hay más, aunque count/page_size diría 3 páginas.
        primera = self._pagina(4)
        self.assertEqual(len(primera["results"]), 6)
        self.assertIsNone(primera["previous"])
        segunda = self._pagina(4, 2)
        self.assertEqual(len(segunda["results"]), 3)
        self.assertIsNone(segunda["next"])
        self.assertIsNotNone(segunda["previous"])
        self.assertNotIn("page=", segunda["previous"])

    def test_un_momento_mas_grande_que_la_pagina(self):
        # page_size=1: cada página trae su momento entero y next salta a la del siguiente.
        primera = self._pagina(1)
        self.assertEqual(len(primera["results"]), 3)
        self.assertIn("page=4", primera["next"])
        self.assertEqual(self._pagina(1, 2)["results"], [])  # quedó dentro del 1.er momento

    def test_corte_exacto_y_paginas_invalidas(self):
        self.assertEqual(len(self._pagina(3)["results"]), 3)
        self.assertEqual(len(self._pagina(3, 3)["results"]), 3)
        self._pagina(3, 4, estado=404)
        self._pagina(3, "x", estado=404)
        self.assertEqual(len(self._pagina(3, "last")["results"]), 3)

    def test_filtros_y_pagina_por_omision(self):
        r = self.cliente.get("/api/v1/lecturas/", {"variable": "TEMP"}).json()
        self.assertEqual((r["count"], len(r["results"]), r["next"]), (3, 3, None))
        vacia = self.cliente.get(
            "/api/v1/lecturas/", {"variable": "TEMP", "hasta": "2000-01-01T00:00:00Z"}
        )
        self.assertEqual(vacia.json(), {"count": 0, "next": None, "previous": None, "results": []})


class CompresionYRetencionTests(PruebaBase):
    """Las lecturas viejas se comprimen solas y la retención es opcional."""

    databases = {"default", "iot"}

    def _politicas(self):
        from django.db import connections

        with connections["iot"].cursor() as cursor:
            cursor.execute(
                "SELECT proc_name FROM timescaledb_information.jobs "
                "WHERE hypertable_name = 'lectura' ORDER BY proc_name"
            )
            return [fila[0] for fila in cursor.fetchall()]

    def test_compresion_activa_y_retencion_configurable(self):
        from django.core.management import call_command
        from django.test import override_settings

        self.assertIn("policy_compression", self._politicas())
        with override_settings(NUCLEO_LECTURAS_RETENCION_DIAS=730):
            call_command("retencion_lecturas", stdout=StringIO())
        self.assertIn("policy_retention", self._politicas())
        with override_settings(NUCLEO_LECTURAS_RETENCION_DIAS=0):
            call_command("retencion_lecturas", stdout=StringIO())
        self.assertNotIn("policy_retention", self._politicas())
