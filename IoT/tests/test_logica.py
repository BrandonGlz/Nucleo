"""Pruebas de la lógica del firmware: umbrales, calentamiento, cola y mensaje.

Ejecutar desde la carpeta principal:  IoT/.venv/bin/python -m unittest discover -s IoT/tests
"""

import json
import os
import unittest

from tests import stubs  # noqa: F401  (debe importarse primero)
from tests.stubs import CCS811, DHT22, reloj

import config
from nucleo import aplicacion
from nucleo.cola import ColaDeEnvio
from nucleo.sensores import Sensores
from nucleo.umbrales import ADVERTENCIA, NORMAL, PELIGRO, Ajustes

TEMP = {
    "variable": "TEMP",
    "peligro_min": 15,
    "advertencia_min": 18,
    "advertencia_max": 25,
    "peligro_max": 28,
}


def limpiar_archivos():
    for ruta in (config.ARCHIVO_AJUSTES, config.ARCHIVO_BASELINE):
        if os.path.exists(ruta):
            os.remove(ruta)


class AjustesTests(unittest.TestCase):
    def setUp(self):
        limpiar_archivos()

    def test_clasifica_igual_que_el_backend(self):
        ajustes = Ajustes()
        self.assertTrue(ajustes.actualizar({"intervalo_muestreo_seg": 10, "umbrales": [TEMP]}))
        casos = {
            18: NORMAL,
            25: NORMAL,
            25.5: ADVERTENCIA,
            28: ADVERTENCIA,
            28.5: PELIGRO,
            17: ADVERTENCIA,
            15: ADVERTENCIA,
            14.5: PELIGRO,
        }
        for valor, esperado in casos.items():
            self.assertEqual(ajustes.nivel("TEMP", valor), esperado, valor)
        self.assertEqual(ajustes.nivel("HUM", 99), NORMAL)  # sin umbral: normal

    def test_rechaza_intervalos_y_limites_invalidos(self):
        ajustes = Ajustes()
        self.assertFalse(ajustes.actualizar({"intervalo_muestreo_seg": 2}))
        self.assertFalse(ajustes.actualizar({"intervalo_muestreo_seg": 200}))
        invalido = dict(TEMP, peligro_min=20)
        self.assertFalse(ajustes.actualizar({"umbrales": [invalido]}))
        self.assertEqual(ajustes.intervalo_seg, config.INTERVALO_MUESTREO_SEG)

    def test_la_configuracion_sobrevive_a_un_reinicio(self):
        Ajustes().actualizar({"intervalo_muestreo_seg": 45, "umbrales": [TEMP]})
        despues = Ajustes()
        self.assertEqual(despues.intervalo_seg, 45)
        self.assertEqual(despues.nivel("TEMP", 29), PELIGRO)


class SensoresTests(unittest.TestCase):
    def setUp(self):
        limpiar_archivos()
        reloj["ms"] = 0
        DHT22.falla = False
        DHT22.temperatura, DHT22.humedad = 22.0, 48.0
        CCS811.presente = CCS811.listo = True
        CCS811.eco2 = 450
        CCS811.guardado = None
        self.sensores = Sensores(i2c=None)

    def test_lee_las_tres_variables(self):
        self.assertEqual(self.sensores.leer(), {"TEMP": 22.0, "HUM": 48.0, "AIRE": 450})

    def test_si_el_dht22_falla_se_siguen_leyendo_los_demas(self):
        DHT22.falla = True
        self.assertEqual(self.sensores.leer(), {"AIRE": 450})

    def test_si_falta_el_ccs811_se_lee_lo_demas_y_se_reintenta(self):
        CCS811.presente = False
        sensores = Sensores(i2c=None)
        self.assertEqual(sensores.leer(), {"TEMP": 22.0, "HUM": 48.0})
        CCS811.presente = True
        self.assertIn("AIRE", sensores.leer())

    def test_descarta_valores_fuera_del_rango_fisico(self):
        DHT22.temperatura, DHT22.humedad = 95.0, 130.0
        CCS811.eco2 = 20000
        self.assertEqual(self.sensores.leer(), {})

    def test_el_aire_se_estabiliza_a_los_20_minutos(self):
        self.assertFalse(self.sensores.aire_estabilizado())
        self.assertEqual(self.sensores.calentamiento_restante_seg(), 1200)
        reloj["ms"] = 1199_000
        self.assertFalse(self.sensores.aire_estabilizado())
        reloj["ms"] = 1200_000
        self.assertTrue(self.sensores.aire_estabilizado())
        self.assertEqual(self.sensores.calentamiento_restante_seg(), 0)

    def test_el_baseline_se_guarda_solo_estabilizado_y_cada_hora(self):
        self.sensores.leer()  # calentando: no guarda
        self.assertFalse(os.path.exists(config.ARCHIVO_BASELINE))
        reloj["ms"] = 1200_000
        self.sensores.leer()
        with open(config.ARCHIVO_BASELINE) as archivo:
            self.assertEqual(json.load(archivo), [12, 34])
        CCS811.baseline = (99, 99)
        reloj["ms"] = 1200_000 + 1800_000  # media hora después: no reescribe
        self.sensores.leer()
        with open(config.ARCHIVO_BASELINE) as archivo:
            self.assertEqual(json.load(archivo), [12, 34])
        reloj["ms"] = 1200_000 + 3600_000
        self.sensores.leer()
        with open(config.ARCHIVO_BASELINE) as archivo:
            self.assertEqual(json.load(archivo), [99, 99])
        CCS811.baseline = (12, 34)

    def test_el_baseline_guardado_se_restaura_al_iniciar(self):
        with open(config.ARCHIVO_BASELINE, "w") as archivo:
            json.dump([7, 8], archivo)
        Sensores(i2c=None)
        self.assertEqual(CCS811.guardado, (7, 8))


class ColaTests(unittest.TestCase):
    def test_envia_en_orden_y_se_detiene_en_el_primer_fallo(self):
        cola = ColaDeEnvio(maximo=10)
        for n in range(4):
            cola.agregar({"n": n, "fecha_hora": "t"})
        enviados = []
        self.assertEqual(cola.enviar(lambda m: enviados.append(m["n"]) or True, maximo=2), 2)
        self.assertEqual(enviados, [0, 1])
        self.assertEqual(cola.enviar(lambda m: False), 0)
        self.assertEqual(len(cola), 2)

    def test_descarta_lo_mas_antiguo_cuando_se_llena(self):
        cola = ColaDeEnvio(maximo=3)
        for n in range(5):
            cola.agregar({"n": n, "fecha_hora": "t"})
        enviados = []
        cola.enviar(lambda m: enviados.append(m["n"]) or True, maximo=10)
        self.assertEqual(enviados, [2, 3, 4])

    def test_los_mensajes_sin_hora_no_se_conservan_tras_un_fallo(self):
        cola = ColaDeEnvio()
        cola.agregar({"n": 1})
        cola.agregar({"n": 2, "fecha_hora": "t"})
        cola.enviar(lambda m: False)
        self.assertEqual(len(cola), 1)


class MensajeTests(unittest.TestCase):
    class Red:
        def __init__(self, hora):
            self._hora = hora

        def hora_iso(self):
            return self._hora

    def test_formato_que_espera_el_backend(self):
        sensores = Sensores(i2c=None)
        mensaje = aplicacion._construir_mensaje(
            self.Red("2026-10-24T15:30:00Z"), sensores, {"TEMP": 22.4, "AIRE": 412}, False, 87
        )
        self.assertEqual(
            mensaje,
            {
                "dispositivo": "NUC-001",
                "aire_estabilizado": False,
                "fecha_hora": "2026-10-24T15:30:00Z",
                "bateria": 87,
                "lecturas": [
                    {"sensor": "DHT22", "variable": "TEMP", "valor": 22.4},
                    {"sensor": "CCS811", "variable": "AIRE", "valor": 412},
                ],
            },
        )

    def test_sin_hora_ni_bateria_se_omiten_esos_campos(self):
        sensores = Sensores(i2c=None)
        mensaje = aplicacion._construir_mensaje(self.Red(None), sensores, {"TEMP": 22}, True, None)
        self.assertNotIn("fecha_hora", mensaje)
        self.assertNotIn("bateria", mensaje)

    def test_el_aire_sin_estabilizar_no_activa_la_alerta_local(self):
        ajustes = Ajustes()
        aire = {
            "variable": "AIRE",
            "peligro_min": 0,
            "advertencia_min": 0,
            "advertencia_max": 1000,
            "peligro_max": 2000,
        }
        ajustes.actualizar({"umbrales": [TEMP, aire]})
        lecturas = {"TEMP": 22, "AIRE": 5000}
        self.assertEqual(aplicacion._nivel_local(ajustes, lecturas, False), NORMAL)
        self.assertEqual(aplicacion._nivel_local(ajustes, lecturas, True), PELIGRO)





class LlaveNicoTests(unittest.TestCase):
    """El ESP firma las peticiones de Nico igual que las verifica el servidor."""

    class Cliente:
        def __init__(self):
            self.publicados = []

        def publish(self, topico, carga):
            self.publicados.append((topico, json.loads(carga)))

    def setUp(self):
        import secrets

        from nucleo import comunicacion

        self.comunicacion = comunicacion
        secrets.PUENTE_CLAVE = "clave-del-puente"
        self.addCleanup(delattr, secrets, "PUENTE_CLAVE")

    def test_el_socket_conectado_tiene_limite_de_espera(self):
        """check_msg deja el socket bloqueante sin límite: se le vuelve a poner el tope."""

        class Sock:
            limite = "sin"

            def settimeout(self, segundos):
                self.limite = segundos

        class Contexto:
            def wrap_socket(self, sock, **opciones):
                return ("tls", sock)

        tls = self.comunicacion._TLS(Contexto())
        crudo = Sock()
        self.assertEqual(tls.wrap_socket(crudo, server_hostname="h"), ("tls", crudo))
        tls.limitar()
        self.assertEqual(crudo.limite, self.comunicacion.config.MQTT_ESPERA_SEG)

    def test_hmac_igual_al_de_python(self):
        import hashlib
        import hmac

        esperado = hmac.new(b"k", b"NUC-001:id:reto", hashlib.sha256).hexdigest()
        self.assertEqual(self.comunicacion.hmac_sha256(b"k", b"NUC-001:id:reto"), esperado)

    def test_firma_la_peticion_y_avisa(self):
        import hashlib
        import hmac

        firmas = []
        broker = self.comunicacion.Broker(lambda c: None, None, lambda: firmas.append(1))
        broker._cliente = self.Cliente()
        broker._mensaje(
            b"nucleo/devices/NUC-001/puente/peticion", json.dumps({"id": "a1", "reto": "r9"})
        )
        topico, carga = broker._cliente.publicados[0]
        self.assertEqual(topico, "nucleo/devices/NUC-001/puente/autoriza")
        esperada = hmac.new(
            b"clave-del-puente", b"NUC-001:a1:r9", hashlib.sha256
        ).hexdigest()
        self.assertEqual(carga, {"id": "a1", "firma": esperada})
        self.assertEqual((broker.firmadas, firmas), (1, [1]))

    def test_una_peticion_incompleta_no_se_firma(self):
        broker = self.comunicacion.Broker(lambda c: None)
        broker._cliente = self.Cliente()
        broker._mensaje(b"nucleo/devices/NUC-001/puente/peticion", json.dumps({"id": "a1"}))
        self.assertEqual(broker._cliente.publicados, [])

    def test_la_configuracion_sigue_llegando(self):
        recibidas = []
        broker = self.comunicacion.Broker(recibidas.append)
        broker._mensaje(
            b"nucleo/devices/NUC-001/config",
            json.dumps({"dispositivo": "NUC-001", "intervalo_muestreo_seg": 20}),
        )
        self.assertEqual(recibidas[0]["intervalo_muestreo_seg"], 20)


class BuzzerTests(unittest.TestCase):
    class PWM:
        creados = []

        def __init__(self, pin, freq, duty_u16):
            self.freq, self.duty = freq, duty_u16
            self.activo = True
            BuzzerTests.PWM.creados.append(self)

        def deinit(self):
            self.activo = False

    def setUp(self):
        from nucleo import indicadores

        self.modulo = indicadores
        self.original = indicadores._PWM
        BuzzerTests.PWM.creados = []

    def tearDown(self):
        self.modulo._PWM = self.original

    def test_en_peligro_los_pulsos_los_genera_el_hardware(self):
        self.modulo._PWM = BuzzerTests.PWM
        ind = self.modulo.Indicadores()
        ind.nivel(PELIGRO)
        ind.actualizar_buzzer()
        ind.actualizar_buzzer()
        self.assertEqual(len(BuzzerTests.PWM.creados), 1)  # se crea una sola vez
        pwm = BuzzerTests.PWM.creados[0]
        self.assertEqual((pwm.freq, pwm.duty), (1, 200 * 65535 // 1000))
        ind.nivel(NORMAL)
        self.assertFalse(pwm.activo)  # al salir del peligro se apaga

    def test_sin_pwm_lento_se_generan_por_software(self):
        self.modulo._PWM = None
        ind = self.modulo.Indicadores()
        ind.nivel(PELIGRO)
        reloj["ms"] = 100
        ind.actualizar_buzzer()
        self.assertEqual(ind._buzzer.valor, 1)
        reloj["ms"] = 500
        ind.actualizar_buzzer()
        self.assertEqual(ind._buzzer.valor, 0)

class BateriaTests(unittest.TestCase):
    class I2C:
        def __init__(self, registros=None, falla=False):
            self.registros, self.falla = registros or {}, falla

        def readfrom_mem(self, direccion, registro, n):
            if self.falla:
                raise OSError("sin respuesta")
            valor = self.registros[registro]
            return bytes([valor >> 8, valor & 0xFF])

    def setUp(self):
        from nucleo import bateria

        self.bateria = bateria
        self.original = config.BATERIA
        config.BATERIA = "MAX17048"

    def tearDown(self):
        config.BATERIA = self.original

    def test_lee_porcentaje_y_voltaje_del_max17048(self):
        # 0x5280 → 82.5 %; 0xCCCC × 78.125 µV ≈ 4.096 V
        b = self.bateria.Bateria(self.I2C({0x04: 0x5280, 0x02: 0xCCCC}))
        self.assertEqual(b.porcentaje(), 82)
        self.assertAlmostEqual(b.voltaje, 4.096, places=3)

    def test_la_carga_se_limita_a_100(self):
        b = self.bateria.Bateria(self.I2C({0x04: 0x6500, 0x02: 0xD000}))
        self.assertEqual(b.porcentaje(), 100)

    def test_sin_medidor_se_omite_el_nivel(self):
        self.assertIsNone(self.bateria.Bateria(self.I2C(falla=True)).porcentaje())

    def test_sin_bateria_configurada_no_hay_nivel(self):
        config.BATERIA = None
        self.assertIsNone(self.bateria.Bateria(self.I2C({0x04: 0x5000})).porcentaje())

if __name__ == "__main__":
    unittest.main()
