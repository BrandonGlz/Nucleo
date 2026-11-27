"""Mide el tiempo de cada página de las plantillas de Analítica.

Uso:
    manage.py medir_analitica [--periodo 30d] [--usuario <num>]

Sin ``--usuario`` elige el ADMIN con más sensores visibles. Llama a
``servicio.consultar(..., usar_cache=False)`` para medir el camino real sin caché.
"""

import time

from django.core.management.base import BaseCommand, CommandError

from apps.analitica import catalogo, servicio
from apps.analitica.models import TableroAnalitica
from apps.usuarios.models import Usuario
from common import roles
from common.scoping import sensores_visibles


class Command(BaseCommand):
    help = "Mide las páginas de las cuatro plantillas de Analítica sin caché."

    def add_arguments(self, parser):
        parser.add_argument("--periodo", default="30d", help="Periodo de la consulta (30d, 90d…).")
        parser.add_argument("--usuario", type=int, help="Número del usuario con el que medir.")

    def _usuario(self, numero):
        if numero is not None:
            usuario = Usuario.objects.filter(pk=numero).select_related("organizacion").first()
            if usuario is None:
                raise CommandError(f"No existe el usuario {numero}.")
            if usuario.organizacion is None:
                raise CommandError("El usuario no pertenece a una organización.")
            return usuario
        candidatos = Usuario.objects.filter(
            rol_id=roles.ADMIN,
            organizacion__isnull=False,
        ).select_related("organizacion")
        mejor = None
        mejor_total = -1
        for usuario in candidatos:
            total = sensores_visibles(usuario).count()
            if total > mejor_total:
                mejor = usuario
                mejor_total = total
        if mejor is None:
            raise CommandError("No hay ningún ADMIN de organización para medir.")
        return mejor

    def handle(self, *args, **opciones):
        usuario = self._usuario(opciones.get("usuario"))
        periodo = opciones["periodo"]
        tableros = TableroAnalitica.objects.filter(organizacion__isnull=True).order_by("nombre")
        if not tableros.exists():
            raise CommandError("No hay plantillas de Analítica.")

        total_sensores = sensores_visibles(usuario).count()
        self.stdout.write(
            f"Usuario: {usuario.pk} · {usuario.get_full_name()} "
            f"({usuario.organizacion.nombre}) · {total_sensores} sensores"
        )
        self.stdout.write(f"Periodo: {periodo} · sin caché")
        self.stdout.write("")
        self.stdout.write(f"{'Tablero › página':<44} {'Tarjetas':>8} {'Tiempo':>9}")
        self.stdout.write("-" * 64)
        total_tarjetas = 0
        for tablero in tableros:
            version = tablero.version_actual()
            if version is None:
                continue
            conf = version.conf
            filtros = {
                "periodo": periodo,
                "variable": (conf.get("filtros") or {}).get("variable", "TEMP"),
            }
            for pagina in conf.get("paginas", []):
                tarjetas = catalogo.validar_tarjetas(pagina.get("tarjetas", []))
                comienzo = time.perf_counter()
                respuesta = servicio.consultar(
                    usuario,
                    tarjetas,
                    filtros,
                    usar_cache=False,
                )
                transcurrido = time.perf_counter() - comienzo
                total_tarjetas += len(tarjetas)
                errores = sum(1 for datos in respuesta["tarjetas"].values() if "error" in datos)
                etiqueta = f"{tablero.nombre} › {pagina.get('nombre', '')}"
                aviso = f" ({errores} errores)" if errores else ""
                self.stdout.write(
                    f"{etiqueta:<44} {len(tarjetas):>8} {transcurrido:>8.2f} s{aviso}"
                )
        self.stdout.write("-" * 64)
        self.stdout.write(f"{'Total':<44} {total_tarjetas:>8}")
