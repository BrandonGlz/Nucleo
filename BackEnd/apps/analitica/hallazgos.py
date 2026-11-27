"""Hallazgos de Nico AI sobre una página de Analítica.

Arma un resumen con las cifras que ya calcularon las tarjetas (nunca inventa datos), pide
a la IA local de Ollama entre 3 y 5 hallazgos de máximo 140 caracteres y, si la IA falla o
tarda más de 60 s, usa reglas locales. El resultado se cachea 10 min y no se guarda en la
base.
"""

import json
import logging
import re
import urllib.request

from django.conf import settings
from django.utils import timezone

from apps.analitica import servicio
from apps.analitica.filtros import resolver_filtros
from apps.nico import configuracion

logger = logging.getLogger(__name__)

CACHE_HALLAZGOS_SEGUNDOS = 10 * 60
ESPERA_IA = 60
MAXIMO = 140
NUMERO = re.compile(r"-?\d+(?:[.,]\d+)?")


def _recortar(texto):
    texto = " ".join(str(texto).split()).strip(" -•*\"'")
    return texto if len(texto) <= MAXIMO else texto[: MAXIMO - 1].rstrip() + "…"


def _resumen(respuesta):
    """Resumen compacto de las cifras ya calculadas, listo para la IA."""
    tarjetas = []
    for datos in (respuesta.get("tarjetas") or {}).values():
        if not isinstance(datos, dict) or "error" in datos:
            continue
        tipo = datos.get("tipo")
        if tipo in ("hallazgos", "texto"):
            continue
        item = {"tipo": tipo, "titulo": datos.get("titulo", "")}
        if tipo in ("kpi", "medidor"):
            variacion = datos.get("variacion") or {}
            item.update(
                {
                    "valor": datos.get("valor"),
                    "unidad": datos.get("unidad"),
                    "previo": datos.get("previo"),
                    "variacion_pct": variacion.get("pct"),
                    "variacion_abs": variacion.get("abs"),
                    "meta": (datos.get("meta") or {}).get("texto"),
                    "meta_valor": (datos.get("meta") or {}).get("valor"),
                    "meta_estado": datos.get("meta_estado"),
                }
            )
        elif tipo == "tendencia":
            puntos = [
                punto.get("y")
                for serie in datos.get("series") or []
                for punto in serie.get("puntos") or []
                if punto.get("y") is not None
            ]
            item.update(
                {
                    "unidad": datos.get("unidad"),
                    "min": min(puntos) if puntos else None,
                    "max": max(puntos) if puntos else None,
                    "series": len(datos.get("series") or []),
                }
            )
        elif tipo in ("barras", "ranking"):
            filas = datos.get("barras") if tipo == "barras" else datos.get("filas")
            item.update(
                {
                    "metrica": datos.get("metrica"),
                    "unidad": datos.get("unidad"),
                    "filas": [
                        {"etiqueta": fila.get("etiqueta"), "valor": fila.get("valor")}
                        for fila in (filas or [])[:5]
                    ],
                }
            )
        elif tipo == "barras_apiladas":
            item.update(
                {
                    "por": datos.get("por"),
                    "series": [serie.get("nombre") for serie in datos.get("series") or []],
                    "categorias": len(datos.get("categorias") or []),
                }
            )
        elif tipo == "alertas_dona":
            item.update(
                {
                    "por": datos.get("por"),
                    "total": datos.get("total"),
                    "sectores": [
                        {"etiqueta": sector.get("etiqueta"), "valor": sector.get("valor")}
                        for sector in (datos.get("sectores") or [])[:5]
                    ],
                }
            )
        elif tipo == "tiempo_atencion":
            item.update(
                {
                    "promedio": datos.get("promedio"),
                    "total": datos.get("total"),
                    "atendidas": datos.get("atendidas"),
                    "meta": (datos.get("meta") or {}).get("texto"),
                    "meta_valor": (datos.get("meta") or {}).get("valor"),
                    "meta_estado": datos.get("meta_estado"),
                }
            )
        elif tipo == "disponibilidad":
            item.update(
                {
                    "promedio": datos.get("promedio"),
                    "filas": [
                        {"etiqueta": fila.get("etiqueta"), "valor": fila.get("valor")}
                        for fila in (datos.get("filas") or [])[:5]
                    ],
                    "meta": (datos.get("meta") or {}).get("texto"),
                    "meta_valor": (datos.get("meta") or {}).get("valor"),
                    "meta_estado": datos.get("meta_estado"),
                }
            )
        elif tipo == "matriz":
            valores = [
                celda.get("valor")
                for fila in datos.get("filas") or []
                for celda in fila.get("celdas") or []
                if celda.get("valor") is not None
            ]
            item.update(
                {
                    "min": min(valores) if valores else None,
                    "max": max(valores) if valores else None,
                }
            )
        elif tipo == "mapa_calor":
            item.update(
                {
                    "alertas": datos.get("alertas"),
                    "min": datos.get("min"),
                    "max": datos.get("max"),
                }
            )
        elif tipo == "histograma":
            item.update({"total": datos.get("total"), "unidad": datos.get("unidad")})
        elif tipo == "dispersion":
            item.update({"puntos": len(datos.get("puntos") or [])})
        else:
            continue
        tarjetas.append(item)
    return {
        "periodo": respuesta.get("periodo"),
        "previo": respuesta.get("previo"),
        "intervalo": respuesta.get("intervalo"),
        "tarjetas": tarjetas,
    }


def _sin_ceros(valor):
    texto = f"{valor:.6f}".rstrip("0").rstrip(".")
    return texto or "0"


def _numeros(objeto, acumulado=None):
    """Todas las variantes de las cifras del resumen, para validar lo que cita la IA."""
    if acumulado is None:
        acumulado = set()
    if isinstance(objeto, bool) or objeto is None:
        return acumulado
    if isinstance(objeto, (int, float)):
        valor = float(objeto)
        for texto in (
            _sin_ceros(valor),
            f"{valor:.0f}",
            f"{valor:.1f}",
            f"{valor:.2f}",
            _sin_ceros(abs(valor)),
        ):
            acumulado.add(texto)
    elif isinstance(objeto, dict):
        for valor in objeto.values():
            _numeros(valor, acumulado)
    elif isinstance(objeto, (list, tuple)):
        for valor in objeto:
            _numeros(valor, acumulado)
    return acumulado


def _valida(texto, numeros):
    for token in NUMERO.findall(texto):
        normalizado = token.replace(",", ".")
        if normalizado not in numeros and _sin_ceros(float(normalizado)) not in numeros:
            return False
    return True


def _extraer_hallazgos(contenido):
    contenido = contenido.strip()
    if contenido.startswith("```"):
        lineas = contenido.splitlines()
        contenido = "\n".join(lineas[1:-1]).strip()
    try:
        datos = json.loads(contenido)
    except (TypeError, ValueError):
        return None
    if isinstance(datos, dict):
        datos = datos.get("hallazgos")
    if not isinstance(datos, list):
        return None
    return [str(item) for item in datos if isinstance(item, (str, int, float))]


def _cuerpo(mensajes):
    return {
        "model": settings.IA_MODELO_LOCAL,
        "stream": False,
        "keep_alive": "30m",
        "think": False,
        "options": {
            "num_predict": 320,
            "num_ctx": configuracion.contexto(),
            "temperature": 0,
            "top_p": 0.9,
            "num_thread": 3,
        },
        "format": "json",
        "messages": mensajes,
    }


def _consultar_ia(resumen):
    """Pide los hallazgos a Ollama directamente, sin pasar por el ESP de Nico."""
    if not settings.IA_OLLAMA_URL or not settings.IA_MODELO_LOCAL:
        return None
    instrucciones = (
        "Eres Nico AI, analista de datos ambientales de Núcleo. Redacta entre 3 y 5 "
        "hallazgos breves en español sobre el resumen. Cada hallazgo debe tener máximo "
        "140 caracteres, no repetir a otro y citar solo cifras que aparezcan en el "
        "resumen; no inventes valores. Devuelve un JSON con la clave «hallazgos» y una "
        "lista de cadenas."
    )
    mensajes = [
        {"role": "system", "content": instrucciones},
        {
            "role": "user",
            "content": json.dumps(resumen, ensure_ascii=False, sort_keys=True),
        },
    ]
    try:
        peticion = urllib.request.Request(  # noqa: S310
            settings.IA_OLLAMA_URL.rstrip("/") + "/api/chat",
            data=json.dumps(_cuerpo(mensajes)).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(peticion, timeout=ESPERA_IA) as respuesta:  # noqa: S310
            datos = json.loads(respuesta.read())
        contenido = (datos.get("message") or {}).get("content", "")
        return _extraer_hallazgos(contenido)
    except Exception:  # noqa: BLE001 - la IA no debe tumbar la página
        logger.warning("No se pudieron generar los hallazgos con la IA", exc_info=True)
        return None


def _locales(datos):
    """Hallazgos por reglas: meta, variación, peor grupo y pico de alertas."""
    hallazgos = []
    kpis = [
        datos_tarjeta
        for datos_tarjeta in datos.values()
        if isinstance(datos_tarjeta, dict)
        and datos_tarjeta.get("tipo") in ("kpi", "medidor")
        and "error" not in datos_tarjeta
    ]
    for datos_tarjeta in kpis:
        if datos_tarjeta.get("meta_estado") in ("cerca", "lejos"):
            meta = datos_tarjeta.get("meta") or {}
            hallazgos.append(
                _recortar(
                    f"{datos_tarjeta.get('titulo')}: {datos_tarjeta.get('valor')} "
                    f"{datos_tarjeta.get('unidad', '')} ({meta.get('texto', 'meta')})."
                )
            )
            break
    variaciones = [
        (abs((datos_tarjeta.get("variacion") or {}).get("pct") or 0), datos_tarjeta)
        for datos_tarjeta in kpis
        if (datos_tarjeta.get("variacion") or {}).get("pct") not in (None, 0)
    ]
    if variaciones:
        _, datos_tarjeta = max(variaciones, key=lambda par: par[0])
        variacion = datos_tarjeta.get("variacion") or {}
        hallazgos.append(
            _recortar(
                f"{datos_tarjeta.get('titulo')} "
                f"{'subió' if variacion.get('pct', 0) > 0 else 'bajó'} "
                f"{abs(variacion.get('pct', 0)):.1f} % contra el periodo anterior."
            )
        )
    peores = []
    for datos_tarjeta in datos.values():
        if not isinstance(datos_tarjeta, dict) or "error" in datos_tarjeta:
            continue
        if datos_tarjeta.get("tipo") in ("barras", "ranking"):
            filas = datos_tarjeta.get("barras") or datos_tarjeta.get("filas") or []
            for fila in filas:
                if fila.get("valor") is not None:
                    peores.append((datos_tarjeta, fila))
        elif datos_tarjeta.get("tipo") == "disponibilidad":
            for fila in datos_tarjeta.get("filas") or []:
                if fila.get("valor") is not None:
                    peores.append((datos_tarjeta, fila))
    if peores:
        datos_tarjeta, fila = min(
            peores,
            key=lambda par: (
                par[1].get("valor")
                if par[0].get("metrica") not in ("alertas", "tiempo_atencion")
                else -par[1].get("valor")
            ),
        )
        hallazgos.append(
            _recortar(
                f"{fila.get('etiqueta', 'Un grupo')} destaca con "
                f"{fila.get('valor')} {datos_tarjeta.get('unidad', '')}."
            )
        )
    for datos_tarjeta in datos.values():
        if not isinstance(datos_tarjeta, dict):
            continue
        if datos_tarjeta.get("tipo") == "alertas_dona" and datos_tarjeta.get("total"):
            hallazgos.append(
                _recortar(
                    f"Se registraron {datos_tarjeta['total']} alertas en el periodo."
                )
            )
            break
        if datos_tarjeta.get("tipo") == "mapa_calor" and datos_tarjeta.get("alertas"):
            valores = [
                valor
                for fila in datos_tarjeta.get("valores") or []
                for valor in fila
                if valor
            ]
            if valores:
                hallazgos.append(
                    _recortar(f"El pico de alertas por hora fue de {max(valores)}.")
                )
                break
    if not hallazgos:
        for datos_tarjeta in kpis[:3]:
            if datos_tarjeta.get("valor") is not None:
                hallazgos.append(
                    _recortar(
                        f"{datos_tarjeta.get('titulo')}: "
                        f"{datos_tarjeta.get('valor')} {datos_tarjeta.get('unidad', '')}."
                    )
                )
    if not hallazgos:
        hallazgos = ["No hay cifras suficientes en el periodo seleccionado."]
    for relleno in (
        "Prueba ampliar el periodo o quitar algún filtro.",
        "Revisa los grupos con peor comportamiento en las tarjetas.",
        "Las cifras se actualizan al cambiar el periodo o el alcance.",
    ):
        if len(hallazgos) >= 3:
            break
        if relleno not in hallazgos:
            hallazgos.append(relleno)
    vistos = set()
    resultado = []
    for hallazgo in hallazgos:
        texto = _recortar(hallazgo)
        if texto and texto.casefold() not in vistos:
            vistos.add(texto.casefold())
            resultado.append(texto)
    return resultado[:5]


def generar(usuario, tarjetas, filtros=None, cruzado=None):
    """Genera (o toma de la caché) los hallazgos de una página."""
    consulta = resolver_filtros(usuario, filtros, cruzado)
    clave = servicio.clave_cache(
        usuario, tarjetas, filtros, cruzado, consulta, "hallazgos"
    )
    guardado = servicio.leer_cache(clave)
    if guardado is not None:
        return guardado
    respuesta = servicio.consultar(usuario, tarjetas, filtros, cruzado)
    resumen = _resumen(respuesta)
    numeros = _numeros(resumen)
    candidatos = _consultar_ia(resumen)
    hallazgos = None
    origen = "local"
    if candidatos:
        limpios = []
        vistos = set()
        for candidato in candidatos:
            texto = _recortar(candidato)
            if (
                texto
                and texto.casefold() not in vistos
                and _valida(texto, numeros)
            ):
                vistos.add(texto.casefold())
                limpios.append(texto)
        if 3 <= len(limpios) <= 5:
            hallazgos = limpios
            origen = "ia"
        elif len(limpios) > 5:
            hallazgos = limpios[:5]
            origen = "ia"
    if hallazgos is None:
        hallazgos = _locales(respuesta["tarjetas"])
    salida = {
        "hallazgos": hallazgos,
        "origen": origen,
        "generado": timezone.localtime(timezone.now()).isoformat(),
    }
    servicio.guardar_cache(clave, salida, CACHE_HALLAZGOS_SEGUNDOS)
    return salida
