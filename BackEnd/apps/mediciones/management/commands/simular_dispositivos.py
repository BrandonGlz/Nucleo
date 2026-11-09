import random
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections
from django.utils import timezone

from apps.dispositivos.models import Dispositivo
from apps.mediciones.services import MensajeInvalido, procesar_mensaje
from apps.mediciones.simulacion import Generador
from common import roles

SENSOR_DE = {"TEMP": "DHT22", "HUM": "DHT22", "AIRE": "CCS811"}
EN_SERVICIO = (
    roles.DISPOSITIVO_EN_LINEA,
    roles.DISPOSITIVO_BATERIA_BAJA,
    roles.DISPOSITIVO_CALENTANDO,
)


class Command(BaseCommand):
    help = (
        "Simula los ESP32 de los dispositivos en servicio: cada uno manda, a su intervalo de "
        "muestreo, un mensaje con el mismo formato que el firmware. Por defecto el mensaje entra "
        "directo a la ingesta (lecturas, alertas y eventos en vivo); con --mqtt se publica en el "
        "broker y lo recibe escuchar_mqtt, como un equipo real."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dispositivo", action="append", help="Código MQTT a simular (repetible)."
        )
        parser.add_argument(
            "--excluir",
            action="append",
            default=None,
            help="Código MQTT que no se simula (repetible). Por defecto NUC-001, el ESP32 real.",
        )
        parser.add_argument(
            "--mqtt", action="store_true", help="Publica en el broker en lugar de ingerir."
        )
        parser.add_argument(
            "--velocidad",
            type=float,
            default=1.0,
            help="Divide los intervalos (2 = el doble de rápido).",
        )
        parser.add_argument(
            "--una-vez", action="store_true", help="Manda un mensaje por dispositivo y termina."
        )

    def handle(self, *args, dispositivo, excluir, mqtt, velocidad, una_vez, **opciones):
        if not settings.DEBUG:
            raise CommandError("Este comando solo se ejecuta con DJANGO_DEBUG=True.")
        excluir = set(excluir if excluir is not None else ["NUC-001"])
        consulta = Dispositivo.objects.select_related("area").filter(
            estado_dispositivo_id__in=EN_SERVICIO
        )
        if dispositivo:
            consulta = consulta.filter(codigo_mqtt__in=dispositivo)
        equipos = [d for d in consulta if d.codigo_mqtt not in excluir]
        if not equipos:
            raise CommandError("No hay dispositivos en servicio que simular.")

        enviar = self._por_mqtt() if mqtt else self._directo
        generadores = {d.pk: Generador(d.area.nombre, semilla=d.codigo_mqtt) for d in equipos}
        baterias = {d.pk: float(d.nivel_bateria or 100) for d in equipos}
        siguiente = {d.pk: 0.0 for d in equipos}
        self.stdout.write(
            f"Simulando {len(equipos)} dispositivos ({'MQTT' if mqtt else 'ingesta directa'}). "
            "Ctrl+C para detener."
        )
        try:
            while True:
                ahora = time.monotonic()
                for d in equipos:
                    if ahora < siguiente[d.pk]:
                        continue
                    baterias[d.pk] = max(baterias[d.pk] - random.uniform(0, 0.02), 0)
                    fecha = timezone.now()
                    carga = {
                        "dispositivo": d.codigo_mqtt,
                        "fecha_hora": fecha.isoformat(),
                        "bateria": round(baterias[d.pk]),
                        "aire_estabilizado": True,
                        "lecturas": [
                            {
                                "sensor": SENSOR_DE[v],
                                "variable": v,
                                "valor": generadores[d.pk].valor(v, fecha),
                            }
                            for v in ("TEMP", "HUM", "AIRE")
                        ],
                    }
                    enviar(carga)
                    siguiente[d.pk] = ahora + d.intervalo_muestreo_seg / velocidad
                if una_vez:
                    return
                time.sleep(0.5)
        except KeyboardInterrupt:
            self.stdout.write("Simulación detenida.")

    def _directo(self, carga):
        close_old_connections()
        try:
            resultado = procesar_mensaje(carga)
        except MensajeInvalido as error:
            self.stderr.write(f"{carga['dispositivo']}: {error}")
            return
        valores = ", ".join(f"{x['variable']} {x['valor']}" for x in carga["lecturas"])
        alertas = f" · {len(resultado.alertas)} alerta(s)" if resultado.alertas else ""
        self.stdout.write(f"{carga['dispositivo']}: {valores}{alertas}")

    def _por_mqtt(self):
        from apps.mediciones.mqtt import ClienteMQTT

        cliente = ClienteMQTT.obtener()

        def enviar(carga):
            topico = settings.MQTT_TOPIC_LECTURAS.replace("+", carga["dispositivo"])
            cliente.publicar(topico, carga)
            self.stdout.write(f"{topico}: {len(carga['lecturas'])} lecturas")

        return enviar
