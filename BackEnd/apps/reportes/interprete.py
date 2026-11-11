"""Intérprete y verificador de Nico AI.

Antes de responder, la pregunta se convierte en una ``Peticion`` explícita (qué se pide, de qué
variable, de qué periodo y qué dato). Después, la respuesta se verifica contra esa petición: que
hable de la variable pedida, del periodo pedido, que traiga la última medición o la gráfica si se
pidieron. Si no cumple, se corrige con una pregunta canónica armada desde la petición y, si
tampoco cumple, se pide aclaración en vez de responder algo que no se pidió.

Es la herramienta común del agente: las reglas, el banco y la IA pasan por aquí, y el comando
``manage.py evaluar_agente`` usa lo mismo para medir los casos guardados en ``casos_agente.py``.
"""

import re
from dataclasses import dataclass, field

from . import agente, graficas, herramientas

NOMBRES = {"TEMP": "temperatura", "HUM": "humedad", "AIRE": "calidad del aire"}
# Cómo aparece cada variable en las respuestas (normalizado, sin acentos).
EN_TEXTO = {"TEMP": "temperatura", "HUM": "humedad", "AIRE": "aire"}
DATOS = {"maximo": "máxima", "minimo": "mínima", "promedio": "promedio"}


@dataclass
class Peticion:
    texto: str  # la pregunta ya con el contexto que corresponda
    intencion: str
    variables: list = field(default_factory=list)
    periodo: str = ""  # descripción del periodo si se nombró uno
    dato: str | None = None
    contexto: bool = False

    def como_dict(self):
        return {
            "intencion": self.intencion,
            "variables": self.variables,
            "periodo": self.periodo,
            "dato": self.dato,
            "contexto": self.contexto,
        }

    def describir(self):
        """La petición en palabras, para pedir aclaración."""
        que = {
            "ultima": "la última medición",
            "grafica": "una gráfica",
            "comparativa": "una comparativa",
            "alertas": "las alertas",
            "conexion": "el estado de conexión",
            "reporte": "un reporte",
            "resumen": "un resumen de todas las variables",
        }.get(self.intencion, DATOS.get(self.dato, "cómo está"))
        de = f" de {' y '.join(NOMBRES[v] for v in self.variables)}" if self.variables else ""
        cuando = f" de {self.periodo}" if self.periodo else ""
        return f"{que}{de}{cuando}"

    def canonica(self):
        """Pregunta en las palabras exactas que entienden las reglas."""
        var = " y ".join(NOMBRES[v] for v in self.variables)
        cuando = f" de {self.periodo}" if self.periodo else ""
        if self.intencion == "ultima":
            return f"última medición de {var or 'los sensores'}"
        if self.intencion == "grafica":
            return f"gráfica de {var or 'todas las variables'}{cuando}"
        if self.intencion == "comparativa":
            return f"compara {var or 'las variables'} {self.periodo or 'de esta semana'}"
        if self.intencion == "alertas":
            return f"alertas{cuando}"
        if self.intencion == "conexion":
            return "estado de conexión"
        if self.intencion == "resumen":
            return f"medidas de los sensores{cuando}"
        if self.dato and var:
            return f"{DATOS[self.dato]} de {var}{cuando}"
        return f"¿cómo está la {var or 'temperatura'}{cuando}?"


def _periodo_nombrado(texto):
    # «el último día registrado» y «la última medición» los resuelve la gráfica con la lectura
    # más reciente, no con un periodo del calendario.
    if agente.pide_ultima(texto) or re.search(
        r"registrad|con (datos|lecturas)", agente._normalizar(texto)
    ):
        return ""
    descripcion = agente.periodo_de(texto)[2]
    return "" if descripcion == agente.periodo_de("")[2] else descripcion


def interpretar(pregunta, anterior=""):
    """``Peticion`` de una pregunta (con la anterior como contexto si hace falta)."""
    texto = agente.con_contexto(pregunta, anterior)
    contexto = texto != agente.NEGADO.sub("", pregunta).strip()
    normal = agente._normalizar(texto)
    tema = agente._tema(texto)
    variables = [tema] if tema in agente.ORDEN_VARIABLES else []
    if graficas.pide_grafica(texto) or graficas.pide_comparativa(texto):
        codigo = graficas._variable_de(graficas._texto(texto))
        variables = [codigo] if codigo else variables
    peticion = Peticion(
        texto=texto,
        intencion="no_entendida",
        variables=variables,
        periodo=_periodo_nombrado(texto),
        dato=agente._dato_pedido(texto),
        contexto=contexto,
    )
    if (
        agente.es_comentario(pregunta)
        or agente.es_cortesia(pregunta)
        or agente.es_afirmacion(pregunta)
        or agente.es_negacion(pregunta)
    ):
        peticion.intencion = "comentario"
    elif herramientas.pide_areas(pregunta):
        peticion.intencion = "areas"
    elif herramientas.pide_reportes(texto):
        peticion.intencion = "reportes"
    elif herramientas.pide_umbrales(texto):
        peticion.intencion = "umbrales"
    elif agente.SENSORES.search(normal):
        peticion.intencion = "sensores"
    elif graficas.pide_comparativa(texto):
        peticion.intencion = "comparativa"
    elif graficas.pide_grafica(texto):
        peticion.intencion = "grafica"
    elif agente.pide_reporte(texto):
        peticion.intencion = "reporte"
    elif agente.reporta_falla(texto):
        peticion.intencion = "conexion"
    elif variables and agente.es_observacion(pregunta):
        peticion.intencion = "ultima"
    elif tema == "CONEXION":
        peticion.intencion = "conexion"
    elif tema == "ALERTAS":
        peticion.intencion = "alertas"
    elif agente.pide_ultima(texto) and tema is not None:
        peticion.intencion = "ultima"
    elif tema == "GENERICA":
        peticion.intencion = "resumen"
    elif variables and agente.PORQUE.search(normal):
        peticion.intencion = "por_que"
    elif variables and agente.GRAVEDAD.search(normal):
        peticion.intencion = "gravedad"
    elif variables:
        peticion.intencion = "variable"
    return peticion


def verificar(peticion, respuesta):
    """Problemas de la respuesta frente a la petición (lista vacía si cumple)."""
    texto = agente._normalizar(respuesta.get("texto", ""))
    sin_datos = any(
        f in texto
        for f in ("no tiene lecturas", "no hay grafica", "todavia no", "no tiene datos", "no hay")
    )
    problemas = []
    if peticion.intencion in (
        "no_entendida",
        "comentario",
        "reporte",
        "reportes",
        "sensores",
        "conexion",
        "umbrales",
        "areas",
    ):
        return problemas
    # Error típico: responder de otra variable («pedí el aire y habló de la humedad»). Si la
    # respuesta no nombra ninguna variable (p. ej. la IA dice «ahora está en 23 °C»), no cuenta.
    if peticion.variables and peticion.intencion != "comparativa":
        otras = [o for o in agente.ORDEN_VARIABLES if o not in peticion.variables]
        if any(EN_TEXTO[o] in texto for o in otras) and not any(
            EN_TEXTO[v] in texto for v in peticion.variables
        ):
            problemas.append("habla de otra variable")
    if peticion.intencion == "ultima" and "ultima medicion" not in texto and not sin_datos:
        problemas.append("no trae la última medición")
    # Una negativa explicada («necesitas al menos dos dispositivos») no lleva cifras: es válida.
    con_cifras = bool(re.search(r"\d", texto))
    if peticion.intencion == "grafica" and "grafica" not in respuesta and con_cifras:
        problemas.append("no trae la gráfica")
    # La comparativa no se verifica aquí: si se niega (p. ej. «entre dispositivos» con uno solo),
    # reintentarla con otra pregunta cambiaría lo que se pidió.
    if peticion.periodo and peticion.intencion in ("variable", "alertas", "grafica", "resumen"):
        if agente._normalizar(peticion.periodo) not in texto and not sin_datos:
            problemas.append(f"no es del periodo pedido ({peticion.periodo})")
    if peticion.dato in ("maximo", "minimo") and peticion.intencion == "variable":
        palabra = "maxim" if peticion.dato == "maximo" else "minim"
        if palabra not in texto and not sin_datos:
            problemas.append(f"no trae la {DATOS[peticion.dato]}")
    return problemas


def aclarar(peticion, problemas):
    """Pregunta de vuelta. Si el usuario responde «sí», se hace ``propuesta`` (ver la vista)."""
    return {
        "texto": "No estoy seguro de haberte entendido bien, así que prefiero no darte un dato "
        f"equivocado. ¿Quieres {peticion.describir()}? Puedes pedirlo así: "
        f"«{peticion.canonica()}».",
        "verificacion": problemas,
    }
