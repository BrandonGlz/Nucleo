"""Estado del puente de Nico AI por dispositivo y el último diagnóstico de red del ESP.

Sirve para separar una falla de la red (señal baja, red sin salida, autenticación rechazada)
de una falla del ESP (memoria, errores internos): el ESP reporta en cada consulta su red, la
señal, cuántas veces se reconectó, la última falla y la memoria libre.
"""

import time

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.dispositivos.models import Dispositivo
from apps.reportes import puente

CAMPOS = {
    "red": "Red",
    "rssi": "Señal (dBm)",
    "rec": "Reconexiones de Wi-Fi",
    "falla": "Última falla",
    "mem": "Memoria libre (bytes)",
    "up": "Encendido (s)",
    "modo": "Modo",
}


class Command(BaseCommand):
    help = "Muestra si cada ESP puente está activo y su último diagnóstico de red."

    def handle(self, *args, **opciones):
        codigos = settings.IA_PUENTE_DISPOSITIVOS or list(
            Dispositivo.objects.values_list("codigo_mqtt", flat=True)
        )
        for codigo in codigos:
            d = Dispositivo.objects.filter(codigo_mqtt=codigo).first()
            activo = puente.activo(d) if d else False
            self.stdout.write(f"{codigo}: {'activo' if activo else 'inactivo'}")
            diag = puente.diagnostico(codigo)
            if not diag:
                self.stdout.write("  sin diagnóstico (el ESP aún no lo envía)")
                continue
            hace = int(time.time() - diag["hora"])
            self.stdout.write(f"  último reporte hace {hace} s")
            for clave, valor in diag["datos"].items():
                self.stdout.write(f"  {CAMPOS.get(clave, clave)}: {valor}")
