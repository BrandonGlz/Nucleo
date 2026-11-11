"""Evalúa Nico AI con el banco de casos contra los datos reales de un dispositivo.

    manage.py evaluar_agente --dispositivo NC-0501
    manage.py evaluar_agente --dispositivo NC-0501 --fallas   # además, 👎 y no entendidas

No guarda nada: corre dentro de una transacción que se revierte.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.dispositivos.models import Dispositivo
from apps.reportes.evaluacion import evaluar
from apps.reportes.models import PreguntaAgente
from apps.usuarios.models import Usuario
from common import roles


class Command(BaseCommand):
    help = "Corre el banco de casos de Nico AI y muestra los aciertos."

    def add_arguments(self, parser):
        parser.add_argument("--dispositivo", required=True, help="Código MQTT, p. ej. NC-0501")
        parser.add_argument("--fallas", action="store_true", help="Lista 👎 y no entendidas")
        parser.add_argument("--dias", type=int, default=14)

    def handle(self, *args, **opciones):
        try:
            dispositivo = Dispositivo.objects.select_related("area").get(
                codigo_mqtt=opciones["dispositivo"]
            )
        except Dispositivo.DoesNotExist as error:
            raise CommandError("No existe ese dispositivo.") from error
        usuario = Usuario.objects.filter(
            organizacion_id=dispositivo.area.organizacion_id,
            rol_id=roles.ADMIN,
            estado_usuario_id=roles.USUARIO_ACTIVO,
        ).first()
        if usuario is None:
            raise CommandError("La organización del dispositivo no tiene un administrador activo.")
        resultados = evaluar(usuario, dispositivo)
        for r in resultados:
            marca = self.style.SUCCESS("✔") if r.ok else self.style.ERROR("✖")
            self.stdout.write(f"{marca} {r.caso['pregunta']}  [{r.intencion}]")
            for f in r.fallas:
                self.stdout.write(f"     {f}")
                self.stdout.write(f"     respuesta: {r.respuesta[:160]}")
        aciertos = sum(r.ok for r in resultados)
        self.stdout.write(f"\n{aciertos}/{len(resultados)} casos correctos.")
        if opciones["fallas"]:
            from datetime import timedelta

            from django.utils import timezone

            desde = timezone.now() - timedelta(days=opciones["dias"])
            malas = PreguntaAgente.objects.filter(fecha__gte=desde).filter(
                calificacion=-1
            ) | PreguntaAgente.objects.filter(fecha__gte=desde, via=PreguntaAgente.Via.NO_ENTENDIDA)
            self.stdout.write(f"\nPara convertir en casos (últimos {opciones['dias']} días):")
            for p in malas.order_by("-fecha")[:40]:
                motivo = "👎" if p.calificacion == -1 else "no entendida"
                self.stdout.write(f"  [{motivo}] {p.pregunta}")
