"""Orquestación de las consultas de Analítica: filtros, tarjetas y caché."""

import hashlib
import json
import logging

from django.core.cache import cache
from django.utils import timezone
from django.utils.text import slugify

from apps.analitica import exportacion
from apps.analitica import tarjetas as tarjetas_mod
from apps.analitica.filtros import resolver_filtros

logger = logging.getLogger(__name__)

CACHE_CONSULTA_SEGUNDOS = 60


def _iso_local(fecha):
    return timezone.localtime(fecha).isoformat()


def clave_cache(usuario, tarjetas, filtros, cruzado, consulta, prefijo):
    payload = {
        "usuario": usuario.pk,
        "rol": usuario.rol_id,
        "organizacion": usuario.organizacion_id,
        "area": usuario.area_id,
        "tarjetas": tarjetas,
        "filtros": filtros,
        "cruzado": cruzado,
        "periodo": consulta.periodo,
        "intervalo": consulta.intervalo,
        "inicio_dia": timezone.localtime(consulta.inicio).date().isoformat(),
        "areas": list(consulta.area_ids),
        "dispositivos": list(consulta.dispositivo_ids),
        "sensores": list(consulta.sensor_ids),
    }
    normalizado = json.dumps(
        payload,
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    return f"analitica:{prefijo}:{hashlib.sha256(normalizado.encode()).hexdigest()}"


def leer_cache(clave):
    try:
        return cache.get(clave)
    except Exception:  # noqa: BLE001 - la caché no debe tumbar la consulta
        logger.warning("No se pudo leer la caché de Analítica", exc_info=True)
        return None


def guardar_cache(clave, valor, segundos):
    try:
        cache.set(clave, valor, segundos)
    except Exception:  # noqa: BLE001 - la caché no debe tumbar la consulta
        logger.warning("No se pudo guardar la caché de Analítica", exc_info=True)


def consultar(usuario, tarjetas, filtros=None, cruzado=None, usar_cache=True):
    """Calcula las tarjetas de una página y devuelve el JSON de la API.

    ``tarjetas`` ya viene normalizada por ``catalogo.validar_tarjetas``. Un error en una
    tarjeta se devuelve en su entrada y no tumba las demás.
    """
    consulta = resolver_filtros(usuario, filtros, cruzado)
    clave = clave_cache(usuario, tarjetas, filtros, cruzado, consulta, "consulta")
    if usar_cache:
        guardado = leer_cache(clave)
        if guardado is not None:
            return guardado
    generado = _iso_local(timezone.now())
    resultado = {}
    for tarjeta in tarjetas:
        try:
            resultado[tarjeta["id"]] = tarjetas_mod.calcular(tarjeta, consulta)
        except Exception:  # noqa: BLE001 - una tarjeta no tumba la página
            logger.exception("No se pudo calcular la tarjeta %s", tarjeta.get("id"))
            resultado[tarjeta["id"]] = {
                "error": "No se pudo calcular esta tarjeta.",
                "tipo": tarjeta.get("tipo"),
                "titulo": tarjeta.get("titulo"),
            }
    respuesta = {
        "generado": generado,
        "periodo": {
            "inicio": _iso_local(consulta.inicio),
            "fin": _iso_local(consulta.fin),
        },
        "previo": {
            "inicio": _iso_local(consulta.previo_inicio),
            "fin": _iso_local(consulta.previo_fin),
        },
        "intervalo": consulta.intervalo,
        "tarjetas": resultado,
    }
    if usar_cache:
        guardar_cache(clave, respuesta, CACHE_CONSULTA_SEGUNDOS)
    return respuesta


def nombre_csv(tarjeta, consulta):
    base = slugify(tarjeta["titulo"]) or "tarjeta"
    inicio = timezone.localtime(consulta.inicio).strftime("%Y%m%d")
    fin = timezone.localtime(consulta.fin).strftime("%Y%m%d")
    return f"analitica_{base}_{inicio}_{fin}.csv"


def csv_tarjeta(usuario, tarjeta, filtros=None, cruzado=None):
    """Datos de una tarjeta para el CSV: consulta, encabezado y filas."""
    consulta = resolver_filtros(usuario, filtros, cruzado)
    datos = tarjetas_mod.calcular(tarjeta, consulta)
    encabezado, filas = exportacion.csv_de_tarjeta(datos, tarjeta)
    return consulta, encabezado, filas
