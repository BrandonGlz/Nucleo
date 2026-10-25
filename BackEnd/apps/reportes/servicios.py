"""Cálculo de cifras y generación de reportes."""

import calendar
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import transaction
from django.db.models import Avg, Count, Max, Min, Sum
from django.db.models.functions import TruncDay, TruncHour

from apps.alertas.models import Alerta
from apps.catalogos.models import VariableAmbiental
from apps.dispositivos.models import Sensor
from apps.mediciones.models import Lectura
from apps.reportes import ia, pdf
from apps.reportes.models import ProgramacionReporte, Reporte
from apps.usuarios.models import Usuario
from common import roles


def _numero(valor):
    return None if valor is None else float(Decimal(valor).quantize(Decimal("0.01")))


def calcular_cifras(organizacion, area, inicio, fin):
    """Promedios, máximos, mínimos, picos y alertas del periodo.

    Las lecturas se consultan en TimescaleDB y las alertas en PostgreSQL; la IA no calcula
    ni inventa valores. Las lecturas del calentamiento del CCS811 (no estabilizadas) no
    entran en las cifras.
    """
    sensores = Sensor.objects.filter(dispositivo__area__organizacion=organizacion)
    alertas = Alerta.objects.filter(
        umbral__dispositivo__area__organizacion=organizacion,
        lectura_fecha_hora__gte=inicio,
        lectura_fecha_hora__lt=fin,
    )
    if area is not None:
        sensores = sensores.filter(dispositivo__area=area)
        alertas = alertas.filter(umbral__dispositivo__area=area)
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


def generar_reporte(organizacion, area, inicio, fin, origen, usuario=None):
    """Calcula las cifras, pide el texto a la IA y guarda el reporte con su PDF.

    Lanza ``ia.IANoDisponible`` si el servicio de IA falla; en ese caso no se
    guarda nada.
    """
    cifras = calcular_cifras(organizacion, area, inicio, fin)
    contenido = ia.redactar(cifras)
    with transaction.atomic():
        reporte = Reporte.objects.create(
            organizacion=organizacion,
            area=area,
            generado_por=usuario,
            origen=origen,
            periodo_inicio=inicio,
            periodo_fin=fin,
            cifras=cifras,
            contenido=contenido,
        )
        reporte.refresh_from_db()
        reporte.archivo_pdf = pdf.guardar(reporte)
        reporte.save(update_fields=["archivo_pdf"])
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


def programaciones_vencidas(ahora):
    return ProgramacionReporte.objects.filter(
        activa=True, proxima_ejecucion__lte=ahora
    ).select_related("organizacion", "area")


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
    )
    correos = list(
        Usuario.objects.filter(
            pk__in=programacion.destinatarios,
            organizacion=programacion.organizacion,
            estado_usuario_id=roles.USUARIO_ACTIVO,
        ).values_list("correo", flat=True)
    )
    if correos:
        mensaje = EmailMessage(
            subject=(
                f"[Núcleo] Reporte {programacion.get_frecuencia_display().lower()} "
                f"de {programacion.organizacion.nombre}"
            ),
            body=reporte.contenido,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=correos,
        )
        mensaje.attach(f"reporte-{reporte.num}.pdf", pdf.construir(reporte), "application/pdf")
        mensaje.send()

    siguiente = programacion.proxima_ejecucion
    while siguiente <= ahora:
        siguiente = desplazar(siguiente, programacion.frecuencia, 1)
    programacion.ultima_ejecucion = ahora
    programacion.proxima_ejecucion = siguiente
    programacion.save(update_fields=["ultima_ejecucion", "proxima_ejecucion"])
    return reporte, correos
