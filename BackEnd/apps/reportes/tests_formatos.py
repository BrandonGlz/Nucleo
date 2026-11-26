"""Pruebas de las plantillas de formato, su catálogo y sus predeterminados."""

import tempfile
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone

from apps.reportes import ia, pdf
from apps.reportes.formatos import (
    CONF_CUMPLIMIENTO,
    CONF_EJECUTIVO,
    CONF_INCIDENTES,
    CONF_OPERATIVO,
    formato_para,
    validar_conf,
)
from apps.reportes.models import FormatoReporte, Reporte, VersionFormato
from common.testing import Escenario, PruebaBase, cliente_de

VISIBLES_PLANTILLAS = {
    FormatoReporte.Plantilla.EJECUTIVO: ["cifras", "serie", "analisis"],
    FormatoReporte.Plantilla.CUMPLIMIENTO: [
        "cifras",
        "alertas",
        "var:TEMP",
        "var:HUM",
        "var:AIRE",
        "analisis",
    ],
    FormatoReporte.Plantilla.OPERATIVO: [
        "cifras",
        "var:TEMP",
        "var:HUM",
        "var:AIRE",
        "serie",
        "alertas",
        "analisis",
    ],
    FormatoReporte.Plantilla.INCIDENTES: ["alertas", "serie", "analisis"],
}


class ValidarConfTests(PruebaBase):
    def test_acepta_la_configuracion_base(self):
        normalizada = validar_conf(CONF_OPERATIVO)

        self.assertEqual(normalizada["version_esquema"], 1)
        self.assertEqual(normalizada["orden"], CONF_OPERATIVO["orden"])
        self.assertEqual(normalizada["ocultos"], [])
        self.assertEqual(normalizada["opciones"]["cifras"]["ancho"], "12")

    def test_cumplimiento_usa_alertas_a_todo_lo_ancho(self):
        normalizada = validar_conf(CONF_CUMPLIMIENTO)

        self.assertEqual(normalizada["opciones"]["alertas"]["ancho"], "12")

    def test_rechaza_un_alto_invalido(self):
        for alto in ("x", 10, True):
            with self.subTest(alto=alto):
                conf = {**CONF_OPERATIVO, "opciones": {"serie": {"alto": alto}}}
                with self.assertRaisesMessage(ValidationError, "alto"):
                    validar_conf(conf)

    def test_conserva_el_alto_valido_y_quita_el_nulo(self):
        con_alto = validar_conf(
            {**CONF_OPERATIVO, "opciones": {"serie": {"alto": 320}}}
        )
        self.assertEqual(con_alto["opciones"]["serie"]["alto"], 320)

        con_nulo = validar_conf(
            {**CONF_OPERATIVO, "opciones": {"serie": {"alto": None}}}
        )
        self.assertNotIn("alto", con_nulo["opciones"]["serie"])
        self.assertNotIn("alto", validar_conf(CONF_OPERATIVO)["opciones"]["serie"])

    def test_rechaza_una_fuente_inexistente(self):
        conf = {
            **CONF_OPERATIVO,
            "personalizadas": [{"id": "p1", "fuente": "no-existe", "nombre": "Prueba"}],
        }

        with self.assertRaisesMessage(ValidationError, "no existe"):
            validar_conf(conf)

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


class PlantillasTests(PruebaBase):
    def test_las_cuatro_plantillas_existen_con_su_version_uno(self):
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
            self.assertEqual(version.numero, 1)
            normalizada = validar_conf(version.conf)
            self.assertEqual(normalizada["orden"], version.conf["orden"])
            self.assertEqual(normalizada["ocultos"], version.conf["ocultos"])
            visibles = [i for i in normalizada["orden"] if i not in normalizada["ocultos"]]
            self.assertEqual(visibles, VISIBLES_PLANTILLAS[formato.plantilla])
            if formato.plantilla == FormatoReporte.Plantilla.CUMPLIMIENTO:
                self.assertEqual(
                    version.conf["opciones"]["alertas"].get("ancho"),
                    "12",
                )

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

        self.assertEqual(r.status_code, 201, r.content)
        cuerpo = r.json()
        self.assertEqual(cuerpo["formato"], formato["num"])
        self.assertEqual(cuerpo["formato_version"], 1)
        guardado = Reporte.objects.get(pk=cuerpo["num"])
        self.assertEqual(guardado.formato_version.formato_id, modelo.pk)
        redactar.assert_called_once()

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
            "dispositivos": {"NC-0501": {"TEMP": {"promedio": 24.5}}},
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
            CONF_OPERATIVO,
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
