from django.core.cache import cache

from apps.reportes.models import PreguntaAgente, RespuestaAprendida
from common.testing import Escenario, PruebaBase, cliente_de

from . import configuracion
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
        r = self.su.patch(ruta, {"contenido": "## Personalidad\nEres paciente.", "activo": True})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("Eres paciente.", configuracion.instrucciones("Base"))
        self.assertEqual(configuracion.contexto(), configuracion.CONTEXTO)
        # No se crean ni se borran documentos.
        self.assertEqual(self.su.post("/api/v1/nico/documentos/", {"clave": "X"}).status_code, 405)
        self.assertEqual(self.su.delete(ruta).status_code, 405)

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
