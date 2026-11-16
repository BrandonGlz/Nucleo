from django.core import mail
from django.core.cache import cache
from django.test import override_settings

from apps.reportes import aprendizaje
from apps.reportes.models import PreguntaAgente, RespuestaAprendida
from common.testing import Escenario, PruebaBase, cliente_de

from . import avisos, configuracion, conocimiento
from .models import DocumentoNico


class ConsolaNicoTests(PruebaBase):
    def setUp(self):
        cache.clear()
        self.e = Escenario()
        self.otra = Escenario("b")
        self.su = cliente_de(self.e.plataforma)
        self.disp = self.e.dispositivo

    def chat(self, pregunta):
        r = self.su.post("/api/v1/nico/chat/", {"pregunta": pregunta, "dispositivo": self.disp.num})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_solo_superusuario(self):
        for usuario in (self.e.admin, self.e.supervisor, self.e.operador):
            cliente = cliente_de(usuario)
            for ruta in ("arbol/", "banco/", "registro/", "herramientas/", "documentos/"):
                self.assertEqual(cliente.get(f"/api/v1/nico/{ruta}").status_code, 403, ruta)
        r = cliente_de(self.e.admin).post(
            "/api/v1/nico/chat/", {"pregunta": "hola", "dispositivo": self.disp.num}
        )
        self.assertEqual(r.status_code, 403)

    def test_arbol_con_todas_las_empresas(self):
        datos = self.su.get("/api/v1/nico/arbol/").json()
        nombres = {e["nombre"] for e in datos["empresas"]}
        self.assertEqual(nombres, {self.e.organizacion.nombre, self.otra.organizacion.nombre})
        disp = datos["empresas"][0]["areas"][0]["dispositivos"][0]
        self.assertIn("activo", disp)

    def test_chat_con_dispositivo_de_cualquier_empresa(self):
        for disp in (self.e.dispositivo, self.otra.dispositivo):
            self.disp = disp
            r = self.chat("¿cuál es el límite de temperatura?")
            self.assertTrue(r["texto"])
        registros = PreguntaAgente.objects.filter(usuario=self.e.plataforma)
        self.assertEqual(registros.count(), 2)
        # El superusuario sigue siendo de plataforma: no se guardó con otra organización.
        self.e.plataforma.refresh_from_db()
        self.assertIsNone(self.e.plataforma.organizacion_id)

    def test_respuesta_fija_del_banco(self):
        r = self.su.post(
            "/api/v1/nico/banco/",
            {
                "organizacion": self.e.organizacion.num,
                "pregunta": "¿Quién instaló el sensor?",
                "plantilla": "Lo instaló el equipo de Núcleo en octubre.",
            },
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["tema"], "FIJA")
        respuesta = self.chat("quien instalo el sensor")
        self.assertEqual(respuesta["texto"], "Lo instaló el equipo de Núcleo en octubre.")
        self.assertEqual(respuesta["via"], "BANCO")
        # Otra empresa no la ve.
        self.disp = self.otra.dispositivo
        self.assertNotIn("equipo de Núcleo", self.chat("quien instalo el sensor")["texto"])
        # Repetida en la misma empresa: no se permite.
        r = self.su.post(
            "/api/v1/nico/banco/",
            {
                "organizacion": self.e.organizacion.num,
                "pregunta": "quien instalo el sensor",
                "plantilla": "Otra",
            },
        )
        self.assertEqual(r.status_code, 400)

    def test_respuesta_fija_gana_a_la_charla(self):
        # «¿quién te creó?» tiene respuesta de identidad; la fija de la consola manda.
        self.su.post(
            "/api/v1/nico/banco/",
            {
                "organizacion": self.e.organizacion.num,
                "pregunta": "¿Quién te creó?",
                "plantilla": "Me creó el equipo de Núcleo.",
            },
        )
        respuesta = self.chat("quien te creo")
        self.assertEqual(respuesta["texto"], "Me creó el equipo de Núcleo.")
        self.assertEqual(respuesta["via"], "BANCO")

    def test_respuesta_para_todas_las_empresas(self):
        r = self.su.post(
            "/api/v1/nico/banco/",
            {"todas": True, "pregunta": "¿Qué es Núcleo?", "plantilla": "Monitoreo ambiental."},
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(RespuestaAprendida.objects.filter(tema="FIJA").count(), 2)

    def test_herramienta_desactivada(self):
        r = self.su.patch("/api/v1/nico/herramientas/umbrales/", {"activa": False})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()["activa"])
        self.assertEqual(
            self.chat("¿cuál es el límite de temperatura?")["texto"], configuracion.DESACTIVADA
        )
        self.su.patch("/api/v1/nico/herramientas/umbrales/", {"activa": True})
        self.assertNotEqual(
            self.chat("¿cuál es el límite de temperatura?")["texto"], configuracion.DESACTIVADA
        )

    def test_editar_y_restaurar_herramienta(self):
        r = self.su.get("/api/v1/nico/herramientas/").json()
        self.assertIn("lecturas", [p["clave"] for p in r["propositos"]])
        sensores = next(h for h in r["herramientas"] if h["nombre"] == "sensores")
        self.assertEqual(sensores["proposito"], "dispositivo")
        ruta = "/api/v1/nico/herramientas/sensores/"
        r = self.su.patch(ruta, {"proposito": "configuracion"})
        self.assertEqual(r.json()["proposito"], "configuracion")
        self.assertTrue(r.json()["editada"])
        # Solo propósitos de la lista.
        self.assertEqual(self.su.patch(ruta, {"proposito": "otro"}).status_code, 400)
        r = self.su.patch(ruta, {"restaurar": True})
        self.assertFalse(r.json()["editada"])
        self.assertEqual(r.json()["proposito"], "dispositivo")
        self.assertEqual(self.su.patch("/api/v1/nico/herramientas/nada/", {}).status_code, 404)

    def test_respuestas_incluidas(self):
        r = self.su.get("/api/v1/nico/incluidas/").json()
        tipos = {x["tipo"] for x in r}
        self.assertEqual(tipos, {"explicacion", "charla", "capacidades", "consulta"})
        identidad = next(x for x in r if x["tema"] == "identidad")
        self.assertIn("{dispositivo}", identidad["respuesta"])
        self.assertFalse(identidad["personalizada"])
        self.su.post(
            "/api/v1/nico/banco/",
            {"todas": True, "pregunta": "¿Quién eres?", "plantilla": "Soy Nico."},
        )
        r = self.su.get("/api/v1/nico/incluidas/").json()
        self.assertTrue(next(x for x in r if x["tema"] == "identidad")["personalizada"])

    def test_documento_unico_con_secciones(self):
        r = self.su.get("/api/v1/nico/documentos/").json()
        self.assertEqual([d["clave"] for d in r["documentos"]], ["NICO"])
        doc = r["documentos"][0]
        titulos = [t for t, _ in configuracion.secciones(doc["contenido"])]
        self.assertEqual(titulos, [x["titulo"] for x in r["secciones"]])
        # Trae contenido de ejemplo, pero apagado: no va en cada petición a la IA.
        self.assertEqual(r["usados"], 0)
        self.assertEqual(configuracion.instrucciones("Base"), "Base")
        ruta = f"/api/v1/nico/documentos/{doc['num']}/"
        nuevo = doc["contenido"].replace("## Personalidad\n", "## Personalidad\nEres paciente.\n")
        r = self.su.patch(ruta, {"contenido": nuevo, "activo": True})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("Eres paciente.", configuracion.instrucciones("Base"))
        self.assertEqual(configuracion.contexto(), configuracion.CONTEXTO)
        # No se crean ni se borran documentos.
        self.assertEqual(self.su.post("/api/v1/nico/documentos/", {"clave": "X"}).status_code, 405)
        self.assertEqual(self.su.delete(ruta).status_code, 405)

    def test_documento_protegido(self):
        doc = self.su.get("/api/v1/nico/documentos/").json()["documentos"][0]
        ruta = f"/api/v1/nico/documentos/{doc['num']}/"
        sin_memoria = doc["contenido"].split("## Memoria")[0]
        repetida = doc["contenido"] + "\n\n## Memoria\nOtra vez."
        for contenido in ("", "Texto sin secciones", sin_memoria, repetida):
            r = self.su.patch(ruta, {"contenido": contenido})
            self.assertEqual(r.status_code, 400, contenido[:40])
        # Una sección extra sí se puede agregar.
        extra = doc["contenido"] + "\n\n## Preguntas frecuentes\nNico no apaga equipos."
        self.assertEqual(self.su.patch(ruta, {"contenido": extra}).status_code, 200)

    def test_banco_no_tapa_datos_en_vivo(self):
        def fija(pregunta):
            return self.su.post(
                "/api/v1/nico/banco/",
                {"todas": True, "tema": "FIJA", "pregunta": pregunta, "plantilla": "Texto fijo."},
                format="json",
            )

        for pregunta in ("la última medición del aire", "temperatura de ayer", "hubo alertas ayer"):
            self.assertEqual(fija(pregunta).status_code, 400, pregunta)
        # El ejemplo de una herramienta activa tampoco.
        self.assertEqual(fija("¿cómo estuvo la humedad la semana pasada?").status_code, 400)
        self.assertEqual(fija("¿Qué niveles hay?").status_code, 201)
        # Una que reemplaza a una incluida se guarda, y se marca.
        r = fija("¿Quién eres?")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["reemplaza"], "¿Quién eres?")
        # La lectura del momento sigue saliendo de los datos.
        self.assertNotEqual(self.chat("la última medición del aire")["via"], "BANCO")

    def test_sin_herramientas_nico_sigue_respondiendo(self):
        nombres = [
            h["nombre"] for h in self.su.get("/api/v1/nico/herramientas/").json()["herramientas"]
        ]
        for n in nombres:
            self.su.patch(f"/api/v1/nico/herramientas/{n}/", {"activa": False}, format="json")
        for pregunta in ("hola", "cómo está la temperatura", "¿qué significa nivel?"):
            self.assertTrue(self.chat(pregunta).get("texto"), pregunta)

    def test_sugerencias_del_chat(self):
        RespuestaAprendida.objects.create(
            organizacion=self.e.organizacion,
            pregunta="¿Qué niveles hay?",
            pregunta_normalizada="que niveles hay",
            tema="FIJA",
            plantilla="Tres.",
        )
        ruta = f"/api/v1/agente/sugerencias/?dispositivo={self.disp.num}"
        # Un operador sin acceso al agente no las recibe.
        self.assertEqual(cliente_de(self.e.operador).get(ruta).status_code, 403)
        self.e.operador.acceso_agente = True
        self.e.operador.save()
        r = cliente_de(self.e.operador).get(ruta).json()
        self.assertTrue(r["activas"])
        textos = {x["texto"]: x["tipo"] for x in r["sugerencias"]}
        self.assertEqual(textos.get("¿Qué niveles hay?"), "respuesta")
        self.assertIn("consulta", textos.values())
        # El operador no ve las acciones (reportes); el administrador sí.
        acciones = [h["ejemplo"] for h in configuracion.catalogo() if h["accion"]]
        admin = cliente_de(self.e.admin).get(ruta).json()["sugerencias"]
        accion = conocimiento.con_mayuscula(acciones[0])
        self.assertNotIn(accion, textos)
        self.assertIn(accion, [x["texto"] for x in admin])
        # De otra empresa no.
        otro = cliente_de(self.otra.admin).get(ruta)
        self.assertEqual(otro.status_code, 404)

        # Configurable desde la consola: fijar, ocultar, máximo y apagar.
        ajuste = "/api/v1/nico/sugerencias/"
        self.assertEqual(self.su.patch(ajuste, {"maximo": 50}, format="json").status_code, 400)
        r = self.su.patch(
            ajuste,
            {"fijadas": ["¿Cómo va todo?"], "ocultas": ["Qué niveles hay"], "maximo": 4},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        consola = self.su.get(f"/api/v1/nico/chat/sugerencias/?dispositivo={self.disp.num}").json()
        self.assertEqual(consola["maximo"], 4)
        self.assertEqual(consola["sugerencias"][0]["texto"], "¿Cómo va todo?")
        self.assertNotIn("¿Qué niveles hay?", [x["texto"] for x in consola["sugerencias"]])
        revision = self.su.get(f"{ajuste}?dispositivo={self.disp.num}").json()
        ocultas = [x["texto"] for x in revision["candidatas"] if x["oculta"]]
        self.assertEqual(ocultas, ["¿Qué niveles hay?"])
        self.su.patch(ajuste, {"activas": False}, format="json")
        r = cliente_de(self.e.operador).get(ruta).json()
        self.assertEqual((r["activas"], r["sugerencias"]), (False, []))

    def test_convertir_documento_en_respuestas(self):
        import json
        from unittest import mock

        from apps.nico import generador

        self.su.get("/api/v1/nico/documentos/")  # crea los documentos base
        doc = DocumentoNico.objects.get(clave="NICO")
        ruta = f"/api/v1/nico/documentos/{doc.num}/generar/"
        self.assertEqual(
            self.su.get(ruta, {"seccion": "Identidad"}).json()["estado"], "sin_generar"
        )
        vacia = self.su.post(ruta, {"seccion": "No existe"}, format="json").json()
        self.assertEqual(vacia["estado"], "error")
        # Sin ESP conectado no se usa la IA.
        with mock.patch.object(generador, "_agente", return_value=None):
            r = self.su.post(ruta, {"seccion": "Identidad"}, format="json").json()
            self.assertEqual(r["estado"], "error")
        salida = {
            "texto": json.dumps(
                {
                    "pares": [
                        {"pregunta": "¿Quién eres?", "respuesta": "Soy Nico AI."},
                        {"pregunta": "¿quién eres?", "respuesta": "Repetida"},
                        {"pregunta": "", "respuesta": "x"},
                    ]
                }
            )
        }

        class Hilo:  # corre en el momento, sin hilo aparte
            def __init__(self, target, daemon):
                self.target = target

            def start(self):
                self.target()

        with (
            mock.patch.object(generador, "_agente", return_value=self.disp),
            mock.patch.object(generador.puente, "_ejecutar", return_value=salida),
            mock.patch.object(generador.threading, "Thread", Hilo),
        ):
            self.su.post(ruta, {"seccion": "Identidad"}, format="json")
        r = self.su.get(ruta, {"seccion": "identidad"}).json()
        self.assertEqual(r["estado"], "listo")
        self.assertEqual(
            r["propuestas"], [{"pregunta": "¿Quién eres?", "respuesta": "Soy Nico AI."}]
        )

    def test_registro_y_resumen(self):
        self.chat("¿cuál es el límite de temperatura?")
        r = self.su.get("/api/v1/nico/registro/").json()
        self.assertEqual(r["count"], 1)
        self.assertEqual(r["results"][0]["organizacion_nombre"], self.e.organizacion.nombre)
        resumen = self.su.get("/api/v1/nico/resumen/").json()
        self.assertEqual(resumen["preguntas"], 1)
        self.assertEqual(len(resumen["por_dia"]), 14)
        self.assertEqual(resumen["por_dia"][-1]["total"], 1)
        self.assertEqual(sum(h["total"] for h in resumen["por_hora"]), 1)
        self.assertEqual(resumen["por_empresa"][0]["empresa"], self.e.organizacion.nombre)
        self.assertEqual(len(resumen["tiempo_por_via"]), 1)


class EnsenarDesdeRegistroTests(PruebaBase):
    """«Enseñar» una pregunta no entendida la marca como enseñada y la saca del filtro."""

    def setUp(self):
        cache.clear()
        self.e = Escenario()
        self.otra = Escenario("b")
        self.su = cliente_de(self.e.plataforma)

    def no_entendida(self, pregunta, escenario=None):
        e = escenario or self.e
        return aprendizaje.registrar(
            e.operador, e.dispositivo, pregunta, PreguntaAgente.Via.NO_ENTENDIDA, "No te entendí."
        )

    def nums(self, **params):
        r = self.su.get("/api/v1/nico/registro/", params).json()
        return {x["num"] for x in r["results"]}

    def ensenar(self, registro, pregunta=None, **extra):
        r = self.su.post(
            "/api/v1/nico/banco/",
            {
                "organizacion": self.e.organizacion.num,
                "pregunta": pregunta or registro.pregunta,
                "plantilla": "La garantía del sensor es de un año.",
                "registro": registro.num,
                **extra,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_ensenar_saca_la_pregunta_de_no_entendidas(self):
        p = self.no_entendida("¿Cuánto dura la garantía del sensor?")
        igual = self.no_entendida("cuanto dura la garantia del sensor")
        otra_empresa = self.no_entendida("¿Cuánto dura la garantía del sensor?", self.otra)
        distinta = self.no_entendida("¿Quién es el técnico de guardia?")
        self.assertEqual(
            self.nums(via="NO_ENTENDIDA"), {p.num, igual.num, otra_empresa.num, distinta.num}
        )
        resumen = self.su.get("/api/v1/nico/resumen/").json()
        self.assertEqual((resumen["no_entendidas"], resumen["ensenadas"]), (4, 0))

        nueva = self.ensenar(p)

        # La pregunta y la igual de la misma empresa quedan enseñadas; las demás, no.
        self.assertEqual(self.nums(via="NO_ENTENDIDA"), {otra_empresa.num, distinta.num})
        self.assertEqual(self.nums(via="ENSENADA"), {p.num, igual.num})
        fila = next(
            x for x in self.su.get("/api/v1/nico/registro/").json()["results"] if x["num"] == p.num
        )
        self.assertEqual(fila["ensenada"], nueva["num"])
        self.assertIsNotNone(fila["fecha_ensenada"])
        self.assertEqual(fila["via"], "NO_ENTENDIDA")  # el historial de cómo se resolvió no cambia
        resumen = self.su.get("/api/v1/nico/resumen/").json()
        self.assertEqual((resumen["no_entendidas"], resumen["ensenadas"]), (2, 2))
        # La enseñada ya no sale entre las frecuentes; la de la otra empresa, sí.
        self.assertEqual(
            {(x["pregunta"], x["total"]) for x in resumen["no_entendidas_frecuentes"]},
            {("¿Quién es el técnico de guardia?", 1), ("¿Cuánto dura la garantía del sensor?", 1)},
        )
        # Los usos del banco no se inflan con las preguntas enseñadas.
        self.assertEqual(self.su.get("/api/v1/nico/banco/").json()["results"][0]["usos"], 0)

    def test_ensenar_con_la_pregunta_reescrita(self):
        p = self.no_entendida("oye y lo de la garantía q onda")
        self.ensenar(p, pregunta="¿Cuánto dura la garantía del sensor?")
        p.refresh_from_db()
        self.assertIsNotNone(p.ensenada_id)
        self.assertNotIn(p.num, self.nums(via="NO_ENTENDIDA"))

    def test_ensenar_para_todas_las_empresas(self):
        p = self.no_entendida("¿Cuánto dura la garantía del sensor?")
        otra = self.no_entendida("¿Cuánto dura la garantía del sensor?", self.otra)
        self.ensenar(p, todas=True)
        self.assertEqual(self.nums(via="NO_ENTENDIDA"), set())
        self.assertEqual(self.nums(via="ENSENADA"), {p.num, otra.num})

    def test_otra_empresa_no_marca_el_registro(self):
        p = self.no_entendida("¿Cuánto dura la garantía del sensor?", self.otra)
        self.ensenar(p)  # la respuesta se crea en la empresa «a», la pregunta es de «b»
        self.assertIn(p.num, self.nums(via="NO_ENTENDIDA"))

    def test_borrar_la_respuesta_la_devuelve_a_pendiente(self):
        p = self.no_entendida("¿Cuánto dura la garantía del sensor?")
        nueva = self.ensenar(p)
        self.assertEqual(self.su.delete(f"/api/v1/nico/banco/{nueva['num']}/").status_code, 204)
        self.assertIn(p.num, self.nums(via="NO_ENTENDIDA"))

    def test_migracion_corrige_las_ya_ensenadas(self):
        import importlib

        from django.apps import apps as registro_apps

        migracion = importlib.import_module("apps.reportes.migrations.0006_marcar_ensenadas")
        p = self.no_entendida("¿Cuánto dura la garantía del sensor?")
        otra = self.no_entendida("¿Cuánto dura la garantía del sensor?", self.otra)
        # Como antes del arreglo: la respuesta existe pero la pregunta sigue sin enlazar.
        RespuestaAprendida.objects.create(
            organizacion=self.e.organizacion,
            pregunta="¿Cuánto dura la garantía del sensor?",
            pregunta_normalizada=aprendizaje.normalizar("¿Cuánto dura la garantía del sensor?"),
            tema="FIJA",
            plantilla="Un año.",
        )
        migracion.marcar(registro_apps, None)
        p.refresh_from_db()
        otra.refresh_from_db()
        self.assertIsNotNone(p.ensenada_id)
        self.assertIsNone(otra.ensenada_id)


@override_settings(
    NICO_AVISOS_EN_HILO=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class AvisosNicoTests(PruebaBase):
    """Campana de la consola de Nico AI: eventos, preferencias y correo."""

    def setUp(self):
        cache.clear()
        self.e = Escenario()
        self.su = cliente_de(self.e.plataforma)

    def bandeja(self, **params):
        return self.su.get("/api/v1/nico/notificaciones/", params).json()

    def no_entendida(self, pregunta, usuario=None):
        return aprendizaje.registrar(
            usuario or self.e.operador,
            self.e.dispositivo,
            pregunta,
            PreguntaAgente.Via.NO_ENTENDIDA,
            "No te entendí.",
        )

    def test_solo_superusuario(self):
        cliente = cliente_de(self.e.admin)
        for ruta in ("", "leer/", "preferencias/"):
            self.assertEqual(
                cliente.get(f"/api/v1/nico/notificaciones/{ruta}").status_code, 403, ruta
            )

    def test_pregunta_no_entendida_avisa_una_vez(self):
        self.no_entendida("¿Cuánto dura la garantía?")
        self.no_entendida("cuanto dura la garantia")  # la misma: no se repite en el día
        self.no_entendida("¿Hola?", usuario=self.e.plataforma)  # las del superusuario no
        self.no_entendida("¿Quién instaló el sensor?")  # otra pregunta sí
        b = self.bandeja()
        self.assertEqual(b["no_leidas"], 2)
        n = b["results"][-1]
        self.assertEqual((n["tipo"], n["leida"]), ("NO_ENTENDIDA", False))
        self.assertIn("garantía", n["texto"])
        self.assertTrue(n["enlace"].startswith("/registro?via=NO_ENTENDIDA"))
        # Por defecto este tipo no manda correo.
        self.assertEqual(len(mail.outbox), 0)

    def test_marcar_leidas(self):
        otro = cliente_de(Escenario("b").plataforma)  # otro superusuario, con su bandeja
        self.no_entendida("¿Cuánto dura la garantía?")
        self.no_entendida("¿Quién instaló el sensor?")
        nums = [n["num"] for n in self.bandeja()["results"]]
        r = self.su.post("/api/v1/nico/notificaciones/leer/", {"nums": nums[:1]}, format="json")
        self.assertEqual(r.json(), {"marcadas": 1, "no_leidas": 1})
        r = self.su.post("/api/v1/nico/notificaciones/leer/", {}, format="json")
        self.assertEqual(r.json()["no_leidas"], 0)
        # Cada superusuario tiene su bandeja.
        self.assertEqual(otro.get("/api/v1/nico/notificaciones/").json()["no_leidas"], 2)

    def test_preferencias_y_correo(self):
        prefs = self.su.get("/api/v1/nico/notificaciones/preferencias/").json()
        tipos = {t["tipo"]: t for t in prefs["tipos"]}
        self.assertEqual(set(tipos), {"NO_ENTENDIDA", "NEGATIVA", "PUENTE", "CARGA", "APRENDIDA"})
        self.assertFalse(tipos["NO_ENTENDIDA"]["correo"])
        r = self.su.patch(
            "/api/v1/nico/notificaciones/preferencias/",
            {"tipos": {"NO_ENTENDIDA": {"correo": True, "consola": False}, "OTRO": {}}},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.no_entendida("¿Cuánto dura la garantía?")
        self.assertEqual(self.bandeja()["results"], [])  # sin campana para este tipo
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.e.plataforma.correo])
        self.assertIn("garantía", mail.outbox[0].body)

    def test_calificacion_negativa(self):
        registro = aprendizaje.registrar(
            self.e.operador, self.e.dispositivo, "¿Cómo está la temperatura?", "IA", "Bien."
        )
        aprendizaje.calificar(registro, -1)
        aprendizaje.calificar(registro, None)
        aprendizaje.calificar(registro, -1)  # quitar y volver a poner el 👎 no repite
        tipos = [n["tipo"] for n in self.bandeja()["results"]]
        self.assertEqual(tipos, ["NEGATIVA"])

    def test_banco_aprende(self):
        with override_settings(IA_VOTOS_PARA_APRENDER=1):
            registro = aprendizaje.registrar(
                self.e.operador,
                self.e.dispositivo,
                "¿cómo está la temperatura del almacén hoy?",
                PreguntaAgente.Via.IA,
                "Está en 21.5 °C.",
                tema="TEMP",
                datos={"actual": 21.5},
            )
            self.assertTrue(aprendizaje.calificar(registro, 1))
        n = self.bandeja()["results"][0]
        self.assertEqual((n["tipo"], n["nivel"]), ("APRENDIDA", "OK"))

    def test_vigilar_puente_y_carga(self):
        from unittest import mock

        from apps.reportes import carga, puente

        estado = {"activo": True, "mb": 4000}
        cola = mock.Mock()
        cola.activo.side_effect = lambda codigo: estado["activo"]
        with (
            override_settings(
                IA_PUENTE_CLAVE="clave",
                IA_PUENTE_DISPOSITIVOS=[self.e.dispositivo.codigo_mqtt],
                NUCLEO_AGENTE_RAM_ALTA_MB=1000,
            ),
            mock.patch.object(puente, "cola", return_value=cola),
            mock.patch.object(carga, "memoria_disponible_mb", side_effect=lambda: estado["mb"]),
        ):
            avisos.vigilar()  # primera revisión: solo anota el estado
            self.assertEqual(self.bandeja()["results"], [])
            estado["activo"] = False
            avisos.vigilar()
            avisos.vigilar()  # sigue caído: no se repite
            estado["activo"] = True
            avisos.vigilar()
            estado["mb"] = 500
            avisos.vigilar()
            estado["mb"] = 3000
            avisos.vigilar()
        hechos = [(n["tipo"], n["nivel"]) for n in reversed(self.bandeja()["results"])]
        self.assertEqual(
            hechos,
            [("PUENTE", "PELIGRO"), ("PUENTE", "OK"), ("CARGA", "PELIGRO"), ("CARGA", "OK")],
        )
        # El puente y la carga mandan correo por defecto.
        self.assertEqual(len(mail.outbox), 4)
        self.assertIn("dejó de latir", mail.outbox[0].subject)
