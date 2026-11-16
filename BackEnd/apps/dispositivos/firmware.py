"""Actualización remota del firmware de los ESP32 (OTA).

``manage.py publicar_firmware`` copia el firmware de ``IoT/micropython`` (solo los archivos que se
pueden actualizar a distancia) a ``NUCLEO_FIRMWARE_DIR/<versión>/`` y la marca como actual. La
versión sale de ``FIRMWARE_VERSION`` en ``config.py``.

El ESP consulta ``/api/v1/puente/firmware/`` con la clave del puente (en
``dispositivos.bynucleo.com``) y, si hay una versión distinta a la suya, baja cada archivo,
comprueba su SHA-256 y la firma del manifiesto (HMAC-SHA256 con la clave del puente), y la aplica
al reiniciar con vuelta atrás automática (``IoT/micropython/actualizacion.py``).

Solo reciben la versión los dispositivos de ``NUCLEO_FIRMWARE_DISPOSITIVOS`` (``*`` = todos):
así se prueba primero en uno.
"""

import hashlib
import hmac
import json
import re
import shutil
from pathlib import Path

from django.conf import settings

# Lo que se puede actualizar a distancia. Nunca: secrets.py (credenciales de cada placa),
# boot.py y actualizacion.py (si se rompieran, la placa no podría volver atrás sola).
PATRONES = ("main.py", "config.py", "nucleo/*.py", "nucleo/raices.pem")
PROTEGIDOS = {"secrets.py", "boot.py", "actualizacion.py"}
_VERSION = re.compile(r"^[0-9A-Za-z._-]{1,20}$")
_RUTA = re.compile(r"^[A-Za-z0-9_]+(/[A-Za-z0-9_]+)*\.(py|pem)$")


class FirmwareError(Exception):
    pass


def carpeta():
    return Path(settings.NUCLEO_FIRMWARE_DIR)


def version_de(origen):
    texto = (Path(origen) / "config.py").read_text(encoding="utf-8")
    encontrada = re.search(r'^FIRMWARE_VERSION\s*=\s*"([^"]+)"', texto, re.MULTILINE)
    if not encontrada:
        raise FirmwareError("config.py no define FIRMWARE_VERSION.")
    return encontrada.group(1)


def ruta_valida(ruta):
    return bool(_RUTA.match(ruta)) and ".." not in ruta and ruta not in PROTEGIDOS


def canonico(version, archivos):
    """Texto que firma el servidor y comprueba el ESP (mismo formato en los dos lados)."""
    lineas = [version] + [f"{a['ruta']}:{a['sha256']}:{a['tamano']}" for a in archivos]
    return "\n".join(lineas).encode()


def firmar(version, archivos):
    clave = settings.IA_PUENTE_CLAVE.encode()
    return hmac.new(clave, canonico(version, archivos), hashlib.sha256).hexdigest()


def publicar(origen):
    """Copia el firmware y lo marca como actual. Devuelve el manifiesto."""
    origen = Path(origen)
    version = version_de(origen)
    if not _VERSION.match(version):
        raise FirmwareError(f"Versión no válida: {version!r}")
    archivos = []
    for patron in PATRONES:
        for archivo in sorted(origen.glob(patron)):
            ruta = archivo.relative_to(origen).as_posix()
            if not ruta_valida(ruta):
                continue
            datos = archivo.read_bytes()
            archivos.append(
                {"ruta": ruta, "sha256": hashlib.sha256(datos).hexdigest(), "tamano": len(datos)}
            )
    if not archivos:
        raise FirmwareError(f"No hay archivos de firmware en {origen}.")
    destino = carpeta() / version
    manifiesto_previo = destino / "manifiesto.json"
    if manifiesto_previo.exists():
        previo = json.loads(manifiesto_previo.read_text())
        if previo["archivos"] != archivos:
            raise FirmwareError(
                f"La versión {version} ya se publicó con otro contenido: sube FIRMWARE_VERSION."
            )
    else:
        temporal = carpeta() / f".{version}.tmp"
        shutil.rmtree(temporal, ignore_errors=True)
        for a in archivos:
            (temporal / a["ruta"]).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(origen / a["ruta"], temporal / a["ruta"])
        (temporal / "manifiesto.json").write_text(
            json.dumps({"version": version, "archivos": archivos}, indent=1)
        )
        temporal.rename(destino)
    (carpeta() / "actual").write_text(version)
    return {"version": version, "archivos": archivos}


def version_actual():
    try:
        return (carpeta() / "actual").read_text().strip() or None
    except FileNotFoundError:
        return None


def autorizado(codigo):
    """Reciben la versión: todos (política «ota_todos» o ``*`` en el ``.env``), los marcados
    en la consola de administración (``recibe_ota``) o los de ``NUCLEO_FIRMWARE_DISPOSITIVOS``."""
    from apps.consola.politicas import politica

    from .models import Dispositivo

    lista = settings.NUCLEO_FIRMWARE_DISPOSITIVOS
    if "*" in lista or codigo in lista or politica().ota_todos:
        return True
    return Dispositivo.objects.filter(codigo_mqtt=codigo, recibe_ota=True).exists()


def manifiesto_para(codigo):
    """Manifiesto firmado de la versión actual, o ``None`` si este dispositivo no la recibe."""
    version = version_actual()
    if not version or not autorizado(codigo) or not settings.IA_PUENTE_CLAVE:
        return None
    try:
        datos = json.loads((carpeta() / version / "manifiesto.json").read_text())
    except FileNotFoundError:
        return None
    archivos = datos["archivos"]
    return {"version": version, "archivos": archivos, "firma": firmar(version, archivos)}


def archivo(version, ruta):
    """Ruta en disco de un archivo publicado, o ``None`` si no existe o no está permitido."""
    if not _VERSION.match(version or "") or not ruta_valida(ruta or ""):
        return None
    base = (carpeta() / version).resolve()
    destino = (base / ruta).resolve()
    if base not in destino.parents or not destino.is_file():
        return None
    return destino
