"""Carga de firmware por USB desde la consola de administración (página «Cargar firmware»).

El navegador (Web Serial) graba la placa; el servidor le da lo que necesita:

- ``GET  consola/flasheo/``                    qué hay: MicroPython por chip y archivos de Núcleo.
- ``GET  consola/flasheo/micropython/<chip>/`` la imagen de MicroPython (binaria) de ese chip.
- ``GET  consola/flasheo/archivos/``           los archivos de Núcleo en base64 (sin secrets.py).
- ``POST consola/flasheo/configuracion/``      arma el ``secrets.py`` de un dispositivo registrado:
  crea una contraseña MQTT nueva, la da de alta en Mosquitto y recarga el broker.

Las imágenes y el código salen de ``IoT/micropython`` del mismo repositorio que corre el
servidor, así la placa recibe exactamente la versión desplegada.
"""

import base64
import hashlib
import re
import secrets as aleatorio
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from apps.dispositivos.models import Dispositivo
from common import roles

from .views import ConsolaMixin

# chip (como lo nombra esptool) → (patrón de la imagen, dirección donde se graba)
CHIPS = {
    "ESP32": ("ESP32_GENERIC-*.bin", 0x1000),
    "ESP32-S3": ("ESP32_GENERIC_S3-*.bin", 0x0),
}
# Lo que se copia a la placa. Nunca secrets.py (se genera) ni lo que no es del firmware.
PATRONES = (
    "boot.py",
    "main.py",
    "config.py",
    "actualizacion.py",
    "nucleo/*.py",
    "nucleo/raices.pem",
    "lib/*.py",
    "lib/*/*.py",
)
_CODIGO = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


class FlasheoError(Exception):
    pass


def carpeta():
    return Path(settings.NUCLEO_IOT_DIR)


def imagen(chip):
    patron, direccion = CHIPS[chip]
    encontradas = sorted((carpeta() / "firmware").glob(patron))
    # ESP32_GENERIC-* también coincide con ESP32_GENERIC_S3-* en algunos patrones: se filtra.
    if chip == "ESP32":
        encontradas = [r for r in encontradas if "_S3" not in r.name]
    return (encontradas[-1] if encontradas else None), direccion


def archivos():
    origen = carpeta()
    vistos = []
    for patron in PATRONES:
        for ruta in sorted(origen.glob(patron)):
            relativa = ruta.relative_to(origen).as_posix()
            if "__pycache__" in relativa or relativa == "secrets.py" or relativa in vistos:
                continue
            vistos.append(relativa)
    return vistos


def version():
    try:
        texto = (carpeta() / "config.py").read_text(encoding="utf-8")
    except OSError:
        return None
    hallada = re.search(r'^FIRMWARE_VERSION\s*=\s*"([^"]+)"', texto, re.MULTILINE)
    return hallada.group(1) if hallada else None


# --- Mosquitto -------------------------------------------------------------------------------


def hash_mosquitto(clave, iteraciones=101):
    """Formato ``$7$`` de mosquitto_passwd (PBKDF2-SHA512)."""
    sal = aleatorio.token_bytes(12)
    resumen = hashlib.pbkdf2_hmac("sha512", clave.encode(), sal, iteraciones)
    return f"$7${iteraciones}${base64.b64encode(sal).decode()}${base64.b64encode(resumen).decode()}"


def alta_mqtt(codigo, clave):
    """Crea o cambia el usuario MQTT del dispositivo y recarga el broker. Devuelve un aviso o ""."""
    if not _CODIGO.match(codigo) or codigo == "nucleo_backend":
        raise FlasheoError("El código MQTT del dispositivo no es válido para el broker.")
    archivo = Path(settings.NUCLEO_MOSQUITTO_PASSWD)
    if not archivo.parent.is_dir():
        raise FlasheoError("No se encontró la configuración de Mosquitto en el servidor.")
    lineas = archivo.read_text().splitlines() if archivo.exists() else []
    lineas = [ln for ln in lineas if ln.split(":", 1)[0] != codigo]
    lineas.append(f"{codigo}:{hash_mosquitto(clave)}")
    with tempfile.NamedTemporaryFile("w", dir=archivo.parent, delete=False) as tmp:
        tmp.write("\n".join(lineas) + "\n")
    Path(tmp.name).chmod(0o644)
    Path(tmp.name).replace(archivo)
    contenedor = settings.NUCLEO_MOSQUITTO_CONTENEDOR
    if not contenedor:
        return ""
    try:
        # Argumentos fijos y el nombre del contenedor viene de la configuración, no del usuario.
        subprocess.run(  # noqa: S603
            ["docker", "kill", "-s", "HUP", contenedor],  # noqa: S607
            check=True,
            capture_output=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return "El broker no se pudo recargar; tomará la contraseña al reiniciarse."
    return ""


# --- secrets.py ------------------------------------------------------------------------------


def texto_secrets(dispositivo, clave_mqtt, redes, puente):
    host = settings.NUCLEO_ESP_HOST
    ssid, contrasena = redes[0]
    lineas = [
        f'"""Configuración de {dispositivo.nombre} ({dispositivo.codigo_mqtt}). La generó la '
        f'consola de administración el {timezone.localtime():%d/%m/%Y %H:%M}."""',
        "",
        f"WIFI_SSID = {ssid!r}",
        f"WIFI_PASSWORD = {contrasena!r}",
    ]
    if len(redes) > 1:
        lineas.append(f"REDES = {[tuple(r) for r in redes[1:]]!r}")
    lineas += [
        "",
        f"CODIGO_MQTT = {dispositivo.codigo_mqtt!r}",
        f"MQTT_HOST = {host!r}",
        "MQTT_PUERTO = 443",
        'MQTT_WS = "/mqtt"',
        'MQTT_CA = "nucleo/raices.pem"',
        f"MQTT_PASSWORD = {clave_mqtt!r}",
    ]
    if settings.IA_PUENTE_CLAVE:
        lineas += ["", f"PUENTE_HOST = {host!r}", f"PUENTE_CLAVE = {settings.IA_PUENTE_CLAVE!r}"]
    if puente:
        lineas.append('MODO = "puente"')
    return "\n".join(lineas) + "\n"


# --- Vistas ----------------------------------------------------------------------------------


class FlasheoView(ConsolaMixin, APIView):
    def get(self, request):
        chips = []
        for chip in CHIPS:
            ruta, direccion = imagen(chip)
            if ruta:
                chips.append(
                    {
                        "chip": chip,
                        "archivo": ruta.name,
                        "direccion": direccion,
                        "tamano": ruta.stat().st_size,
                    }
                )
        return Response(
            {
                "version": version(),
                "micropython": chips,
                "archivos": len(archivos()),
                "puente_ia": bool(settings.IA_PUENTE_CLAVE),
            }
        )


class MicropythonView(ConsolaMixin, APIView):
    def get(self, request, chip):
        if chip not in CHIPS:
            raise NotFound("No hay MicroPython para ese chip.")
        ruta, _ = imagen(chip)
        if not ruta:
            raise NotFound("No hay MicroPython para ese chip.")
        return FileResponse(
            ruta.open("rb"), content_type="application/octet-stream", filename=ruta.name
        )


class ArchivosView(ConsolaMixin, APIView):
    def get(self, request):
        origen = carpeta()
        return Response(
            {
                "version": version(),
                "archivos": [
                    {"ruta": r, "contenido": base64.b64encode((origen / r).read_bytes()).decode()}
                    for r in archivos()
                ],
            }
        )


class _Red(serializers.Serializer):
    ssid = serializers.CharField(max_length=32)
    password = serializers.CharField(max_length=64, allow_blank=True)


class _Configuracion(serializers.Serializer):
    dispositivo = serializers.IntegerField()
    redes = _Red(many=True, min_length=1, max_length=5)
    puente = serializers.BooleanField(default=False)


class ConfiguracionView(ConsolaMixin, APIView):
    def post(self, request):
        datos = _Configuracion(data=request.data)
        datos.is_valid(raise_exception=True)
        d = datos.validated_data
        dispositivo = (
            Dispositivo.objects.select_related("area")
            .exclude(estado_dispositivo_id=roles.DISPOSITIVO_BAJA)
            .filter(pk=d["dispositivo"])
            .first()
        )
        if dispositivo is None:
            raise ValidationError({"dispositivo": ["Ese dispositivo no existe o está de baja."]})
        clave = aleatorio.token_urlsafe(18)
        try:
            aviso = alta_mqtt(dispositivo.codigo_mqtt, clave)
        except (FlasheoError, OSError) as error:
            raise ValidationError({"detail": str(error)}) from None
        if settings.IA_PUENTE_CLAVE and not dispositivo.puente_ia:
            dispositivo.puente_ia = True
            dispositivo.save(update_fields=["puente_ia"])
        registrar(
            RegistroAuditoria.Accion.MODIFICAR,
            organizacion_id=dispositivo.area.organizacion_id,
            recurso="dispositivo",
            recurso_num=dispositivo.pk,
            descripcion=f"Cargó firmware y generó credenciales MQTT nuevas de "
            f"{dispositivo.nombre} ({dispositivo.codigo_mqtt}).",
            request=request,
        )
        redes = [(r["ssid"], r["password"]) for r in d["redes"]]
        return Response(
            {
                "codigo_mqtt": dispositivo.codigo_mqtt,
                "secrets": texto_secrets(dispositivo, clave, redes, d["puente"]),
                "aviso": aviso,
            }
        )
