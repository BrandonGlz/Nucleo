"""Aplica la actualización remota (OTA) al arrancar y vuelve atrás si la versión nueva falla.

Lo llama ``boot.py`` antes que nada. Nunca se actualiza a sí mismo (ni ``boot.py`` ni
``secrets.py``), así la placa siempre puede recuperarse sola:

1. ``nucleo/ota.py`` baja y verifica la versión en ``ota/`` y deja ``ota/listo``.
2. Al reiniciar, ``aplicar()`` copia a ``anterior/`` los archivos que va a reemplazar, mueve los
   nuevos a su lugar y deja ``ota_estado.json`` en «probando».
3. Si la versión nueva conecta con el broker o el respaldo HTTPS, ``confirmar()`` borra el
   respaldo. Si la placa se reinicia ``INTENTOS`` veces sin confirmar (error, watchdog), se
   restauran los archivos de ``anterior/`` y esa versión queda como fallida para no repetirla.
"""

import json
import os

RAIZ = ""  # las pruebas la cambian a una carpeta temporal
INTENTOS = 3


def _r(ruta):
    return RAIZ + ruta


def _existe(ruta):
    try:
        os.stat(_r(ruta))
        return True
    except OSError:
        return False


def _carpetas(ruta):
    """Crea las carpetas de ``ruta`` (MicroPython no trae makedirs)."""
    partes = ruta.split("/")[:-1]
    actual = ""
    for parte in partes:
        actual = actual + parte if not actual else actual + "/" + parte
        try:
            os.mkdir(_r(actual))
        except OSError:
            pass


def _borrar(ruta):
    """Borra un archivo o una carpeta completa."""
    try:
        if os.stat(_r(ruta))[0] & 0x4000:
            for nombre in os.listdir(_r(ruta)):
                _borrar(ruta + "/" + nombre)
            os.rmdir(_r(ruta))
        else:
            os.remove(_r(ruta))
    except OSError:
        pass


def _mover(origen, destino):
    _carpetas(destino)
    if _existe(destino):
        os.remove(_r(destino))
    os.rename(_r(origen), _r(destino))


def _leer(ruta, defecto=None):
    try:
        with open(_r(ruta)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir(ruta, datos):
    with open(_r(ruta), "w") as f:
        json.dump(datos, f)


def estado():
    return _leer("ota_estado.json", {})


def aplicar():
    """Instala una versión descargada, o vuelve atrás si la que se prueba no arranca."""
    est = estado()
    if est.get("probando"):
        est["intentos"] = est.get("intentos", 0) + 1
        if est["intentos"] > INTENTOS:
            _volver_atras(est)
            return "restaurada"
        _escribir("ota_estado.json", est)
        return "probando"
    if not _existe("ota/listo"):
        return None
    manifiesto = _leer("ota/manifiesto.json")
    if not manifiesto:
        _borrar("ota")
        return None
    _borrar("anterior")
    instalados = []
    for archivo in manifiesto["archivos"]:
        ruta = archivo["ruta"]
        if _existe(ruta):
            _mover(ruta, "anterior/" + ruta)
        instalados.append(ruta)
        _mover("ota/" + ruta, ruta)
    _escribir(
        "ota_estado.json",
        {
            "probando": True,
            "intentos": 1,
            "version": manifiesto["version"],
            "previa": est.get("version"),
            "instalados": instalados,
            "fallida": est.get("fallida"),
        },
    )
    _borrar("ota")
    return "aplicada"


def _volver_atras(est):
    for ruta in est.get("instalados", []):
        if _existe("anterior/" + ruta):
            _mover("anterior/" + ruta, ruta)
        else:
            _borrar(ruta)  # no existía antes de la actualización
    _borrar("anterior")
    _escribir("ota_estado.json", {"version": est.get("previa"), "fallida": est.get("version")})


def confirmar():
    """La versión nueva funciona: se queda y se borra el respaldo."""
    est = estado()
    if not est.get("probando"):
        return False
    _borrar("anterior")
    _escribir("ota_estado.json", {"version": est.get("version"), "fallida": est.get("fallida")})
    return True
