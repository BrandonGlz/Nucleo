"""Pruebas de las plantillas de formato, su catálogo y sus predeterminados."""

import io
import re
import tempfile
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone
from PIL import Image

from apps.reportes import formatos, ia, pdf
from apps.reportes.formatos import (
    CONF_CUMPLIMIENTO,
    CONF_EJECUTIVO,
    CONF_INCIDENTES,
    CONF_OPERATIVO,
    CONF_OPERATIVO_AMPLIADO,
    formato_para,
    validar_conf,
)
from apps.reportes.models import FormatoReporte, Reporte, VersionFormato
from common.fechas import duracion_legible
from common.testing import Escenario, PruebaBase, cliente_de

VISIBLES_PLANTILLAS = {
    FormatoReporte.Plantilla.EJECUTIVO: [
        "cifras",
        "cumplimiento",
        "comparativo",
        "serie",
        "analisis",
    ],
    FormatoReporte.Plantilla.CUMPLIMIENTO: [
        "cumplimiento",
        "disponibilidad",
        "incidentes",
        "gestion_alertas",
        "observaciones",
        "analisis",
    ],
    FormatoReporte.Plantilla.OPERATIVO: [
        "cifras",
        "var:TEMP",
        "var:HUM",
        "var:AIRE",
        "serie",
        "alertas",
        "dispositivos",
        "gestion_alertas",
        "disponibilidad",
        "analisis",
    ],
    FormatoReporte.Plantilla.INCIDENTES: [
        "incidentes",
        "alertas",
        "gestion_alertas",
        "observaciones",
    ],
}


class DuracionLegibleTests(PruebaBase):
    def test_duraciones_de_ejemplo(self):
        casos = {
            3.4: "3 min",
            0: "0 min",
            191.2: "3 h 11 min",
            11354.1: "7 d 21 h",
            None: "—",
        }
        for minutos, esperado in casos.items():
            with self.subTest(minutos=minutos):
                self.assertEqual(duracion_legible(minutos), esperado)

    def test_los_limites_de_unidad(self):
        self.assertEqual(duracion_legible(59.6), "1 h")
        self.assertEqual(duracion_legible(60), "1 h")
        self.assertEqual(duracion_legible(1439), "23 h 59 min")
        self.assertEqual(duracion_legible(1440), "1 d")


class ValidarConfTests(PruebaBase):
    def test_acepta_la_configuracion_base(self):
        normalizada = validar_conf(CONF_OPERATIVO)

        self.assertEqual(normalizada["version_esquema"], 1)
        self.assertEqual(normalizada["orden"], CONF_OPERATIVO["orden"])
        self.assertEqual(normalizada["ocultos"], [])
        self.assertEqual(normalizada["opciones"]["cifras"]["ancho"], "12")

    def test_las_plantillas_traen_sus_tarjetas_nuevas(self):
        normalizada = validar_conf(CONF_CUMPLIMIENTO)

        self.assertEqual(normalizada["opciones"]["cumplimiento"]["grafica"], "tabla")
        self.assertIn("incidentes", normalizada["orden"])

    def test_rechaza_un_alto_invalido(self):
        for alto in ("x", 10, True):
            with self.subTest(alto=alto):
                conf = {**CONF_OPERATIVO, "opciones": {"serie": {"alto": alto}}}
                with self.assertRaisesMessage(ValidationError, "alto"):
                    validar_conf(conf)

    def test_conserva_el_alto_valido_y_quita_el_nulo(self):
        con_alto = validar_conf({**CONF_OPERATIVO, "opciones": {"serie": {"alto": 320}}})
        self.assertEqual(con_alto["opciones"]["serie"]["alto"], 320)

        con_nulo = validar_conf({**CONF_OPERATIVO, "opciones": {"serie": {"alto": None}}})
        self.assertNotIn("alto", con_nulo["opciones"]["serie"])
        self.assertNotIn("alto", validar_conf(CONF_OPERATIVO)["opciones"]["serie"])

    def test_rechaza_una_fuente_inexistente(self):
        conf = {
            **CONF_OPERATIVO,
            "personalizadas": [{"id": "p1", "fuente": "no-existe", "nombre": "Prueba"}],
        }

        with self.assertRaisesMessage(ValidationError, "no existe"):
            validar_conf(conf)

    def test_valida_el_adjunto_csv_de_la_hoja(self):
        normalizada = validar_conf({**CONF_OPERATIVO, "hoja": {"adjuntar_csv": True}})
        self.assertTrue(normalizada["hoja"]["adjuntar_csv"])
        self.assertFalse(validar_conf(CONF_OPERATIVO)["hoja"]["adjuntar_csv"])

        with self.assertRaisesMessage(ValidationError, "adjuntar_csv"):
            validar_conf({**CONF_OPERATIVO, "hoja": {"adjuntar_csv": "sí"}})

    def test_rechaza_una_opcion_invalida(self):
        conf = {**CONF_OPERATIVO, "opciones": {"serie": {"grafica": "pastel"}}}

        with self.assertRaisesMessage(ValidationError, "no es válido"):
            validar_conf(conf)

    def test_quita_ids_desconocidos_y_completa_las_tarjetas(self):
        conf = {
            **CONF_OPERATIVO,
            "orden": ["fantasma", "cifras"],
            "ocultos": ["cifras", "fantasma"],
        }

        normalizada = validar_conf(conf)

        self.assertNotIn("fantasma", normalizada["orden"])
        self.assertEqual(normalizada["orden"][0], "cifras")
        self.assertEqual(len(normalizada["orden"]), 7)
        self.assertEqual(normalizada["ocultos"], ["cifras"])

    def test_la_hoja_por_omision_es_carta_vertical_sin_portada_ni_firmas(self):
        hoja = validar_conf(CONF_OPERATIVO)["hoja"]

        self.assertEqual(hoja["tamano"], "carta")
        self.assertEqual(hoja["orientacion"], "vertical")
        self.assertFalse(hoja["portada"])
        self.assertEqual(hoja["firmas"], {})
        self.assertEqual(hoja["analisis_largo"], "normal")
        self.assertFalse(hoja["adjuntar_csv"])

    def test_valida_los_campos_de_la_hoja_y_las_firmas(self):
        hoja = validar_conf(
            {
                **CONF_OPERATIVO,
                "hoja": {
                    "tamano": "a4",
                    "orientacion": "horizontal",
                    "portada": True,
                    "analisis_largo": "detallado",
                    "firmas": {
                        "elaboro": {"nombre": " Ana López ", "cargo": "Jefa"},
                        "reviso": {"nombre": "", "cargo": ""},
                    },
                },
            }
        )["hoja"]

        self.assertEqual(hoja["tamano"], "a4")
        self.assertEqual(hoja["orientacion"], "horizontal")
        self.assertTrue(hoja["portada"])
        self.assertEqual(hoja["analisis_largo"], "detallado")
        self.assertEqual(hoja["firmas"]["elaboro"], {"nombre": "Ana López", "cargo": "Jefa"})
        self.assertNotIn("reviso", hoja["firmas"])

    def test_rechaza_hojas_invalidas(self):
        casos = [
            ({"tamano": "oficio"}, "tamaño"),
            ({"orientacion": "diagonal"}, "orientación"),
            ({"portada": "sí"}, "portada"),
            ({"analisis_largo": "largo"}, "largo"),
            ({"adjuntar_csv": "sí"}, "adjuntar_csv"),
            ({"firmas": {"elaboro": "Ana"}}, "firma"),
        ]
        for hoja, mensaje in casos:
            with self.subTest(hoja=hoja):
                with self.assertRaisesMessage(ValidationError, mensaje):
                    validar_conf({**CONF_OPERATIVO, "hoja": hoja})

    def test_las_opciones_comunes_de_la_tarjeta_se_validan_y_recortan(self):
        conf = validar_conf(
            {
                **CONF_OPERATIVO,
                "opciones": {
                    "var:TEMP": {
                        "titulo": "  Temperatura del turno  ",
                        "nota": "  Lecturas estabilizadas.  ",
                        "decimales": 2,
                        "filtro": {"areas": [2, 2, 3]},
                    }
                },
            }
        )
        opciones = conf["opciones"]["var:TEMP"]

        self.assertEqual(opciones["titulo"], "Temperatura del turno")
        self.assertEqual(opciones["nota"], "Lecturas estabilizadas.")
        self.assertEqual(opciones["decimales"], 2)
        self.assertEqual(opciones["filtro"], {"areas": [2, 3]})

    def test_rechaza_opciones_comunes_invalidas(self):
        casos = [
            ({"titulo": "x" * 61}, "60"),
            ({"nota": "x" * 201}, "200"),
            ({"decimales": 3}, "decimales"),
            ({"decimales": True}, "decimales"),
            ({"filtro": {"areas": ["2"]}}, "áreas"),
            ({"filtro": {"dispositivos": [2]}}, "dispositivos"),
            ({"filtro": {"otra": [1]}}, "filtro"),
        ]
        for opciones, mensaje in casos:
            with self.subTest(opciones=opciones):
                with self.assertRaisesMessage(ValidationError, mensaje):
                    validar_conf({**CONF_OPERATIVO, "opciones": {"var:TEMP": opciones}})

    def test_un_filtro_vacio_no_se_guarda(self):
        conf = validar_conf({**CONF_OPERATIVO, "opciones": {"var:TEMP": {"filtro": {"areas": []}}}})

        self.assertNotIn("filtro", conf["opciones"]["var:TEMP"])


class LargoAnalisisTests(PruebaBase):
    def test_largo_analisis_usa_la_hoja_del_formato(self):
        version = SimpleNamespace(conf={**CONF_OPERATIVO, "hoja": {"analisis_largo": "detallado"}})

        self.assertEqual(formatos.largo_analisis(version), "detallado")
        self.assertEqual(formatos.largo_analisis(None), "normal")

    def test_la_instruccion_de_la_ia_cambia_con_el_largo(self):
        capturado = {}

        def proveedor(instrucciones, _cifras):
            capturado["instrucciones"] = instrucciones
            return "Texto"

        with (
            mock.patch.dict(ia.PROVEEDORES, {"prueba": proveedor}),
            override_settings(IA_PROVEEDOR="prueba"),
        ):
            ia.redactar({}, largo="breve")
            breve = capturado["instrucciones"]
            ia.redactar({}, largo="detallado")
            detallado = capturado["instrucciones"]

        self.assertIn("3 a 4 frases", breve)
        self.assertIn("hasta 4 párrafos", detallado)

    def test_rechaza_un_largo_desconocido(self):
        with self.assertRaises(ValueError):
            ia.redactar({}, largo="eterno")


class PlantillasTests(PruebaBase):
    def test_las_cuatro_plantillas_existen_con_su_version_tres(self):
        plantillas = FormatoReporte.objects.filter(organizacion__isnull=True)

        self.assertEqual(
            set(plantillas.values_list("plantilla", flat=True)),
            {
                FormatoReporte.Plantilla.EJECUTIVO,
                FormatoReporte.Plantilla.CUMPLIMIENTO,
                FormatoReporte.Plantilla.OPERATIVO,
                FormatoReporte.Plantilla.INCIDENTES,
            },
        )
        for formato in plantillas:
            version = formato.version_actual()
            self.assertIsNotNone(version)
            self.assertEqual(version.numero, 3)
            normalizada = validar_conf(version.conf)
            self.assertEqual(normalizada["orden"], version.conf["orden"])
            self.assertEqual(normalizada["ocultos"], version.conf["ocultos"])
            visibles = [i for i in normalizada["orden"] if i not in normalizada["ocultos"]]
            self.assertEqual(visibles, VISIBLES_PLANTILLAS[formato.plantilla])
            if formato.plantilla == FormatoReporte.Plantilla.CUMPLIMIENTO:
                self.assertEqual(
                    version.conf["opciones"]["cumplimiento"]["grafica"],
                    "tabla",
                )
            if formato.plantilla == FormatoReporte.Plantilla.OPERATIVO:
                self.assertEqual(version.conf["hoja"]["analisis_largo"], "breve")

    def test_no_hay_dos_predeterminados_activos_en_una_organizacion(self):
        e = Escenario()
        FormatoReporte.objects.create(
            organizacion=e.organizacion,
            nombre="Uno",
            predeterminado=True,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                FormatoReporte.objects.create(
                    organizacion=e.organizacion,
                    nombre="Dos",
                    predeterminado=True,
                )

    def test_la_migracion_solo_agrega_versiones_a_las_plantillas(self):
        copias = VersionFormato.objects.filter(
            numero=3,
            formato__organizacion__isnull=False,
        )
        self.assertFalse(copias.exists())


class FormatoParaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.operativo = FormatoReporte.objects.get(
            plantilla=FormatoReporte.Plantilla.OPERATIVO,
        )

    def _formato(self, nombre, **extra):
        return FormatoReporte.objects.create(
            organizacion=self.e.organizacion,
            nombre=nombre,
            **extra,
        )

    def test_usa_el_formato_elegido(self):
        elegido = self._formato("Elegido")
        area = self._formato("Del área")
        self.e.area.formato_reporte = area
        self.e.area.save(update_fields=["formato_reporte"])
        self._formato("De la organización", predeterminado=True)

        self.assertEqual(formato_para(self.e.organizacion, self.e.area, elegido), elegido)

    def test_usa_el_formato_del_area(self):
        area = self._formato("Del área")
        self.e.area.formato_reporte = area
        self.e.area.save(update_fields=["formato_reporte"])
        self._formato("De la organización", predeterminado=True)

        self.assertEqual(formato_para(self.e.organizacion, self.e.area), area)

    def test_usa_el_formato_de_la_organizacion(self):
        organizacion = self._formato("De la organización", predeterminado=True)

        self.assertEqual(formato_para(self.e.organizacion, self.e.area), organizacion)

    def test_cae_en_la_plantilla_operativo(self):
        self.assertEqual(formato_para(self.e.organizacion, self.e.area), self.operativo)


class VersionFormatoTests(PruebaBase):
    def test_version_actual_es_la_de_mayor_numero(self):
        e = Escenario()
        formato = FormatoReporte.objects.create(
            organizacion=e.organizacion,
            nombre="Con versiones",
        )
        VersionFormato.objects.create(formato=formato, numero=1, conf=CONF_OPERATIVO)
        VersionFormato.objects.create(formato=formato, numero=2, conf=CONF_EJECUTIVO)

        self.assertEqual(formato.version_actual().numero, 2)


class FormatoReporteAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.admin = cliente_de(self.e.admin)

    def _crear(self, nombre, conf=None):
        r = self.admin.post(
            "/api/v1/formatos-reporte/",
            {"nombre": nombre, "conf": conf or CONF_OPERATIVO},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def _reporte(self, **extra):
        ahora = timezone.now()
        datos = {
            "organizacion": self.e.organizacion,
            "area": self.e.area,
            "origen": Reporte.Origen.MANUAL,
            "periodo_inicio": ahora - timedelta(days=1),
            "periodo_fin": ahora,
            "cifras": {},
            "contenido": "Análisis",
        }
        datos.update(extra)
        return Reporte.objects.create(**datos)

    def test_analista_lee_pero_no_crea(self):
        cliente = cliente_de(self.e.analista)
        r = cliente.get("/api/v1/formatos-reporte/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any(f["es_plantilla"] for f in r.json()["results"]))

        r = cliente.post(
            "/api/v1/formatos-reporte/",
            {"nombre": "Del analista", "conf": CONF_OPERATIVO},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_editar_crea_la_version_dos_y_el_reporte_viejo_conserva_la_uno(self):
        formato = self._crear("Propio")
        version_uno = FormatoReporte.objects.get(pk=formato["num"]).version_actual()
        reporte = self._reporte(formato_version=version_uno)

        r = self.admin.patch(
            f"/api/v1/formatos-reporte/{formato['num']}/",
            {"conf": CONF_EJECUTIVO},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        cuerpo = r.json()
        self.assertEqual(cuerpo["version"], 2)
        self.assertEqual(cuerpo["conf"]["orden"], CONF_EJECUTIVO["orden"])

        reporte.refresh_from_db()
        self.assertEqual(reporte.formato_version_id, version_uno.pk)

    def test_no_se_edita_una_plantilla(self):
        plantilla = FormatoReporte.objects.get(
            organizacion__isnull=True,
            plantilla=FormatoReporte.Plantilla.EJECUTIVO,
        )
        r = self.admin.patch(
            f"/api/v1/formatos-reporte/{plantilla.num}/",
            {"nombre": "Otra"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_duplicar(self):
        plantilla = FormatoReporte.objects.get(
            organizacion__isnull=True,
            plantilla=FormatoReporte.Plantilla.EJECUTIVO,
        )
        r = self.admin.post(
            f"/api/v1/formatos-reporte/{plantilla.num}/duplicar/",
            {},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        copia = r.json()
        self.assertEqual(copia["nombre"], f"Copia de {plantilla.nombre}")
        self.assertFalse(copia["es_plantilla"])
        self.assertEqual(copia["version"], 1)
        self.assertEqual(
            copia["conf"]["orden"],
            plantilla.version_actual().conf["orden"],
        )

        r = self.admin.post(
            f"/api/v1/formatos-reporte/{plantilla.num}/duplicar/",
            {},
            format="json",
        )
        self.assertEqual(r.json()["nombre"], f"Copia de {plantilla.nombre} (2)")

    def test_predeterminado_unico(self):
        uno = self._crear("Uno")
        dos = self._crear("Dos")

        self.assertEqual(
            self.admin.post(
                f"/api/v1/formatos-reporte/{uno['num']}/predeterminado/",
                {},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(
            self.admin.post(
                f"/api/v1/formatos-reporte/{dos['num']}/predeterminado/",
                {},
                format="json",
            ).status_code,
            200,
        )

        self.assertFalse(FormatoReporte.objects.get(pk=uno["num"]).predeterminado)
        self.assertTrue(FormatoReporte.objects.get(pk=dos["num"]).predeterminado)
        self.assertEqual(
            FormatoReporte.objects.filter(
                organizacion=self.e.organizacion,
                predeterminado=True,
            ).count(),
            1,
        )

    def test_generar_sin_formato_usa_el_predeterminado_del_area(self):
        formato = self._crear("Del área")
        modelo = FormatoReporte.objects.get(pk=formato["num"])
        self.e.area.formato_reporte = modelo
        self.e.area.save(update_fields=["formato_reporte"])
        ahora = timezone.now()
        solicitud = {
            "periodo_inicio": (ahora - timedelta(hours=2)).isoformat(),
            "periodo_fin": ahora.isoformat(),
        }

        with (
            tempfile.TemporaryDirectory() as carpeta,
            override_settings(MEDIA_ROOT=carpeta),
            mock.patch.object(ia, "redactar", return_value="Análisis") as redactar,
        ):
            r = cliente_de(self.e.analista).post(
                "/api/v1/reportes/",
                solicitud,
                format="json",
            )
            call_command("procesar_reportes", "--una-vez")

        self.assertEqual(r.status_code, 201, r.content)
        cuerpo = r.json()
        self.assertEqual(cuerpo["formato"], formato["num"])
        self.assertEqual(cuerpo["formato_version"], 1)
        guardado = Reporte.objects.get(pk=cuerpo["num"])
        self.assertEqual(guardado.formato_version.formato_id, modelo.pk)
        redactar.assert_called_once()

    def test_generar_pasa_el_largo_del_analisis_a_la_ia(self):
        formato = self._crear(
            "Detallado",
            {
                **CONF_OPERATIVO,
                "hoja": {"analisis_largo": "detallado"},
            },
        )
        ahora = timezone.now()
        solicitud = {
            "formato": formato["num"],
            "periodo_inicio": (ahora - timedelta(hours=2)).isoformat(),
            "periodo_fin": ahora.isoformat(),
        }

        with (
            tempfile.TemporaryDirectory() as carpeta,
            override_settings(MEDIA_ROOT=carpeta),
            mock.patch.object(ia, "redactar", return_value="Análisis") as redactar,
        ):
            r = cliente_de(self.e.analista).post("/api/v1/reportes/", solicitud, format="json")
            call_command("procesar_reportes", "--una-vez")

        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(redactar.call_args.kwargs["largo"], "detallado")

    def test_cambiar_formato_regenera_el_pdf_sin_ia(self):
        uno = self._crear("Uno")
        dos = self._crear("Dos", CONF_EJECUTIVO)
        version_uno = FormatoReporte.objects.get(pk=uno["num"]).version_actual()
        reporte = self._reporte(formato_version=version_uno)

        with (
            tempfile.TemporaryDirectory() as carpeta,
            override_settings(MEDIA_ROOT=carpeta),
            mock.patch.object(ia, "redactar") as redactar,
        ):
            r = cliente_de(self.e.analista).post(
                f"/api/v1/reportes/{reporte.num}/formato/",
                {"formato": dos["num"]},
                format="json",
            )
            reporte.refresh_from_db()
            pdf_existe = (Path(carpeta) / reporte.archivo_pdf).exists()

        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(pdf_existe)
        cuerpo = r.json()
        self.assertEqual(cuerpo["formato"], dos["num"])
        self.assertEqual(cuerpo["formato_version"], 1)
        self.assertEqual(cuerpo["formato_conf"]["orden"], CONF_EJECUTIVO["orden"])
        redactar.assert_not_called()

        self.assertEqual(reporte.formato_version.formato_id, dos["num"])

    def test_no_se_ve_ni_se_usa_el_formato_de_otra_organizacion(self):
        otro = Escenario("b")
        ajeno = FormatoReporte.objects.create(
            organizacion=otro.organizacion,
            nombre="Ajeno",
        )
        VersionFormato.objects.create(formato=ajeno, numero=1, conf=CONF_OPERATIVO)
        reporte = self._reporte()
        ahora = timezone.now()
        solicitud = {
            "formato": ajeno.num,
            "periodo_inicio": (ahora - timedelta(hours=2)).isoformat(),
            "periodo_fin": ahora.isoformat(),
        }

        self.assertEqual(
            self.admin.get(f"/api/v1/formatos-reporte/{ajeno.num}/").status_code,
            404,
        )
        self.assertEqual(
            self.admin.post(
                f"/api/v1/reportes/{reporte.num}/formato/",
                {"formato": ajeno.num},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(
            self.admin.post("/api/v1/reportes/", solicitud, format="json").status_code,
            404,
        )
        reporte.refresh_from_db()
        self.assertIsNone(reporte.formato_version_id)


class PdfFormatoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def _cifras(self, ahora):
        variables = {
            "TEMP": {
                "nombre": "Temperatura (°C)",
                "unidad": "°C",
                "promedio": 24.5,
                "minimo": 18.0,
                "maximo": 31.0,
                "muestras": 120,
                "pico_maximo_en": ahora.isoformat(),
                "pico_minimo_en": ahora.isoformat(),
            },
            "HUM": {
                "nombre": "Humedad relativa (%)",
                "unidad": "%HR",
                "promedio": 55.0,
                "minimo": 40.0,
                "maximo": 70.0,
                "muestras": 120,
                "pico_maximo_en": ahora.isoformat(),
                "pico_minimo_en": ahora.isoformat(),
            },
            "AIRE": {
                "nombre": "Calidad del aire (ppm)",
                "unidad": "ppm",
                "promedio": 430.0,
                "minimo": 380.0,
                "maximo": 520.0,
                "muestras": 120,
                "pico_maximo_en": ahora.isoformat(),
                "pico_minimo_en": ahora.isoformat(),
            },
        }
        series = {
            codigo: [
                {
                    "t": (ahora - timedelta(days=7 - i)).isoformat(),
                    "promedio": info["promedio"] + (i - 3) * 0.5,
                }
                for i in range(7)
            ]
            for codigo, info in variables.items()
        }
        return {
            "periodo": {"inicio": ahora.isoformat(), "fin": ahora.isoformat()},
            "variables": variables,
            "intervalo_serie": "dia",
            "series": series,
            "dispositivos": {
                "NC-0501": {
                    "nombre": "Núcleo L-01",
                    "area": "Laboratorio",
                    "TEMP": {"minimo": 20.0, "promedio": 24.5, "maximo": 31.0},
                    "HUM": {"minimo": 40.0, "promedio": 55.0, "maximo": 70.0},
                }
            },
            "cumplimiento": {
                "TEMP": {"dentro_pct": 92.5, "fuera_min": 12.0, "lecturas": 120},
                "HUM": {"dentro_pct": 98.0, "fuera_min": 3.0, "lecturas": 120},
            },
            "comparativo": {
                "periodo": {"inicio": ahora.isoformat(), "fin": ahora.isoformat()},
                "variables": [
                    {
                        "variable": "TEMP",
                        "nombre": "Temperatura",
                        "unidad": "°C",
                        "promedio": 24.5,
                        "minimo": 20.0,
                        "maximo": 31.0,
                        "promedio_previo": 23.3,
                        "minimo_previo": 19.0,
                        "maximo_previo": 30.0,
                        "dif_promedio": 1.2,
                        "dif_promedio_pct": 5.15,
                        "mejora": False,
                    }
                ],
                "alertas": {
                    "total": 4,
                    "total_previo": 5,
                    "diferencia": -1,
                    "diferencia_pct": -20.0,
                    "mejora": True,
                },
            },
            "gestion_alertas": {
                "estados": {"ATENDIDA": 2, "DESCARTADA": 1, "PENDIENTE": 1},
                "total": 4,
                "tiempo_medio_min": 18.5,
                "responsables": [{"usuario": "Ana López", "total": 3}],
            },
            "disponibilidad": {
                "NC-0501": {
                    "nombre": "Núcleo L-01",
                    "area": "Laboratorio",
                    "pct": 98.2,
                    "recibidas": 1178,
                    "esperadas": 1200,
                    "huecos": [{"inicio": ahora.isoformat(), "minutos": 22.0}],
                }
            },
            "incidentes": [
                {
                    "dispositivo": "Núcleo L-01",
                    "dispositivo_codigo": "NC-0501",
                    "area": "Laboratorio",
                    "variable": "TEMP",
                    "inicio": ahora.isoformat(),
                    "duracion_min": 45.0,
                    "valor_pico": 31.0,
                    "nivel": "PELIGRO",
                }
            ],
            "observaciones": [
                {
                    "fecha": ahora.isoformat(),
                    "dispositivo": "Núcleo L-01",
                    "dispositivo_codigo": "NC-0501",
                    "area": "Laboratorio",
                    "variable": "Temperatura",
                    "variable_codigo": "TEMP",
                    "usuario": "Ana López",
                    "texto": "Se abrió la puerta para ventilar.",
                }
            ],
            "alertas": {
                "total": 4,
                "por_estado": {"PENDIENTE": 4},
                "por_nivel": {"ADVERTENCIA": 3, "PELIGRO": 1},
                "por_tipo": {"POR_ENCIMA": 4},
                "por_variable": {"TEMP": 2, "HUM": 1, "AIRE": 1},
            },
        }

    def _reporte(self, conf):
        ahora = timezone.now()
        return SimpleNamespace(
            num=7,
            area_id=None,
            area=None,
            organizacion=self.e.organizacion,
            periodo_inicio=ahora - timedelta(days=7),
            periodo_fin=ahora,
            fecha_generacion=ahora,
            origen="MANUAL",
            cifras=self._cifras(ahora),
            contenido=(
                "La temperatura se mantuvo estable durante la mayor parte del periodo.\n\n"
                "La humedad bajó por la tarde y el aire tuvo un pico que conviene revisar."
            ),
            formato_version=SimpleNamespace(conf=conf),
            formato_version_id=1,
        )

    def _reporte_estres(self, conf):
        """R-0099 «Prueba de estrés», como objeto (no se guarda en la base).

        Reproduce los datos largos de producción: 12 días de serie, nombres de dispositivo
        largos, 9 incidentes de 3 a 11354 min, 12 observaciones de 60–90 caracteres y
        cumplimiento con «Temperatura».
        """
        ahora = timezone.now()
        inicio = ahora - timedelta(days=12)
        nombres = [
            ("NC-A01", "Núcleo A-01 Laboratorio norte"),
            ("NC-A02", "Núcleo A-02 Docencia vespertina"),
            ("NC-A03", "Núcleo A-03 Sala de cómputo"),
        ]
        variables = {
            "TEMP": ("Temperatura (°C)", "°C", 24.8, 14.2, 39.6, 66144),
            "HUM": ("Humedad relativa (%)", "%HR", 61.4, 28.1, 88.9, 66144),
            "AIRE": ("Calidad del aire (ppm)", "ppm", 1840.0, 310.0, 4870.0, 66144),
        }
        series = {}
        for codigo, (_, _, promedio, _, _, _) in variables.items():
            series[codigo] = [
                {
                    "t": (inicio + timedelta(days=i)).isoformat(),
                    "promedio": promedio + (i - 5) * (40 if codigo == "AIRE" else 0.8),
                }
                for i in range(12)
            ]
        dispositivos = {
            codigo: {
                "nombre": nombre,
                "area": "Docencia 1",
                "area_num": 4,
                "TEMP": {"minimo": 14.2, "promedio": 24.8, "maximo": 39.6},
                "HUM": {"minimo": 28.1, "promedio": 61.4, "maximo": 88.9},
                "AIRE": {"minimo": 310.0, "promedio": 1840.0, "maximo": 4870.0},
            }
            for codigo, nombre in nombres
        }
        duraciones = [3, 47, 191, 312, 889, 2324, 4180, 7920, 11354]
        textos = [
            "Se revisó la ventilación del laboratorio y se ajustó la extracción del área norte.",
            "La puerta del aula quedó abierta durante el cambio de turno y subió la humedad.",
            "Se calibró el sensor de calidad del aire después del mantenimiento programado.",
            "El equipo de docencia reportó lecturas altas al mediodía por la apertura de ventanas.",
            "Se limpió el filtro del sistema de extracción y bajaron los niveles de eCO₂.",
            "La batería del dispositivo bajó del veinte por ciento y se cambió en el mismo turno.",
            "Se revisó el cableado del sensor de temperatura y se restableció la conexión.",
            "El aula estuvo cerrada sin ventilación durante la pausa y la humedad se elevó.",
            "Se ajustó el umbral de advertencia del aire tras revisar el histórico del mes.",
            "El personal de limpieza usó productos con alcohol y el sensor marcó un pico breve.",
            "Se documentó el cambio de ubicación del equipo para mejorar la representatividad.",
            "El mantenimiento de la red eléctrica interrumpió el envío de lecturas por dos horas.",
        ]
        incidentes = []
        observaciones = []
        for i, duracion in enumerate(duraciones):
            codigo, nombre = nombres[i % len(nombres)]
            variable = ("TEMP", "HUM", "AIRE")[i % 3]
            incidentes.append(
                {
                    "dispositivo": nombre,
                    "dispositivo_codigo": codigo,
                    "area": "Docencia 1",
                    "area_num": 4,
                    "variable": variable,
                    "variable_nombre": variables[variable][0].split(" (")[0],
                    "inicio": (inicio + timedelta(days=1 + i)).isoformat(),
                    "duracion_min": duracion,
                    "valor_pico": {"TEMP": 39.6, "HUM": 88.9, "AIRE": 4870.0}[variable],
                    "nivel": "PELIGRO" if i % 2 == 0 else "ADVERTENCIA",
                }
            )
        for i, texto in enumerate(textos):
            codigo, nombre = nombres[i % len(nombres)]
            variable = ("TEMP", "HUM", "AIRE")[i % 3]
            observaciones.append(
                {
                    "fecha": (ahora - timedelta(hours=i * 3)).isoformat(),
                    "dispositivo": nombre,
                    "dispositivo_codigo": codigo,
                    "area": "Docencia 1",
                    "area_num": 4,
                    "variable": variables[variable][0].split(" (")[0],
                    "variable_codigo": variable,
                    "usuario": (
                        "María Fernanda de la Cruz Villalobos"
                        if i % 2 == 0
                        else "José Antonio Ramírez Hernández"
                    ),
                    "texto": texto,
                }
            )
        return SimpleNamespace(
            num=99,
            area_id=None,
            area=None,
            organizacion=self.e.organizacion,
            organizacion_id=self.e.organizacion.pk,
            periodo_inicio=inicio,
            periodo_fin=ahora,
            fecha_generacion=ahora,
            origen="MANUAL",
            cifras={
                "alcance": "Docencia 1",
                "periodo": {"inicio": inicio.isoformat(), "fin": ahora.isoformat()},
                "variables": {
                    codigo: {
                        "nombre": nombre,
                        "unidad": unidad,
                        "promedio": promedio,
                        "minimo": minimo,
                        "maximo": maximo,
                        "muestras": muestras,
                        "pico_maximo_en": ahora.isoformat(),
                        "pico_minimo_en": ahora.isoformat(),
                    }
                    for codigo, (
                        nombre,
                        unidad,
                        promedio,
                        minimo,
                        maximo,
                        muestras,
                    ) in variables.items()
                },
                "intervalo_serie": "dia",
                "series": series,
                "dispositivos": dispositivos,
                "cumplimiento": {
                    "TEMP": {"dentro_pct": 91.4, "fuera_min": 11354.1, "lecturas": 66144},
                    "HUM": {"dentro_pct": 87.2, "fuera_min": 2324.0, "lecturas": 66144},
                    "AIRE": {"dentro_pct": 82.6, "fuera_min": 312.5, "lecturas": 66144},
                },
                "comparativo": {
                    "periodo": {"inicio": inicio.isoformat(), "fin": ahora.isoformat()},
                    "variables": [
                        {
                            "variable": codigo,
                            "nombre": nombre.split(" (")[0],
                            "unidad": unidad,
                            "promedio": promedio,
                            "minimo": minimo,
                            "maximo": maximo,
                            "promedio_previo": promedio - 1.4,
                            "minimo_previo": minimo - 0.3,
                            "maximo_previo": maximo - 0.8,
                            "dif_promedio": 1.4,
                            "dif_promedio_pct": 6.0,
                            "mejora": False,
                        }
                        for codigo, (
                            nombre,
                            unidad,
                            promedio,
                            minimo,
                            maximo,
                            _,
                        ) in variables.items()
                    ],
                    "alertas": {
                        "total": 27,
                        "total_previo": 19,
                        "diferencia": 8,
                        "diferencia_pct": 42.1,
                        "mejora": False,
                    },
                },
                "gestion_alertas": {
                    "estados": {"ATENDIDA": 19, "DESCARTADA": 5, "PENDIENTE": 3},
                    "total": 27,
                    "tiempo_medio_min": 11354.1,
                    "responsables": [
                        {"usuario": "María Fernanda de la Cruz Villalobos", "total": 12},
                        {"usuario": "José Antonio Ramírez Hernández", "total": 8},
                    ],
                },
                "disponibilidad": {
                    codigo: {
                        "nombre": nombre,
                        "area": "Docencia 1",
                        "pct": (98.4, 91.7, 86.2)[i],
                        "recibidas": (12400, 11880, 10990)[i],
                        "esperadas": (12600, 12960, 12750)[i],
                        "huecos": [
                            {"inicio": inicio.isoformat(), "minutos": (11354.1, 2324.0, 312.5)[i]},
                            {"inicio": ahora.isoformat(), "minutos": (191.2, 47, 3)[i]},
                        ],
                    }
                    for i, (codigo, nombre) in enumerate(nombres)
                },
                "incidentes": incidentes,
                "observaciones": observaciones,
                "incidentes_total": len(incidentes),
                "observaciones_total": len(observaciones),
                "alertas": {
                    "total": 27,
                    "por_estado": {"PENDIENTE": 3, "ATENDIDA": 19, "DESCARTADA": 5},
                    "por_nivel": {"ADVERTENCIA": 14, "PELIGRO": 13},
                    "por_tipo": {"POR_ENCIMA": 27},
                    "por_variable": {"TEMP": 7, "HUM": 9, "AIRE": 11},
                },
            },
            contenido=(
                "La humedad relativa se mantuvo por encima del rango de advertencia durante "
                "varias tardes del periodo, sobre todo en el laboratorio norte.\n\n"
                "La calidad del aire presentó picos asociados a la apertura de ventanas y al "
                "cambio de turno.\n\n"
                "La temperatura no mostró una tendencia clara, pero los máximos coincidieron "
                "con los días de mayor ocupación."
            ),
            formato_version=SimpleNamespace(conf=conf),
            formato_version_id=1,
        )

    def _conf_todas_las_graficas(self):
        fuentes = {
            "cifras": [None],
            "var:TEMP": ["barras", "columnas", "tabla", "cifra"],
            "var:HUM": ["barras", "columnas", "tabla", "cifra"],
            "var:AIRE": ["barras", "columnas", "tabla", "cifra"],
            "serie": ["barras", "columnas", "linea", "tabla"],
            "alertas": ["barras", "dona", "columnas", "tabla"],
            "analisis": [None],
            "resumen": ["tabla"],
            "cumplimiento": ["barras", "tabla", "cifra"],
            "comparativo": ["tabla", "cifra"],
            "dispositivos": ["tabla"],
            "gestion_alertas": ["dona", "barras", "tabla"],
            "disponibilidad": ["barras", "tabla"],
            "incidentes": ["tabla", "lista"],
            "observaciones": ["tabla", "lista"],
        }
        personalizadas = []
        opciones = {}
        numero = 0
        for fuente, graficas in fuentes.items():
            for grafica in graficas:
                numero += 1
                id_tarjeta = f"p{numero}"
                personalizadas.append(
                    {
                        "id": id_tarjeta,
                        "fuente": fuente,
                        "nombre": f"{fuente} · {grafica or 'normal'}",
                    }
                )
                opciones[id_tarjeta] = {"ancho": "12"}
                if grafica:
                    opciones[id_tarjeta]["grafica"] = grafica
        # Las tarjetas de siempre aportan «rango» y la lista de alertas; el resto se oculta.
        opciones["var:TEMP"] = {"ancho": "12"}
        opciones["alertas"] = {"ancho": "12", "grafica": "lista"}
        return {
            "version_esquema": 1,
            "base": True,
            "orden": ["var:TEMP", "alertas", *[p["id"] for p in personalizadas]],
            "ocultos": ["cifras", "var:HUM", "var:AIRE", "serie", "analisis"],
            "opciones": opciones,
            "personalizadas": personalizadas,
            "hoja": {},
        }

    def test_construye_pdf_con_las_cuatro_plantillas(self):
        for conf in (
            CONF_OPERATIVO_AMPLIADO,
            CONF_EJECUTIVO,
            CONF_CUMPLIMIENTO,
            CONF_INCIDENTES,
        ):
            with self.subTest(conf=conf):
                datos = pdf.construir(self._reporte(conf))
                self.assertTrue(datos.startswith(b"%PDF"))

    def test_construye_pdf_con_todas_las_graficas_y_varias_paginas(self):
        datos = pdf.construir(self._reporte(self._conf_todas_las_graficas()))

        self.assertTrue(datos.startswith(b"%PDF"))
        self.assertGreater(datos.count(b"/Type /Page"), 1)

    def test_reporte_viejo_sin_las_claves_nuevas_sigue_generando_pdf(self):
        reporte = self._reporte(CONF_EJECUTIVO)
        for clave in (
            "cumplimiento",
            "comparativo",
            "gestion_alertas",
            "disponibilidad",
            "incidentes",
            "observaciones",
        ):
            reporte.cifras.pop(clave, None)

        datos = pdf.construir(reporte)

        self.assertTrue(datos.startswith(b"%PDF"))

    def test_escala_linea_deja_margen_vertical(self):
        minimo, maximo = pdf._escala_linea([48.0, 48.3])

        self.assertLess(minimo, 48.0)
        self.assertGreater(maximo, 48.3)

    def test_dona_colorea_cada_variable_por_su_color(self):
        variables = [
            {"variable": "TEMP", "alertas": 0},
            {"variable": "HUM", "alertas": 17},
            {"variable": "AIRE", "alertas": 0},
        ]

        segmentos = pdf.segmentos_dona(variables, 17)

        self.assertEqual(len(segmentos), 1)
        variable, color, grados = segmentos[0]
        self.assertEqual(variable, "HUM")
        self.assertIs(color, pdf.VERDE)
        self.assertEqual(grados, 360)

    def test_pdf_en_carta_y_a4_vertical_y_horizontal(self):
        medidas = {
            ("carta", "vertical"): b"[ 0 0 612 792 ]",
            ("carta", "horizontal"): b"[ 0 0 792 612 ]",
            ("a4", "vertical"): b"[ 0 0 595.2756 841.8898 ]",
            ("a4", "horizontal"): b"[ 0 0 841.8898 595.2756 ]",
        }
        for (tamano, orientacion), mediabox in medidas.items():
            with self.subTest(tamano=tamano, orientacion=orientacion):
                conf = {
                    **CONF_OPERATIVO,
                    "hoja": {"tamano": tamano, "orientacion": orientacion},
                }
                datos = pdf.construir(self._reporte(conf))
                self.assertIn(mediabox, datos)

    def test_la_portada_y_las_firmas_se_dibujan_cuando_se_piden(self):
        conf = {
            **CONF_EJECUTIVO,
            "hoja": {
                "portada": True,
                "firmas": {
                    "elaboro": {"nombre": "Ana López", "cargo": "Jefa"},
                    "reviso": {"nombre": "Carlos Ruiz", "cargo": "Gerente"},
                },
            },
        }
        with (
            mock.patch.object(pdf, "_portada", wraps=pdf._portada) as portada,
            mock.patch.object(pdf, "_dibujar_firmas", wraps=pdf._dibujar_firmas) as firmas,
        ):
            datos = pdf.construir(self._reporte(conf))

        self.assertTrue(datos.startswith(b"%PDF"))
        portada.assert_called_once()
        firmas.assert_called_once()

    def test_pdf_usa_el_logo_y_el_color_de_la_organizacion(self):
        with tempfile.TemporaryDirectory() as carpeta, override_settings(MEDIA_ROOT=carpeta):
            carpeta_logos = Path(carpeta) / "logos"
            carpeta_logos.mkdir()
            salida = io.BytesIO()
            Image.new("RGBA", (600, 200), (15, 122, 69, 255)).save(salida, format="PNG")
            (carpeta_logos / "logo.png").write_bytes(salida.getvalue())
            self.e.organizacion.logo = "logos/logo.png"
            self.e.organizacion.color_reporte = "#0F7A45"

            with mock.patch.object(pdf, "_dibujar_logo", wraps=pdf._dibujar_logo) as logo:
                datos = pdf.construir(self._reporte(CONF_EJECUTIVO))

            self.assertTrue(datos.startswith(b"%PDF"))
            logo.assert_called_once()
            self.assertIs(pdf._MARCA.get(), pdf.VERDE)

    def test_titulo_nota_decimales_y_filtro_de_una_tarjeta(self):
        conf = {
            **CONF_OPERATIVO,
            "opciones": {
                "var:TEMP": {
                    "titulo": "Temperatura del turno",
                    "nota": "Solo lecturas estabilizadas.",
                    "decimales": 2,
                },
                "dispositivos": {
                    "filtro": {"dispositivos": ["NC-0501"]},
                    "titulo": "Equipos del filtro",
                },
            },
        }

        datos = pdf.construir(self._reporte(conf))

        self.assertTrue(datos.startswith(b"%PDF"))
        self.assertEqual(pdf._titulo({"titulo": "Hola"}, "Adiós"), "Hola")
        self.assertEqual(pdf._decimales({"decimales": 2}, 1), 2)
        filas = [
            {"codigo": "NC-0501", "area_num": 1},
            {"codigo": "NC-0502", "area_num": 2},
        ]
        self.assertEqual(
            pdf._filas_filtradas({"filtro": {"areas": [1]}}, filas),
            [filas[0]],
        )
        self.assertEqual(
            pdf._filas_filtradas({"filtro": {"dispositivos": ["NC-0502"]}}, filas),
            [filas[1]],
        )
        self.assertEqual(pdf._filas_filtradas({}, filas), filas)

    def test_el_pdf_llama_a_la_nota_y_toma_los_decimales_de_la_tarjeta(self):
        conf = {
            **CONF_OPERATIVO,
            "opciones": {
                "var:TEMP": {
                    "titulo": "Temperatura del turno",
                    "nota": "Solo lecturas estabilizadas.",
                    "decimales": 2,
                }
            },
        }

        with (
            mock.patch.object(pdf, "_nota", wraps=pdf._nota) as nota,
            mock.patch.object(pdf, "_decimales", wraps=pdf._decimales) as decimales,
        ):
            pdf.construir(self._reporte(conf))

        notas = [llamada.args[5].get("nota") for llamada in nota.call_args_list]
        self.assertIn("Solo lecturas estabilizadas.", notas)
        self.assertTrue(
            any(llamada.args[0].get("decimales") == 2 for llamada in decimales.call_args_list)
        )

    def test_la_nota_reserva_su_espacio_debajo_de_la_tarjeta(self):
        with (
            mock.patch.object(pdf, "_dibujar_tarjeta_base") as base,
            mock.patch.object(pdf, "_nota") as nota,
        ):
            pdf._dibujar_tarjeta(
                None,
                "disponibilidad",
                0,
                300,
                200,
                220,
                {},
                {"nota": "x" * 200},
            )

        alto_tarjeta = base.call_args.args[5]
        self.assertLess(alto_tarjeta, 220)
        self.assertEqual(nota.call_args.args[4], alto_tarjeta)
        self.assertGreaterEqual(220 - alto_tarjeta, pdf._alto_nota("x" * 200, 200))

    def test_pdf_con_nota_en_disponibilidad_y_gestion_no_se_encima(self):
        conf = {
            **CONF_OPERATIVO_AMPLIADO,
            "opciones": {
                "disponibilidad": {
                    "grafica": "barras",
                    "ancho": "4",
                    "nota": "n" * 200,
                },
                "gestion_alertas": {
                    "grafica": "barras",
                    "ancho": "6",
                    "nota": "Tiempo medio de atención del periodo.",
                },
            },
        }

        datos = pdf.construir(self._reporte(conf))

        self.assertTrue(datos.startswith(b"%PDF"))

    def _paginas(self, datos):
        """Cuenta páginas con pypdf si está instalado; si no, con los objetos /Type /Page."""
        try:
            from pypdf import PdfReader

            return len(PdfReader(io.BytesIO(datos)).pages)
        except ImportError:
            return len(re.findall(rb"/Type\s*/Page(?!s)", datos))

    def _textos_fuera(self, datos):
        """Palabras cuya caja termina después del margen derecho, si hay pdfplumber."""
        try:
            import pdfplumber
        except ImportError:
            return []
        fuera = []
        with pdfplumber.open(io.BytesIO(datos)) as documento:
            for pagina in documento.pages:
                limite = float(pagina.width) - pdf.MARGEN_X + 1
                for palabra in pagina.extract_words():
                    if float(palabra["x1"]) > limite:
                        fuera.append((palabra["text"], float(palabra["x1"]), limite))
        return fuera

    def _textos_cruzados(self, datos):
        """Pares de palabras cuyas cajas se intersectan, si pdfplumber está instalado."""
        try:
            import pdfplumber
        except ImportError:
            return []
        cruces = []
        with pdfplumber.open(io.BytesIO(datos)) as documento:
            for pagina in documento.pages:
                palabras = pagina.extract_words()
                for i, a in enumerate(palabras):
                    for b in palabras[i + 1 :]:
                        ancho = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
                        alto = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
                        if ancho > 1 and alto > 1:
                            cruces.append((a["text"], b["text"], round(ancho, 1), round(alto, 1)))
        return cruces

    def test_ningun_texto_se_cruza_en_las_plantillas_de_estres(self):
        for conf in (
            CONF_OPERATIVO_AMPLIADO,
            CONF_EJECUTIVO,
            CONF_CUMPLIMIENTO,
            CONF_INCIDENTES,
        ):
            with self.subTest(conf=conf):
                datos = pdf.construir(self._reporte_estres(conf))

                self.assertEqual(self._textos_cruzados(datos), [])

    def test_cada_plantilla_de_estres_cabe_en_una_pagina(self):
        for conf in (
            CONF_OPERATIVO_AMPLIADO,
            CONF_EJECUTIVO,
            CONF_CUMPLIMIENTO,
            CONF_INCIDENTES,
        ):
            with self.subTest(conf=conf):
                datos = pdf.construir(self._reporte_estres(conf))

                self.assertTrue(datos.startswith(b"%PDF"))
                self.assertEqual(self._paginas(datos), 1)
                self.assertEqual(self._textos_fuera(datos), [])
