from unittest import mock

import numpy as np
from django.test import SimpleTestCase
from rest_framework.test import APIClient

from common.testing import Escenario, PruebaBase, cliente_de

from . import voz
from .texto_voz import normalizar, numero_a_palabras

URL = "/api/v1/nico/voz/"


class NormalizarTextoTests(SimpleTestCase):
    def test_numeros(self):
        casos = {
            0: "cero",
            16: "dieciséis",
            21: "veintiuno",
            68: "sesenta y ocho",
            100: "cien",
            101: "ciento uno",
            640: "seiscientos cuarenta",
            1000: "mil",
            1250: "mil doscientos cincuenta",
            2026: "dos mil veintiséis",
            21000: "veintiún mil",
            201_000: "doscientos un mil",
            1_000_000: "un millón",
            2_500_000: "dos millones quinientos mil",
        }
        for n, esperado in casos.items():
            self.assertEqual(numero_a_palabras(n), esperado, n)

    def test_lectura_tipica(self):
        self.assertEqual(
            normalizar("El área está a 21.5 °C con 68 % de humedad y el CO2 en 640 ppm."),
            "El área está a veintiuno punto cinco grados con sesenta y ocho por ciento de humedad"
            " y el ce o dos en seiscientas cuarenta partes por millón.",
        )

    def test_unidades_y_concordancia(self):
        self.assertEqual(normalizar("1 °C"), "un grado")
        self.assertEqual(normalizar("21 °C"), "veintiún grados")
        self.assertEqual(normalizar("-3.2 °C"), "menos tres punto dos grados")
        self.assertEqual(normalizar("0.05 ppm"), "cero punto cero cinco partes por millón")
        self.assertEqual(normalizar("45%HR"), "cuarenta y cinco por ciento de humedad")
        self.assertEqual(normalizar("12 µg/m³"), "doce microgramos por metro cúbico")
        self.assertEqual(normalizar("Tienes 1 alerta"), "Tienes una alerta")
        self.assertEqual(normalizar("201 lecturas"), "doscientas una lecturas")
        self.assertEqual(normalizar("1 sensor"), "un sensor")
        self.assertEqual(normalizar("1 de 3"), "uno de tres")

    def test_miles_rangos_y_codigos(self):
        self.assertEqual(normalizar("1,250 lecturas"), "mil doscientas cincuenta lecturas")
        self.assertEqual(normalizar("entre 20-25 °C"), "entre veinte a veinticinco grados")
        self.assertEqual(normalizar("Núcleo A-01"), "Núcleo A cero uno")
        self.assertEqual(normalizar("NC-0501"), "ene ce cero cinco cero uno")
        self.assertEqual(normalizar("el ESP32 por Wi-Fi"), "el e ese pe treinta y dos por wifi")
        self.assertEqual(normalizar("PM2.5"), "pe eme dos punto cinco")

    def test_fechas_y_horas(self):
        self.assertEqual(normalizar("19/11/2026"), "diecinueve de noviembre de dos mil veintiséis")
        self.assertEqual(normalizar("2026-11-01"), "primero de noviembre de dos mil veintiséis")
        self.assertEqual(normalizar("a las 15:30"), "a las quince treinta")
        self.assertEqual(normalizar("a las 08:05"), "a las ocho cero cinco")
        self.assertEqual(normalizar("a las 14:00 h"), "a las catorce horas")

    def test_texto_sin_cifras_no_cambia(self):
        texto = "¡Hola! Soy Nico, tu asistente. ¿En qué te ayudo?"
        self.assertEqual(normalizar(texto), texto)


class PulirAudioTests(SimpleTestCase):
    def test_recorta_silencios_e_iguala_volumen(self):
        tasa = 16000
        tono = 0.02 * np.sin(np.linspace(0, 2 * np.pi * 200, tasa)).astype(np.float32)
        audio = np.concatenate([np.zeros(tasa), tono, np.zeros(tasa)]).astype(np.float32)
        pulido = voz.pulir(audio, tasa)
        margen = voz.MARGEN_INICIO_S + voz.MARGEN_FINAL_S
        self.assertLess(len(pulido) / tasa, 1 + margen + 0.01)
        self.assertGreater(float(np.max(np.abs(pulido))), 0.1)
        self.assertLessEqual(float(np.max(np.abs(pulido))), 0.95 + 1e-6)

    def test_silencio_total_queda_vacio(self):
        self.assertEqual(voz.pulir(np.zeros(1000, dtype=np.float32), 16000).size, 0)

    def test_mp3(self):
        tono = 0.3 * np.sin(np.linspace(0, 2 * np.pi * 300, 22050)).astype(np.float32)
        mp3 = voz.a_mp3(tono, 22050)
        self.assertGreater(len(mp3), 1000)
        self.assertTrue(mp3[:3] == b"ID3" or mp3[0] == 0xFF)


class VozTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    @mock.patch("apps.nico.voz.sintetizar_mp3", return_value=b"mp3-falso")
    def test_devuelve_audio(self, sintetizar):
        r = cliente_de(self.e.analista).post(URL, {"texto": "Hola, soy Nico."}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "audio/mpeg")
        self.assertEqual(r.content, b"mp3-falso")
        sintetizar.assert_called_once_with("Hola, soy Nico.")

    @mock.patch("apps.nico.voz.sintetizar_mp3", return_value=b"mp3")
    def test_permisos_y_limites(self, _):
        self.assertEqual(APIClient().post(URL, {"texto": "hola"}, format="json").status_code, 401)
        operador = cliente_de(self.e.operador)
        self.assertEqual(operador.post(URL, {"texto": "hola"}, format="json").status_code, 403)
        analista = cliente_de(self.e.analista)
        self.assertEqual(analista.post(URL, {"texto": ""}, format="json").status_code, 400)
        largo = "a" * (voz.MAX_CARACTERES + 1)
        self.assertEqual(analista.post(URL, {"texto": largo}, format="json").status_code, 400)

    def test_precalentar(self):
        with mock.patch("apps.nico.voz.precalentar") as precalentar:
            r = cliente_de(self.e.analista).get(URL)
            self.assertEqual(r.status_code, 204)
            self.assertEqual(cliente_de(self.e.operador).get(URL).status_code, 403)
        precalentar.assert_called_once_with()

    def test_error_del_motor(self):
        with mock.patch("apps.nico.voz.voz", side_effect=FileNotFoundError):
            r = cliente_de(self.e.analista).post(URL, {"texto": "Hola"}, format="json")
        self.assertEqual(r.status_code, 503)

    def test_normaliza_antes_de_sintetizar(self):
        falsa = mock.Mock(tasa=16000)
        falsa.sintetizar.return_value = 0.3 * np.ones(1600, dtype=np.float32)
        with mock.patch("apps.nico.voz.voz", return_value=falsa):
            mp3 = voz.sintetizar_mp3("Está a 21.5 °C.")
        falsa.sintetizar.assert_called_once_with("Está a veintiuno punto cinco grados.")
        self.assertTrue(mp3)
