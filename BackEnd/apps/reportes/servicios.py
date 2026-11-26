"""Cálculo de cifras y generación de reportes."""

import calendar
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Avg, Count, Max, Min, Sum
from django.db.models.functions import TruncDay, TruncHour
from django.utils import timezone

from apps.alertas.models import Alerta
from apps.avisos import servicios as avisos
from apps.catalogos.models import VariableAmbiental
from apps.dispositivos.models import Sensor
from apps.mediciones.models import Lectura
from apps.organizaciones.models import Area
from apps.reportes import formatos, ia, pdf
from apps.reportes.models import ProgramacionReporte, Reporte
from apps.usuarios.models import Usuario
from common import correo, roles
from common.fechas import periodo_texto


def _numero(valor):
    return None if valor is None else float(Decimal(valor).quantize(Decimal("0.01")))


def texto_alcance(organizacion, area, areas):
    """Texto del alcance: área, lista de áreas, «4 áreas» o toda la organización."""
    if areas:
        nombres = list(
            Area.objects.filter(organizacion=organizacion, num__in=areas)
            .order_by("nombre")
            .values_list("nombre", flat=True)
        )
        if len(nombres) > 3:
            return f"{len(nombres)} áreas"
        if len(nombres) == 2:
            return f"{nombres[0]} y {nombres[1]}"
        if len(nombres) == 3:
            return f"{nombres[0]}, {nombres[1]} y {nombres[2]}"
        return nombres[0] if nombres else "Toda la organización"
    return area.nombre if area is not None else "Toda la organización"


def calcular_cifras(organizacion, area, inicio, fin, dispositivo=None, areas=None):
    """Promedios, máximos, mínimos, picos y alertas del periodo.

    Las lecturas se consultan en TimescaleDB y las alertas en PostgreSQL; la IA no calcula
    ni inventa valores. Las lecturas del calentamiento del CCS811 (no estabilizadas) no
    entran en las cifras. ``areas`` filtra varias áreas; ``area`` se usa para una sola.
    """
    areas = list(areas or [])
    sensores = Sensor.objects.filter(dispositivo__area__organizacion=organizacion)
    alertas = Alerta.objects.filter(
        umbral__dispositivo__area__organizacion=organizacion,
        lectura_fecha_hora__gte=inicio,
        lectura_fecha_hora__lt=fin,
    )
    if areas:
        sensores = sensores.filter(dispositivo__area__in=areas)
        alertas = alertas.filter(umbral__dispositivo__area__in=areas)
    elif area is not None:
        sensores = sensores.filter(dispositivo__area=area)
        alertas = alertas.filter(umbral__dispositivo__area=area)
    if dispositivo is not None:  # gráficas que pide un operador: solo su dispositivo
        sensores = sensores.filter(dispositivo=dispositivo)
        alertas = alertas.filter(umbral__dispositivo=dispositivo)
    dispositivo_de = dict(sensores.values_list("num", "dispositivo__codigo_mqtt"))
    catalogo = {v.codigo: v for v in VariableAmbiental.objects.all()}

    lecturas = Lectura.objects.filter(
        sensor_num__in=list(dispositivo_de),
        fecha_hora__gte=inicio,
        fecha_hora__lt=fin,
        estabilizada=True,
    )

    variables = {}
    for fila in lecturas.values("variable_codigo").annotate(
        promedio=Sum("valor") / Count("num"),
        minimo=Min("valor"),
        maximo=Max("valor"),
        muestras=Count("num"),
    ):
        codigo = fila["variable_codigo"]
        de_la_variable = lecturas.filter(variable_codigo=codigo)
        pico = de_la_variable.order_by("-valor", "fecha_hora").first()
        valle = de_la_variable.order_by("valor", "fecha_hora").first()
        variables[codigo] = {
            "nombre": catalogo[codigo].nombre,
            "unidad": catalogo[codigo].unidad,
            "promedio": _numero(fila["promedio"]),
            "minimo": _numero(fila["minimo"]),
            "maximo": _numero(fila["maximo"]),
            "muestras": fila["muestras"],
            "pico_maximo_en": pico.fecha_hora.isoformat(),
            "pico_minimo_en": valle.fecha_hora.isoformat(),
        }

    # Serie para las gráficas: promedio, mínimo y máximo por hora (periodos de hasta 3 días)
    # o por día. Cada variable queda como lista ordenada de puntos.
    por_hora = fin - inicio <= timedelta(days=3)
    truncar = TruncHour if por_hora else TruncDay
    series = {}
    for fila in (
        lecturas.annotate(tramo=truncar("fecha_hora"))
        .values("variable_codigo", "tramo")
        .annotate(promedio=Avg("valor"), minimo=Min("valor"), maximo=Max("valor"))
        .order_by("variable_codigo", "tramo")
    ):
        series.setdefault(fila["variable_codigo"], []).append(
            {
                "t": fila["tramo"].isoformat(),
                "promedio": _numero(fila["promedio"]),
                "minimo": _numero(fila["minimo"]),
                "maximo": _numero(fila["maximo"]),
            }
        )

    acumulado = {}
    for fila in lecturas.values("sensor_num", "variable_codigo").annotate(
        suma=Sum("valor"), minimo=Min("valor"), maximo=Max("valor"), muestras=Count("num")
    ):
        clave = (dispositivo_de[fila["sensor_num"]], fila["variable_codigo"])
        previo = acumulado.get(clave)
        if previo is None:
            acumulado[clave] = dict(fila)
        else:
            previo["suma"] += fila["suma"]
            previo["muestras"] += fila["muestras"]
            previo["minimo"] = min(previo["minimo"], fila["minimo"])
            previo["maximo"] = max(previo["maximo"], fila["maximo"])
    dispositivos = {}
    for (codigo_mqtt, variable), fila in acumulado.items():
        dispositivos.setdefault(codigo_mqtt, {})[variable] = {
            "promedio": _numero(fila["suma"] / fila["muestras"]),
            "minimo": _numero(fila["minimo"]),
            "maximo": _numero(fila["maximo"]),
        }

    return {
        "alcance": texto_alcance(organizacion, area, areas),
        "periodo": {"inicio": inicio.isoformat(), "fin": fin.isoformat()},
        "variables": variables,
        "intervalo_serie": "hora" if por_hora else "dia",
        "series": series,
        "dispositivos": dispositivos,
        "alertas": {
            "total": alertas.count(),
            "por_estado": dict(alertas.values_list("estado").annotate(n=Count("num"))),
            "por_nivel": dict(alertas.values_list("nivel").annotate(n=Count("num"))),
            "por_tipo": dict(alertas.values_list("tipo").annotate(n=Count("num"))),
            "por_variable": dict(
                alertas.values_list("umbral__variable_id").annotate(n=Count("num"))
            ),
        },
    }


def generar_reporte(
    organizacion,
    area,
    inicio,
    fin,
    origen,
    usuario=None,
    formato=None,
    areas=None,
):
    """Calcula las cifras, pide el texto a la IA y guarda el reporte con su PDF.

    Sin ``formato`` usa el predeterminado del área, el de la organización o la plantilla
    Operativo detallado. ``areas`` sirve para varias áreas; en ese caso ``area`` queda nula.
    Lanza ``ia.IANoDisponible`` si el servicio de IA falla; en ese caso no se guarda nada.
    """
    areas = list(dict.fromkeys(areas or []))
    if len(areas) == 1:
        # «Varias áreas» con una sola marcada es un reporte de esa área: así aplica su
        # formato predeterminado y la lista por área lo muestra.
        unica = Area.objects.filter(organizacion=organizacion, pk=areas[0]).first()
        if unica is not None:
            area = unica
            areas = []
    elif areas:
        area = None
    formato = formatos.formato_para(organizacion, area, formato)
    version = formato.version_actual() if formato is not None else None
    cifras = calcular_cifras(organizacion, area, inicio, fin, areas=areas)
    contenido = ia.redactar(cifras)
    with transaction.atomic():
        reporte = Reporte.objects.create(
            organizacion=organizacion,
            area=area,
            areas=areas,
            generado_por=usuario,
            origen=origen,
            formato_version=version,
            periodo_inicio=inicio,
            periodo_fin=fin,
            cifras=cifras,
            contenido=contenido,
        )
        reporte.refresh_from_db()
        reporte.archivo_pdf = pdf.guardar(reporte)
        reporte.save(update_fields=["archivo_pdf"])
    if origen != Reporte.Origen.PROGRAMADO:
        # El programado avisa al enviarse (``enviar_reporte``) a sus destinatarios.
        avisos.reporte_listo(reporte, usuario)
    return reporte


def desplazar(fecha, frecuencia, meses_o_periodos=1):
    """Mueve ``fecha`` uno o más periodos de la frecuencia (negativo para retroceder).

    La frecuencia mensual suma meses de calendario; si el día no existe en el mes de
    destino se usa el último día de ese mes.
    """
    if frecuencia == ProgramacionReporte.Frecuencia.DIARIA:
        return fecha + timedelta(days=meses_o_periodos)
    if frecuencia == ProgramacionReporte.Frecuencia.SEMANAL:
        return fecha + timedelta(weeks=meses_o_periodos)
    indice = fecha.year * 12 + fecha.month - 1 + meses_o_periodos
    anio, mes = divmod(indice, 12)
    mes += 1
    dia = min(fecha.day, calendar.monthrange(anio, mes)[1])
    return fecha.replace(year=anio, month=mes, day=dia)


def siguiente_ejecucion(
    frecuencia,
    hora=time(8, 0),
    dia_semana=None,
    dia_mes=None,
    desde=None,
):
    """Próxima ejecución futura de una programación, en la zona horaria del servidor.

    La hora y el día salen de la programación; ``desde`` es el instante desde el que se
    busca (por omisión, ahora). La semanal usa ``dia_semana`` (0 = lunes) y la mensual
    ``dia_mes`` (1–28).
    """
    desde = desde or timezone.now()
    if not timezone.is_aware(desde):
        desde = timezone.make_aware(desde)
    local = timezone.localtime(desde)
    zona = timezone.get_current_timezone()
    hora = hora or time(8, 0)

    def candidato(fecha):
        return timezone.make_aware(datetime.combine(fecha, hora), zona)

    if frecuencia == ProgramacionReporte.Frecuencia.DIARIA:
        proxima = candidato(local.date())
        if proxima <= local:
            proxima = candidato(local.date() + timedelta(days=1))
        return proxima

    if frecuencia == ProgramacionReporte.Frecuencia.SEMANAL:
        if dia_semana is None:
            raise ValueError("La programación semanal necesita un día de la semana.")
        dias = (dia_semana - local.weekday()) % 7
        proxima = candidato(local.date() + timedelta(days=dias))
        if proxima <= local:
            proxima = candidato(proxima.date() + timedelta(days=7))
        return proxima

    if frecuencia == ProgramacionReporte.Frecuencia.MENSUAL:
        if dia_mes is None:
            raise ValueError("La programación mensual necesita un día del mes.")
        anio, mes = local.year, local.month
        proxima = candidato(date(anio, mes, dia_mes))
        if proxima <= local:
            indice = anio * 12 + mes
            anio, mes = divmod(indice, 12)
            mes += 1
            proxima = candidato(date(anio, mes, dia_mes))
        return proxima

    raise ValueError("La frecuencia de la programación no es válida.")


def enviar_reporte(reporte, destinatarios, asunto=None):
    """Envía el reporte en PDF a los usuarios activos de su organización. Devuelve los correos."""
    correos = list(
        Usuario.objects.filter(
            pk__in=destinatarios,
            organizacion=reporte.organizacion,
            estado_usuario_id=roles.USUARIO_ACTIVO,
        ).values_list("correo", flat=True)
    )
    if correos:
        org = reporte.organizacion.nombre
        alcance = (reporte.cifras or {}).get("alcance") or (
            reporte.area.nombre if reporte.area_id else "Todas las áreas"
        )
        periodo = periodo_texto(reporte.periodo_inicio, reporte.periodo_fin)
        correo.enviar(
            correos,
            asunto or f"Reporte de {org} · {periodo}",
            titulo=f"Reporte de {org}",
            icono="file-text",
            etiqueta="Reporte",
            intro=(
                "Le escribe Nico. Preparé el reporte de monitoreo ambiental de este "
                "periodo; el documento completo va adjunto en PDF."
            ),
            filas=[("Organización", org), ("Alcance", alcance), ("Periodo", periodo)],
            parrafos=[reporte.contenido],
            boton=("Consultar reportes", correo.url_web("/reportes")),
            motivo="Recibe este reporte porque figura entre sus destinatarios en Núcleo.",
            adjuntos=[(f"reporte-{reporte.num}.pdf", pdf.construir(reporte), "application/pdf")],
        )
        avisos.reporte_enviado(reporte, destinatarios)
    return correos


def programaciones_vencidas(ahora):
    return ProgramacionReporte.objects.filter(
        activa=True, proxima_ejecucion__lte=ahora
    ).select_related("organizacion", "area", "formato")


def ejecutar_programacion(programacion, ahora):
    """Genera el reporte vencido de una programación y lo envía a sus destinatarios.

    El periodo termina en ``ahora`` y abarca una frecuencia hacia atrás. Después se
    calcula la siguiente ejecución. Lanza ``ia.IANoDisponible`` sin guardar nada, de modo
    que la programación sigue vencida y se reintenta en la siguiente corrida del cron.
    Devuelve ``(reporte, destinatarios)`` o ``None`` si la organización no está activa.
    """
    if not programacion.organizacion.esta_activa:
        return None
    inicio = desplazar(ahora, programacion.frecuencia, -1)
    reporte = generar_reporte(
        programacion.organizacion,
        programacion.area,
        inicio,
        ahora,
        Reporte.Origen.PROGRAMADO,
        usuario=programacion.creada_por,
        formato=programacion.formato,
        areas=programacion.areas,
    )
    correos = enviar_reporte(
        reporte,
        programacion.destinatarios,
        f"Reporte {programacion.get_frecuencia_display().lower()} "
        f"de {programacion.organizacion.nombre}",
    )

    programacion.ultima_ejecucion = ahora
    programacion.proxima_ejecucion = siguiente_ejecucion(
        programacion.frecuencia,
        programacion.hora,
        programacion.dia_semana,
        programacion.dia_mes,
        desde=ahora,
    )
    programacion.save(update_fields=["ultima_ejecucion", "proxima_ejecucion"])
    return reporte, correos
