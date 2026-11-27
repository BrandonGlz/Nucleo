"""Pruebas de los tableros de analítica: modelos, catálogo, plantillas y API."""

import re
from pathlib import Path

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.analitica import catalogo
from apps.analitica.models import TableroAnalitica, VersionTablero
from common.testing import Escenario, PruebaBase, cliente_de

RUTA_CATALOGO_JS = (
    Path(__file__).resolve().parents[3]
    / "FrontEnd"
    / "src"
    / "features"
    / "analitica"
    / "catalogo.js"
)


class ModelosTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def _tablero(self, nombre, **extra):
        return TableroAnalitica.objects.create(
            organizacion=self.e.organizacion,
            nombre=nombre,
            **extra,
        )

    def test_version_actual_es_la_de_mayor_numero(self):
        tablero = self._tablero("Con versiones")
        VersionTablero.objects.create(tablero=tablero, numero=1, conf={})
        VersionTablero.objects.create(tablero=tablero, numero=2, conf={})

        self.assertEqual(tablero.version_actual().numero, 2)

    def test_una_plantilla_no_tiene_organizacion(self):
        tablero = TableroAnalitica.objects.create(
            nombre="Ejecutivo",
            plantilla=TableroAnalitica.Plantilla.EJECUTIVO,
        )

        self.assertIsNone(tablero.version_actual())
        self.assertEqual(str(tablero), "Ejecutivo (plantilla)")

    def test_no_se_mezcla_plantilla_con_organizacion(self):
        for plantilla, organizacion in (
            ("EJECUTIVO", self.e.organizacion),
            ("", None),
        ):
            with self.subTest(plantilla=plantilla):
                with self.assertRaises(IntegrityError):
                    with transaction.atomic():
                        TableroAnalitica.objects.create(
                            nombre=f"Inválido {plantilla}",
                            plantilla=plantilla,
                            organizacion=organizacion,
                        )

    def test_solo_hay_un_predeterminado_activo_por_organizacion(self):
        self._tablero("Uno", predeterminado=True)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._tablero("Dos", predeterminado=True)

    def test_el_nombre_es_unico_entre_los_activos(self):
        primero = self._tablero("Repetido")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._tablero("Repetido")

        primero.activo = False
        primero.save(update_fields=["activo"])
        self._tablero("Repetido")

    def test_el_numero_de_version_es_unico_por_tablero(self):
        tablero = self._tablero("Versiones")
        VersionTablero.objects.create(tablero=tablero, numero=1, conf={})

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                VersionTablero.objects.create(tablero=tablero, numero=1, conf={})


def _tarjeta_base(**extra):
    tarjeta = {
        "id": "t1",
        "tipo": "kpi",
        "x": 0,
        "y": 0,
        "w": 2,
        "h": 1,
        "titulo": "Cumplimiento",
        "opciones": {},
    }
    tarjeta.update(extra)
    return tarjeta


def _conf(*tarjetas, paginas=None):
    return {
        "esquema": 1,
        "filtros": {"periodo": "7d", "variable": "TEMP"},
        "paginas": paginas
        if paginas is not None
        else [{"id": "p1", "nombre": "Resumen", "tarjetas": list(tarjetas)}],
    }


def _pagina(indice, tarjetas=None):
    return {
        "id": f"p{indice}",
        "nombre": f"Página {indice}",
        "tarjetas": tarjetas or [],
    }


def _caja(tarjeta):
    return (tarjeta["x"], tarjeta["y"], tarjeta["w"], tarjeta["h"])


class ValidarConfTests(PruebaBase):
    def _error(self, conf):
        with self.assertRaises(ValidationError) as contexto:
            catalogo.validar_conf(conf)
        return " ".join(contexto.exception.messages)

    def test_normaliza_una_tarjeta_minima(self):
        normalizada = catalogo.validar_conf(_conf(_tarjeta_base()))

        self.assertEqual(normalizada["esquema"], 1)
        self.assertEqual(normalizada["filtros"], {"periodo": "7d", "variable": "TEMP"})
        self.assertEqual(normalizada["paginas"][0]["nombre"], "Resumen")
        tarjeta = normalizada["paginas"][0]["tarjetas"][0]
        self.assertEqual(
            tarjeta,
            {
                "id": "t1",
                "tipo": "kpi",
                "x": 0,
                "y": 0,
                "w": 2,
                "h": 1,
                "titulo": "Cumplimiento",
                "opciones": {
                    "indicador": "cumplimiento",
                    "variable": "filtro",
                    "nivel": "",
                    "comparar": True,
                    "sparkline": True,
                },
            },
        )

    def test_usa_el_nombre_del_tipo_si_falta_el_titulo(self):
        normalizada = catalogo.validar_conf(
            _conf(_tarjeta_base(titulo="   ", tipo="texto", w=2, h=1))
        )

        self.assertEqual(normalizada["paginas"][0]["tarjetas"][0]["titulo"], "Texto")

    def test_recorta_los_textos(self):
        pagina = {
            "id": " p1 ",
            "nombre": "  Resumen  ",
            "tarjetas": [
                {
                    "id": " t1 ",
                    "tipo": "texto",
                    "x": 0,
                    "y": 0,
                    "w": 2,
                    "h": 1,
                    "titulo": "  Nota  ",
                    "opciones": {"nota": "  Texto de la nota  "},
                }
            ],
        }
        normalizada = catalogo.validar_conf(_conf(paginas=[pagina]))

        self.assertEqual(normalizada["paginas"][0]["id"], "p1")
        self.assertEqual(normalizada["paginas"][0]["nombre"], "Resumen")
        tarjeta = normalizada["paginas"][0]["tarjetas"][0]
        self.assertEqual(tarjeta["id"], "t1")
        self.assertEqual(tarjeta["titulo"], "Nota")
        self.assertEqual(tarjeta["opciones"]["nota"], "Texto de la nota")

    def test_rechaza_una_configuracion_que_no_es_objeto(self):
        self.assertIn("no es válida", self._error([]))

    def test_rechaza_un_esquema_desconocido(self):
        self.assertIn("esquema", self._error({**_conf(), "esquema": 2}))
        self.assertIn("esquema", self._error({**_conf(), "esquema": True}))

    def test_rechaza_filtros_invalidos(self):
        self.assertIn("periodo", self._error({**_conf(), "filtros": {"periodo": "1a"}}))
        self.assertIn("variable", self._error({**_conf(), "filtros": {"variable": "OTRA"}}))
        self.assertIn(
            "«areas» no existe",
            self._error({**_conf(), "filtros": {"areas": [1]}}),
        )

    def test_completa_los_filtros_por_omision(self):
        normalizada = catalogo.validar_conf({**_conf(), "filtros": {}})

        self.assertEqual(
            normalizada["filtros"],
            {"periodo": catalogo.PERIODO_POR_OMISION, "variable": catalogo.VARIABLE_POR_OMISION},
        )

    def test_exige_al_menos_una_pagina(self):
        self.assertIn("al menos una página", self._error({**_conf(), "paginas": []}))
        self.assertIn("al menos una página", self._error({**_conf(), "paginas": None}))

    def test_rechaza_mas_de_ocho_paginas(self):
        paginas = [_pagina(indice) for indice in range(1, 10)]
        self.assertIn("más de 8 páginas", self._error(_conf(paginas=paginas)))

    def test_rechaza_mas_de_doce_tarjetas_en_una_pagina(self):
        tarjetas = [_tarjeta_base(id=f"t{indice}") for indice in range(13)]
        self.assertIn("más de 12 tarjetas", self._error(_conf(*tarjetas)))

    def test_rechaza_un_tipo_desconocido(self):
        self.assertIn("«grafica» no existe", self._error(_conf(_tarjeta_base(tipo="grafica"))))

    def test_rechaza_coordenadas_que_no_son_enteras(self):
        for campo, valor in (("x", "0"), ("y", 1.5), ("w", True), ("h", None)):
            with self.subTest(campo=campo):
                tarjeta = _tarjeta_base(**{campo: valor})
                self.assertIn(f"«{campo}»", self._error(_conf(tarjeta)))

    def test_rechaza_una_tarjeta_fuera_de_la_rejilla(self):
        for x, y, w, h in ((11, 0, 2, 1), (0, 5, 2, 2), (-1, 0, 2, 1), (0, 0, 2, 7)):
            with self.subTest(x=x, y=y, w=w, h=h):
                tarjeta = _tarjeta_base(x=x, y=y, w=w, h=h)
                self.assertIn("se sale de la rejilla", self._error(_conf(tarjeta)))

    def test_rechaza_una_tarjeta_bajo_el_minimo(self):
        for tipo, w, h in (("kpi", 1, 1), ("tendencia", 4, 1), ("dispersion", 4, 2)):
            with self.subTest(tipo=tipo):
                tarjeta = _tarjeta_base(tipo=tipo, w=w, h=h)
                mensaje = self._error(_conf(tarjeta))
                self.assertIn("es más chica que el mínimo de", mensaje)
                self.assertIn('Página "Resumen"', mensaje)
                self.assertIn('tarjeta "Cumplimiento"', mensaje)

    def test_rechaza_dos_tarjetas_encimadas(self):
        una = _tarjeta_base(id="t1", titulo="Primera")
        otra = _tarjeta_base(id="t2", titulo="Segunda", x=1)
        mensaje = self._error(_conf(una, otra))

        self.assertIn("se encima", mensaje)
        self.assertIn('tarjeta "Segunda"', mensaje)
        self.assertIn('"Primera"', mensaje)

    def test_rechaza_un_titulo_largo(self):
        self.assertIn(
            "no puede pasar de 60 caracteres",
            self._error(_conf(_tarjeta_base(titulo="x" * 61))),
        )

    def test_rechaza_un_nombre_de_pagina_largo(self):
        pagina = _pagina(1)
        pagina["nombre"] = "x" * 31
        self.assertIn("no puede pasar de 30 caracteres", self._error(_conf(paginas=[pagina])))

    def test_rechaza_ids_de_tarjeta_repetidos_entre_paginas(self):
        paginas = [
            _pagina(1, [_tarjeta_base()]),
            _pagina(2, [_tarjeta_base()]),
        ]
        self.assertIn(
            "identificador de la tarjeta ya está usado",
            self._error(_conf(paginas=paginas)),
        )

    def test_rechaza_ids_de_pagina_repetidos(self):
        paginas = [_pagina(1), {**_pagina(2), "id": "p1"}]
        self.assertIn(
            "identificador de la página ya está usado",
            self._error(_conf(paginas=paginas)),
        )

    def test_rechaza_ids_invalidos(self):
        self.assertIn("identificador de la tarjeta", self._error(_conf(_tarjeta_base(id=""))))
        self.assertIn("identificador de la tarjeta", self._error(_conf(_tarjeta_base(id="x" * 33))))
        pagina = {**_pagina(1), "id": ""}
        self.assertIn("identificador de la página", self._error(_conf(paginas=[pagina])))

    def test_rechaza_una_opcion_inexistente(self):
        mensaje = self._error(_conf(_tarjeta_base(opciones={"inventada": 1})))

        self.assertIn('Página "Resumen"', mensaje)
        self.assertIn('tarjeta "Cumplimiento"', mensaje)
        self.assertIn("«inventada» no existe", mensaje)

    def test_rechaza_un_valor_de_opcion_invalido(self):
        mensaje = self._error(_conf(_tarjeta_base(opciones={"indicador": "promedio_maximo"})))

        self.assertIn('tarjeta "Cumplimiento"', mensaje)
        self.assertIn("«indicador»", mensaje)
        self.assertIn("promedio_maximo", mensaje)

    def test_rechaza_opciones_que_no_son_objeto(self):
        self.assertIn(
            "opciones deben ser un objeto",
            self._error(_conf(_tarjeta_base(opciones=[]))),
        )

    def test_normaliza_la_meta(self):
        tarjeta = _tarjeta_base(meta={"valor": 95, "sentido": "mayor"})
        normalizada = catalogo.validar_conf(_conf(tarjeta))
        self.assertEqual(
            normalizada["paginas"][0]["tarjetas"][0]["meta"],
            {"valor": 95, "sentido": "mayor", "tolerancia": 5},
        )

        tarjeta = _tarjeta_base(meta={"valor": 30.5, "sentido": "menor", "tolerancia": 0})
        normalizada = catalogo.validar_conf(_conf(tarjeta))
        self.assertEqual(
            normalizada["paginas"][0]["tarjetas"][0]["meta"],
            {"valor": 30.5, "sentido": "menor", "tolerancia": 0},
        )

    def test_una_meta_vacia_se_omite(self):
        normalizada = catalogo.validar_conf(_conf(_tarjeta_base(meta={})))

        self.assertNotIn("meta", normalizada["paginas"][0]["tarjetas"][0])

    def test_rechaza_meta_en_un_tipo_que_no_la_admite(self):
        tarjeta = _tarjeta_base(
            tipo="texto",
            titulo="Nota",
            meta={"valor": 1, "sentido": "mayor"},
        )
        self.assertIn("no admite meta", self._error(_conf(tarjeta)))

    def test_rechaza_metas_invalidas(self):
        casos = [
            ({"sentido": "mayor"}, "valor numérico"),
            ({"valor": True, "sentido": "mayor"}, "valor numérico"),
            ({"valor": 95, "sentido": "arriba"}, "sentido"),
            ({"valor": 95, "sentido": "mayor", "tolerancia": 51}, "tolerancia"),
            ({"valor": 95, "sentido": "mayor", "tolerancia": -1}, "tolerancia"),
            ({"valor": 95, "sentido": "mayor", "tolerancia": "5"}, "tolerancia"),
        ]
        for meta, esperado in casos:
            with self.subTest(meta=meta):
                self.assertIn(esperado, self._error(_conf(_tarjeta_base(meta=meta))))

    def test_meta_sugerida(self):
        self.assertEqual(
            catalogo.meta_sugerida("kpi", {"indicador": "cumplimiento"}),
            {"valor": 95, "sentido": "mayor", "tolerancia": 5},
        )
        self.assertEqual(
            catalogo.meta_sugerida("kpi", {"indicador": "alertas"}),
            {"valor": 10, "sentido": "menor", "tolerancia": 5},
        )
        self.assertEqual(
            catalogo.meta_sugerida("medidor", {"indicador": "disponibilidad"}),
            {"valor": 98, "sentido": "mayor", "tolerancia": 5},
        )
        self.assertEqual(
            catalogo.meta_sugerida("tiempo_atencion"),
            {"valor": 30, "sentido": "menor", "tolerancia": 5},
        )
        self.assertIsNone(catalogo.meta_sugerida("kpi", {"indicador": "lecturas"}))
        self.assertIsNone(catalogo.meta_sugerida("tendencia"))
        self.assertIsNone(catalogo.meta_sugerida("texto"))

    def test_la_configuracion_vacia_es_valida(self):
        normalizada = catalogo.validar_conf(catalogo.conf_vacia())

        self.assertEqual(normalizada["esquema"], 1)
        self.assertEqual(normalizada["paginas"][0]["tarjetas"], [])


class CatalogoJsTests(PruebaBase):
    """El catálogo del backend y el de la web deben ofrecer lo mismo."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.js = RUTA_CATALOGO_JS.read_text(encoding="utf-8")

    def _bloque(self, nombre, cierre):
        inicio = self.js.index(f"export const {nombre} = ")
        fin = self.js.index(cierre, inicio)
        return self.js[inicio:fin]

    def test_coinciden_los_tipos_y_sus_opciones(self):
        bloque = self._bloque("TIPOS", "\n}\n")
        tipos = re.findall(r"(?m)^  ([a-z_]+): \{", bloque)
        self.assertEqual(tipos, list(catalogo.TIPOS))
        cuerpos = {
            coincidencia.group(1): coincidencia.group(2)
            for coincidencia in re.finditer(r"(?ms)^  ([a-z_]+): \{\n(.*?)^  \},", bloque)
        }
        for tipo, definicion in catalogo.TIPOS.items():
            with self.subTest(tipo=tipo):
                cuerpo = cuerpos[tipo]
                opciones = re.findall(r"clave: '([a-z_]+)'", cuerpo)
                self.assertEqual(opciones, [o["clave"] for o in definicion["opciones"]])
                for linea in cuerpo.splitlines():
                    if "clave:" not in linea or "valores:" not in linea:
                        continue
                    clave = re.search(r"clave: '([a-z_]+)'", linea).group(1)
                    pares = re.findall(
                        r"\[\s*(?:'([^']*)'|(\d+))\s*,\s*'[^']*'\]",
                        linea,
                    )
                    valores = [
                        segundo if segundo else primero
                        for primero, segundo in pares
                    ]
                    esperados = [
                        str(valor)
                        for opcion in definicion["opciones"]
                        if opcion["clave"] == clave
                        for valor in opcion["valores"]
                    ]
                    self.assertEqual(valores, esperados, f"valores de «{clave}» en «{tipo}»")

    def test_coinciden_las_familias(self):
        bloque = self._bloque("FAMILIAS", "\n]\n")
        ids = re.findall(r"\{ id: '([a-z_]+)'", bloque)
        self.assertEqual(ids, [familia["id"] for familia in catalogo.FAMILIAS])

    def test_coinciden_los_periodos_y_las_variables(self):
        periodos = re.findall(r"\['([^']*)'", self._bloque("PERIODOS", "\n]\n"))
        variables = re.findall(r"\['([^']*)'", self._bloque("VARIABLES", "\n]\n"))
        self.assertEqual(periodos, list(catalogo.PERIODOS))
        self.assertEqual(variables, list(catalogo.VARIABLES))


class PlantillasTests(PruebaBase):
    def setUp(self):
        self.plantillas = {
            tablero.plantilla: tablero
            for tablero in TableroAnalitica.objects.filter(organizacion__isnull=True)
        }

    def _version(self, plantilla):
        return self.plantillas[plantilla].version_actual()

    def test_existen_las_cuatro_plantillas_con_su_version_uno(self):
        self.assertEqual(
            set(self.plantillas),
            {
                TableroAnalitica.Plantilla.EJECUTIVO,
                TableroAnalitica.Plantilla.AMBIENTAL,
                TableroAnalitica.Plantilla.ALERTAS,
                TableroAnalitica.Plantilla.OPERACION,
            },
        )
        for tablero in self.plantillas.values():
            with self.subTest(plantilla=tablero.plantilla):
                self.assertTrue(tablero.activo)
                self.assertFalse(tablero.predeterminado)
                self.assertFalse(tablero.descripcion == "")
                version = tablero.version_actual()
                self.assertIsNotNone(version)
                self.assertEqual(version.numero, 1)
                self.assertEqual(catalogo.validar_conf(version.conf), version.conf)

    def test_las_paginas_llenan_las_seis_filas(self):
        for plantilla, tablero in self.plantillas.items():
            for pagina in tablero.version_actual().conf["paginas"]:
                with self.subTest(plantilla=plantilla, pagina=pagina["nombre"]):
                    self.assertTrue(pagina["tarjetas"])
                    filas = set()
                    for tarjeta in pagina["tarjetas"]:
                        filas.update(range(tarjeta["y"], tarjeta["y"] + tarjeta["h"]))
                    self.assertEqual(filas, set(range(6)))

    def test_ejecutivo(self):
        conf = self._version("EJECUTIVO").conf
        self.assertEqual(conf["filtros"], {"periodo": "30d", "variable": "TEMP"})
        self.assertEqual([p["nombre"] for p in conf["paginas"]], ["Resumen", "Tendencias"])

        resumen = conf["paginas"][0]["tarjetas"]
        kpis = [
            (t["x"], t["w"], t["opciones"]["indicador"])
            for t in resumen
            if t["tipo"] == "kpi"
        ]
        self.assertEqual(
            kpis,
            [
                (0, 3, "cumplimiento"),
                (3, 2, "disponibilidad"),
                (5, 2, "alertas"),
                (7, 2, "tiempo_atencion"),
                (9, 3, "dispositivos_en_linea"),
            ],
        )
        self.assertTrue(all(t["y"] == 0 and t["h"] == 1 for t in resumen if t["tipo"] == "kpi"))
        tendencia = next(t for t in resumen if t["tipo"] == "tendencia")
        self.assertEqual(_caja(tendencia), (0, 1, 8, 3))
        self.assertEqual(tendencia["opciones"]["variable"], "TEMP")
        self.assertEqual(tendencia["opciones"]["agrupar"], "area")
        dona = next(t for t in resumen if t["tipo"] == "alertas_dona")
        self.assertEqual(_caja(dona), (8, 1, 4, 3))
        barras = next(t for t in resumen if t["tipo"] == "barras")
        self.assertEqual(_caja(barras), (0, 4, 6, 2))
        self.assertEqual(barras["opciones"]["metrica"], "cumplimiento")
        ranking = next(t for t in resumen if t["tipo"] == "ranking")
        self.assertEqual(_caja(ranking), (6, 4, 6, 2))
        self.assertEqual(ranking["opciones"]["sentido"], "peores")

        tendencias = conf["paginas"][1]["tarjetas"]
        self.assertEqual(
            [(t["y"], t["opciones"]["variable"]) for t in tendencias],
            [(0, "TEMP"), (2, "HUM"), (4, "AIRE")],
        )
        self.assertTrue(
            all(t["tipo"] == "tendencia" and t["w"] == 12 and t["h"] == 2 for t in tendencias)
        )

    def test_ambiental(self):
        conf = self._version("AMBIENTAL").conf
        self.assertEqual(conf["filtros"], {"periodo": "7d", "variable": "TEMP"})
        self.assertEqual(
            [p["nombre"] for p in conf["paginas"]],
            ["Temperatura", "Humedad", "Calidad del aire", "Relación"],
        )
        for pagina, variable in zip(
            conf["paginas"][:3],
            ("TEMP", "HUM", "AIRE"),
            strict=False,
        ):
            with self.subTest(pagina=pagina["nombre"]):
                tarjetas = pagina["tarjetas"]
                self.assertEqual(len(tarjetas), 8)
                kpis = [t for t in tarjetas if t["tipo"] == "kpi"]
                self.assertEqual(
                    [(t["x"], t["w"], t["opciones"]["indicador"]) for t in kpis],
                    [
                        (0, 3, "promedio"),
                        (3, 3, "minimo"),
                        (6, 3, "maximo"),
                        (9, 3, "cumplimiento"),
                    ],
                )
                self.assertTrue(all(t["opciones"]["variable"] == variable for t in kpis))
                tendencia = next(t for t in tarjetas if t["tipo"] == "tendencia")
                self.assertEqual(_caja(tendencia), (0, 1, 8, 3))
                self.assertTrue(tendencia["opciones"]["umbrales"])
                histograma = next(t for t in tarjetas if t["tipo"] == "histograma")
                self.assertEqual(_caja(histograma), (8, 1, 4, 3))
                mapa = next(t for t in tarjetas if t["tipo"] == "mapa_calor")
                self.assertEqual(_caja(mapa), (0, 4, 6, 2))
                matriz = next(t for t in tarjetas if t["tipo"] == "matriz")
                self.assertEqual(_caja(matriz), (6, 4, 6, 2))
                self.assertEqual(matriz["opciones"], {"filas": "area", "valor": "promedio"})

        relacion = conf["paginas"][3]["tarjetas"]
        dispersion = next(t for t in relacion if t["tipo"] == "dispersion")
        self.assertEqual(_caja(dispersion), (0, 0, 8, 6))
        self.assertEqual(dispersion["opciones"], {"x": "TEMP", "y": "HUM"})
        texto = next(t for t in relacion if t["tipo"] == "texto")
        self.assertEqual(_caja(texto), (8, 0, 4, 6))
        self.assertLessEqual(len(texto["opciones"]["nota"]), catalogo.NOTA_MAX)

    def test_alertas(self):
        conf = self._version("ALERTAS").conf
        self.assertEqual(conf["filtros"], {"periodo": "30d", "variable": "TEMP"})
        self.assertEqual([p["nombre"] for p in conf["paginas"]], ["Alertas"])
        tarjetas = conf["paginas"][0]["tarjetas"]
        self.assertEqual(len(tarjetas), 8)
        kpis = [
            (t["x"], t["w"], t["opciones"]["indicador"])
            for t in tarjetas
            if t["tipo"] == "kpi"
        ]
        self.assertEqual(
            kpis,
            [
                (0, 4, "alertas"),
                (4, 4, "alertas_pendientes"),
                (8, 4, "tiempo_atencion"),
            ],
        )
        apiladas = next(t for t in tarjetas if t["tipo"] == "barras_apiladas")
        self.assertEqual(apiladas["opciones"]["serie"], "alertas_estado")
        self.assertEqual(_caja(apiladas), (0, 1, 8, 3))
        dona = next(t for t in tarjetas if t["tipo"] == "alertas_dona")
        self.assertEqual(dona["opciones"]["por"], "nivel")
        self.assertEqual(_caja(dona), (8, 1, 4, 3))
        tiempo = next(t for t in tarjetas if t["tipo"] == "tiempo_atencion")
        self.assertEqual(_caja(tiempo), (0, 4, 4, 2))
        self.assertEqual(tiempo["meta"]["valor"], 30)
        ranking = next(t for t in tarjetas if t["tipo"] == "ranking")
        self.assertEqual(_caja(ranking), (4, 4, 4, 2))
        self.assertEqual(ranking["opciones"]["metrica"], "alertas")
        mapa = next(t for t in tarjetas if t["tipo"] == "mapa_calor")
        self.assertEqual(_caja(mapa), (8, 4, 4, 2))
        self.assertTrue(mapa["opciones"]["alertas"])

    def test_operacion(self):
        conf = self._version("OPERACION").conf
        self.assertEqual(conf["filtros"], {"periodo": "7d", "variable": "TEMP"})
        self.assertEqual([p["nombre"] for p in conf["paginas"]], ["Operación"])
        tarjetas = conf["paginas"][0]["tarjetas"]
        self.assertEqual(len(tarjetas), 6)
        kpis = [
            (t["x"], t["w"], t["opciones"]["indicador"])
            for t in tarjetas
            if t["tipo"] == "kpi"
        ]
        self.assertEqual(
            kpis,
            [(0, 4, "dispositivos_en_linea"), (4, 4, "disponibilidad"), (8, 4, "lecturas")],
        )
        disponibilidad = next(t for t in tarjetas if t["tipo"] == "disponibilidad")
        self.assertEqual(_caja(disponibilidad), (0, 1, 8, 5))
        medidor = next(t for t in tarjetas if t["tipo"] == "medidor")
        self.assertEqual(_caja(medidor), (8, 1, 4, 2))
        apiladas = next(t for t in tarjetas if t["tipo"] == "barras_apiladas")
        self.assertEqual(_caja(apiladas), (8, 3, 4, 3))
        self.assertEqual(apiladas["opciones"]["serie"], "lecturas_rango")

    def test_la_migracion_no_crea_copias_en_organizaciones(self):
        copias = VersionTablero.objects.filter(
            numero=1,
            tablero__organizacion__isnull=False,
        )
        self.assertFalse(copias.exists())


class TableroAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.admin = cliente_de(self.e.admin)

    def _crear(self, nombre="Propio", **extra):
        r = self.admin.post(
            "/api/v1/tableros-analitica/",
            {"nombre": nombre, **extra},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def _plantilla(self, nombre="Ejecutivo"):
        return TableroAnalitica.objects.get(organizacion__isnull=True, nombre=nombre)

    def test_crea_lee_edita_versiones_y_restaura(self):
        tablero = self._crear()
        self.assertEqual(tablero["version"], 1)
        self.assertEqual(tablero["conf"], catalogo.conf_vacia())
        self.assertFalse(tablero["es_plantilla"])

        r = self.admin.get(f"/api/v1/tableros-analitica/{tablero['num']}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["nombre"], "Propio")

        conf_dos = catalogo.conf_vacia()
        conf_dos["filtros"] = {"periodo": "30d", "variable": "HUM"}
        r = self.admin.patch(
            f"/api/v1/tableros-analitica/{tablero['num']}/",
            {"conf": conf_dos},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["version"], 2)
        self.assertEqual(r.json()["conf"], conf_dos)

        r = self.admin.patch(
            f"/api/v1/tableros-analitica/{tablero['num']}/",
            {"nombre": "Renombrado"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["version"], 2)

        r = self.admin.get(f"/api/v1/tableros-analitica/{tablero['num']}/versiones/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual([v["numero"] for v in r.json()], [1, 2])

        r = self.admin.post(
            f"/api/v1/tableros-analitica/{tablero['num']}/restaurar/",
            {"numero": 1},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["version"], 3)
        self.assertEqual(r.json()["conf"], catalogo.conf_vacia())

        r = self.admin.post(
            f"/api/v1/tableros-analitica/{tablero['num']}/predeterminar/",
            {},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["predeterminado"])

        r = self.admin.delete(f"/api/v1/tableros-analitica/{tablero['num']}/")
        self.assertEqual(r.status_code, 204)
        self.assertNotIn(
            tablero["num"],
            [t["num"] for t in self.admin.get("/api/v1/tableros-analitica/").json()["results"]],
        )
        con_archivados = self.admin.get("/api/v1/tableros-analitica/?archivados=1").json()
        self.assertIn(tablero["num"], [t["num"] for t in con_archivados["results"]])

    def test_crea_desde_una_plantilla_y_la_copia(self):
        plantilla = self._plantilla()
        r = self.admin.post(
            "/api/v1/tableros-analitica/",
            {"desde": plantilla.num},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        copia = r.json()
        self.assertEqual(copia["nombre"], "Copia de Ejecutivo")
        self.assertEqual(copia["conf"], plantilla.version_actual().conf)
        self.assertEqual(copia["descripcion"], plantilla.descripcion)
        self.assertEqual(copia["version"], 1)
        self.assertFalse(copia["es_plantilla"])

        r = self.admin.post(
            "/api/v1/tableros-analitica/",
            {"desde": plantilla.num},
            format="json",
        )
        self.assertEqual(r.json()["nombre"], "Copia de Ejecutivo (2)")

    def test_las_plantillas_no_se_editan_ni_se_archivan(self):
        plantilla = self._plantilla()
        url = f"/api/v1/tableros-analitica/{plantilla.num}/"

        self.assertEqual(self.admin.get(url).status_code, 200)
        self.assertEqual(
            self.admin.patch(url, {"nombre": "Otra"}, format="json").status_code,
            403,
        )
        self.assertEqual(self.admin.delete(url).status_code, 403)
        self.assertEqual(
            self.admin.post(f"{url}predeterminar/", {}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.admin.post(f"{url}restaurar/", {"numero": 1}, format="json").status_code,
            403,
        )

    def test_rechaza_una_configuracion_invalida(self):
        r = self.admin.post(
            "/api/v1/tableros-analitica/",
            {"nombre": "Mala", "conf": {"esquema": 1, "paginas": []}},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("conf", r.json())
        self.assertIn("al menos una página", " ".join(r.json()["conf"]))

    def test_rechaza_un_nombre_repetido(self):
        self._crear("Repetido")
        r = self.admin.post(
            "/api/v1/tableros-analitica/",
            {"nombre": "Repetido"},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("nombre", r.json())

    def test_no_ve_los_tableros_de_otra_organizacion(self):
        otro = Escenario("b")
        ajeno = TableroAnalitica.objects.create(
            organizacion=otro.organizacion,
            nombre="Ajeno",
        )
        VersionTablero.objects.create(tablero=ajeno, numero=1, conf=catalogo.conf_vacia())

        self.assertEqual(
            self.admin.get(f"/api/v1/tableros-analitica/{ajeno.num}/").status_code,
            404,
        )
        self.assertEqual(
            self.admin.post(
                "/api/v1/tableros-analitica/",
                {"desde": ajeno.num},
                format="json",
            ).status_code,
            404,
        )
        visibles = self.admin.get("/api/v1/tableros-analitica/").json()["results"]
        self.assertNotIn(ajeno.num, [t["num"] for t in visibles])


class ValidarConfCasosLimiteTests(PruebaBase):
    def _error(self, conf):
        with self.assertRaises(ValidationError) as contexto:
            catalogo.validar_conf(conf)
        return " ".join(contexto.exception.messages)

    def test_rechaza_una_pagina_que_no_es_objeto(self):
        self.assertIn("la página debe ser un objeto", self._error(_conf(paginas=["p1"])))

    def test_rechaza_tarjetas_que_no_son_lista(self):
        pagina = {**_pagina(1), "tarjetas": {}}
        self.assertIn(
            "tarjetas de la página deben ser una lista",
            self._error(_conf(paginas=[pagina])),
        )

    def test_rechaza_una_pagina_sin_nombre(self):
        pagina = {**_pagina(1), "nombre": "   "}
        self.assertIn("necesita un nombre", self._error(_conf(paginas=[pagina])))

    def test_rechaza_una_tarjeta_que_no_es_objeto(self):
        self.assertIn("la tarjeta debe ser un objeto", self._error(_conf("tarjeta")))

    def test_rechaza_una_tarjeta_sin_tipo(self):
        tarjeta = _tarjeta_base()
        tarjeta.pop("tipo")
        self.assertIn("falta el tipo de tarjeta", self._error(_conf(tarjeta)))

    def test_rechaza_un_titulo_que_no_es_texto(self):
        self.assertIn(
            "título de la tarjeta debe ser texto",
            self._error(_conf(_tarjeta_base(titulo=5))),
        )

    def test_rechaza_valores_de_opciones_de_otro_tipo(self):
        casos = [
            (_tarjeta_base(opciones={"comparar": "sí"}), "verdadero o falso"),
            (
                _tarjeta_base(tipo="barras", w=3, h=2, opciones={"limite": 4}),
                "entre 5 y 20",
            ),
            (
                _tarjeta_base(tipo="barras", w=3, h=2, opciones={"limite": True}),
                "entre 5 y 20",
            ),
            (
                _tarjeta_base(tipo="barras", w=3, h=2, opciones={"limite": "10"}),
                "entre 5 y 20",
            ),
            (
                _tarjeta_base(tipo="texto", titulo="Nota", opciones={"nota": "x" * 201}),
                "no puede pasar de 200 caracteres",
            ),
        ]
        for tarjeta, esperado in casos:
            with self.subTest(tarjeta=tarjeta["tipo"]):
                self.assertIn(esperado, self._error(_conf(tarjeta)))

    def test_rechaza_una_meta_que_no_es_objeto(self):
        self.assertIn("la meta debe ser un objeto", self._error(_conf(_tarjeta_base(meta=[]))))

    def test_rechaza_ids_repetidos_en_la_misma_pagina(self):
        una = _tarjeta_base(id="t1", x=0)
        otra = _tarjeta_base(id="t1", x=2)
        self.assertIn(
            "identificador de la tarjeta ya está usado",
            self._error(_conf(una, otra)),
        )


class PermisosTableroAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.analista = cliente_de(self.e.analista)
        self.tablero = TableroAnalitica.objects.create(
            organizacion=self.e.organizacion,
            nombre="Compartido",
            creado_por=self.e.admin,
        )
        VersionTablero.objects.create(
            tablero=self.tablero,
            numero=1,
            conf=catalogo.conf_vacia(),
            creada_por=self.e.admin,
        )
        self.url = f"/api/v1/tableros-analitica/{self.tablero.num}/"

    def test_operador_y_plataforma_no_ven_ni_crean(self):
        for usuario in (self.e.operador, self.e.plataforma):
            with self.subTest(usuario=usuario.correo):
                cliente = cliente_de(usuario)
                self.assertEqual(cliente.get("/api/v1/tableros-analitica/").status_code, 403)
                self.assertEqual(self._crear(cliente).status_code, 403)
                self.assertEqual(cliente.get(self.url).status_code, 403)

    def _crear(self, cliente, nombre="Nuevo"):
        return cliente.post(
            "/api/v1/tableros-analitica/",
            {"nombre": nombre},
            format="json",
        )

    def test_analista_lee_pero_no_escribe(self):
        r = self.analista.get("/api/v1/tableros-analitica/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any(t["es_plantilla"] for t in r.json()["results"]))
        self.assertEqual(self.analista.get(self.url).status_code, 200)
        self.assertEqual(self.analista.get(f"{self.url}versiones/").status_code, 200)
        self.assertEqual(self._crear(self.analista).status_code, 403)
        self.assertEqual(
            self.analista.patch(
                self.url,
                {"nombre": "Cambiado"},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(self.analista.delete(self.url).status_code, 403)
        self.assertEqual(
            self.analista.post(f"{self.url}predeterminar/", {}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.analista.post(
                f"{self.url}restaurar/",
                {"numero": 1},
                format="json",
            ).status_code,
            403,
        )

    def test_admin_y_super_escriben(self):
        for usuario in (self.e.admin, self.e.supervisor):
            with self.subTest(usuario=usuario.correo):
                cliente = cliente_de(usuario)
                r = self._crear(cliente, f"De {usuario.rol_id}")
                self.assertEqual(r.status_code, 201, r.content)
                num = r.json()["num"]
                r = cliente.patch(
                    f"/api/v1/tableros-analitica/{num}/",
                    {"conf": catalogo.conf_vacia()},
                    format="json",
                )
                self.assertEqual(r.status_code, 200, r.content)
                self.assertEqual(r.json()["version"], 2)
                r = cliente.post(
                    f"/api/v1/tableros-analitica/{num}/restaurar/",
                    {"numero": 1},
                    format="json",
                )
                self.assertEqual(r.status_code, 200, r.content)
                self.assertEqual(r.json()["version"], 3)
                r = cliente.post(
                    f"/api/v1/tableros-analitica/{num}/predeterminar/",
                    {},
                    format="json",
                )
                self.assertEqual(r.status_code, 200, r.content)
                self.assertTrue(r.json()["predeterminado"])


class TableroAPIAccionesTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.admin = cliente_de(self.e.admin)

    def _crear(self, nombre):
        r = self.admin.post(
            "/api/v1/tableros-analitica/",
            {"nombre": nombre},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_solo_hay_un_predeterminado(self):
        uno = self._crear("Uno")
        dos = self._crear("Dos")

        self.admin.post(
            f"/api/v1/tableros-analitica/{uno['num']}/predeterminar/",
            {},
            format="json",
        )
        self.admin.post(
            f"/api/v1/tableros-analitica/{dos['num']}/predeterminar/",
            {},
            format="json",
        )

        self.assertFalse(TableroAnalitica.objects.get(pk=uno["num"]).predeterminado)
        self.assertTrue(TableroAnalitica.objects.get(pk=dos["num"]).predeterminado)
        self.assertEqual(
            TableroAnalitica.objects.filter(
                organizacion=self.e.organizacion,
                predeterminado=True,
            ).count(),
            1,
        )

    def test_el_nombre_es_unico_al_renombrar(self):
        uno = self._crear("Uno")
        dos = self._crear("Dos")

        r = self.admin.patch(
            f"/api/v1/tableros-analitica/{dos['num']}/",
            {"nombre": "Uno"},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("nombre", r.json())

        r = self.admin.patch(
            f"/api/v1/tableros-analitica/{dos['num']}/",
            {"nombre": "Dos"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(TableroAnalitica.objects.get(pk=dos["num"]).nombre, "Dos")
        self.assertEqual(TableroAnalitica.objects.get(pk=uno["num"]).version_actual().numero, 1)

    def test_se_reusa_el_nombre_de_un_tablero_archivado(self):
        tablero = self._crear("Reusa")
        self.admin.delete(f"/api/v1/tableros-analitica/{tablero['num']}/")
        nuevo = self._crear("Reusa")

        self.assertNotEqual(nuevo["num"], tablero["num"])
        self.assertTrue(TableroAnalitica.objects.filter(pk=nuevo["num"], activo=True).exists())

    def test_restaurar_una_version_inexistente(self):
        tablero = self._crear("Con historial")
        r = self.admin.post(
            f"/api/v1/tableros-analitica/{tablero['num']}/restaurar/",
            {"numero": 99},
            format="json",
        )
        self.assertEqual(r.status_code, 404)

    def test_actualiza_la_descripcion_sin_crear_version(self):
        tablero = self._crear("Con descripción")
        r = self.admin.patch(
            f"/api/v1/tableros-analitica/{tablero['num']}/",
            {"descripcion": "  Una nota  "},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["descripcion"], "Una nota")
        self.assertEqual(r.json()["version"], 1)

        r = self.admin.patch(
            f"/api/v1/tableros-analitica/{tablero['num']}/",
            {"descripcion": "x" * 201},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.content)

    def test_crear_exige_nombre_si_no_viene_de_otro_tablero(self):
        r = self.admin.post("/api/v1/tableros-analitica/", {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("nombre", r.json())

        r = self.admin.patch(
            f"/api/v1/tableros-analitica/{self._crear('Con nombre')['num']}/",
            {"nombre": "   "},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.content)

    def test_crear_desde_una_plantilla_con_nombre_propio(self):
        plantilla = TableroAnalitica.objects.get(
            organizacion__isnull=True,
            plantilla=TableroAnalitica.Plantilla.AMBIENTAL,
        )
        r = self.admin.post(
            "/api/v1/tableros-analitica/",
            {"desde": plantilla.num, "nombre": "Mi ambiental"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["nombre"], "Mi ambiental")
        self.assertEqual(r.json()["conf"], plantilla.version_actual().conf)
        self.assertEqual(r.json()["descripcion"], plantilla.descripcion)

    def test_el_supervisor_aislado_no_ve_otra_organizacion(self):
        otro = Escenario("b")
        ajeno = TableroAnalitica.objects.create(
            organizacion=otro.organizacion,
            nombre="Ajeno del super",
        )
        VersionTablero.objects.create(tablero=ajeno, numero=1, conf=catalogo.conf_vacia())
        cliente = cliente_de(self.e.supervisor)

        self.assertEqual(
            cliente.get(f"/api/v1/tableros-analitica/{ajeno.num}/").status_code,
            404,
        )
        self.assertEqual(
            cliente.patch(
                f"/api/v1/tableros-analitica/{ajeno.num}/",
                {"nombre": "Robado"},
                format="json",
            ).status_code,
            404,
        )
