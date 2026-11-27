"""Periodos, alcance y filtro cruzado de las consultas de Analítica.

Los periodos se manejan como ``[inicio, fin)`` en la zona horaria del servidor, igual que
los reportes. El alcance sale de ``common.scoping``: un área o un dispositivo pedido fuera
del alcance del usuario responde 403, no se ignora.
"""

import calendar
from dataclasses import dataclass, field, replace
from datetime import datetime, time, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.alertas.models import Alerta
from apps.analitica import catalogo
from apps.catalogos.models import VariableAmbiental
from apps.umbrales.models import Umbral
from common.scoping import areas_visibles, dispositivos_visibles, sensores_visibles

# Periodos que se pueden pedir en la barra. ``personalizado`` usa desde/hasta.
PERIODO_HOY = "hoy"
PERIODO_24H = "24h"
PERIODO_7D = "7d"
PERIODO_30D = "30d"
PERIODO_MES = "mes"
PERIODO_MES_ANTERIOR = "mes_anterior"
PERIODO_90D = "90d"
PERIODO_PERSONALIZADO = "personalizado"
PERIODOS = catalogo.PERIODOS
DIAS_MAXIMOS = 366
VARIABLES = tuple(codigo for codigo in catalogo.VARIABLES if codigo)
VARIABLE_FIJA = catalogo.VARIABLE_FIJA
ESTADOS = ("PENDIENTE", "ATENDIDA", "DESCARTADA")
NIVELES = ("ADVERTENCIA", "PELIGRO")
DIMENSIONES = ("area", "dispositivo", "variable", "nivel", "estado")
CLAVES_FILTROS = {"periodo", "desde", "hasta", "areas", "dispositivos", "variable"}
CLAVES_CRUZADO = {"dimension", "valor", "origen"}


def _local(fecha):
    if timezone.is_naive(fecha):
        return timezone.make_aware(fecha)
    return timezone.localtime(fecha)


def _ahora(ahora=None):
    return _local(ahora or timezone.now())


def _mes_relativo(fecha, meses):
    """Mueve una fecha los meses indicados; si el día no existe, usa el último del mes."""
    local = _local(fecha)
    total = local.year * 12 + (local.month - 1) + meses
    year, mes = divmod(total, 12)
    mes += 1
    dia = min(local.day, calendar.monthrange(year, mes)[1])
    return local.replace(year=year, month=mes, day=dia)


def _fecha_cruda(valor, campo, fin=False):
    """Convierte una fecha ISO o un ``YYYY-MM-DD`` a un instante local.

    En un filtro personalizado, una fecha sin hora para ``hasta`` significa «todo ese día»,
    así que se convierte en la medianoche siguiente (fin exclusivo).
    """
    if not isinstance(valor, str) or not valor.strip():
        raise ValidationError({campo: "La fecha no es válida."})
    valor = valor.strip()
    # ``parse_datetime`` acepta «2026-11-10» como medianoche; para «hasta» eso dejaría
    # fuera el día elegido, así que las fechas sin hora se tratan como días completos.
    if len(valor) == 10 and valor[4] == "-" and valor[7] == "-":
        dia = parse_date(valor)
        if dia is None:
            raise ValidationError({campo: "La fecha no es válida."})
        instante = datetime.combine(dia, time.min)
        if fin:
            instante += timedelta(days=1)
        return timezone.make_aware(instante)
    fecha = parse_datetime(valor)
    if fecha is not None:
        return _local(fecha)
    dia = parse_date(valor)
    if dia is None:
        raise ValidationError({campo: "La fecha no es válida."})
    instante = datetime.combine(dia, time.min)
    if fin:
        instante += timedelta(days=1)
    return timezone.make_aware(instante)


def _lista_enteros(valor, campo):
    if valor in (None, "", []):
        return []
    if isinstance(valor, str):
        partes = [parte.strip() for parte in valor.split(",") if parte.strip()]
    elif isinstance(valor, (list, tuple)):
        partes = list(valor)
    else:
        raise ValidationError({campo: f"«{campo}» debe ser una lista de números."})
    numeros = []
    for parte in partes:
        if isinstance(parte, bool):
            raise ValidationError({campo: f"«{campo}» debe ser una lista de números."})
        if isinstance(parte, int):
            numero = parte
        elif isinstance(parte, str) and parte.isdigit():
            numero = int(parte)
        else:
            raise ValidationError({campo: f"«{campo}» debe ser una lista de números."})
        if numero <= 0:
            raise ValidationError({campo: f"«{campo}» debe tener números mayores que cero."})
        if numero not in numeros:
            numeros.append(numero)
    return numeros


def _periodo(periodo, filtros, ahora):
    if periodo == PERIODO_HOY:
        inicio = _local(ahora).replace(hour=0, minute=0, second=0, microsecond=0)
        return inicio, inicio + timedelta(days=1)
    if periodo == PERIODO_24H:
        return ahora - timedelta(hours=24), ahora
    if periodo in (PERIODO_7D, PERIODO_30D, PERIODO_90D):
        dias = {"7d": 7, "30d": 30, "90d": 90}[periodo]
        return ahora - timedelta(days=dias), ahora
    if periodo == PERIODO_MES:
        inicio = _local(ahora).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return inicio, ahora
    if periodo == PERIODO_MES_ANTERIOR:
        fin = _local(ahora).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return _mes_relativo(fin, -1), fin
    if periodo == PERIODO_PERSONALIZADO:
        if not filtros.get("desde") or not filtros.get("hasta"):
            raise ValidationError(
                {"periodo": "El periodo personalizado necesita «desde» y «hasta»."}
            )
        inicio = _fecha_cruda(filtros["desde"], "desde")
        fin = _fecha_cruda(filtros["hasta"], "hasta", fin=True)
        if fin <= inicio:
            raise ValidationError({"hasta": "El fin debe ser posterior al inicio."})
        if fin - inicio > timedelta(days=DIAS_MAXIMOS):
            raise ValidationError(
                {"hasta": f"El periodo personalizado no puede pasar de {DIAS_MAXIMOS} días."}
            )
        return inicio, fin
    raise ValidationError({"periodo": f"El periodo «{periodo}» no es válido."})


def _periodo_previo(periodo, inicio, fin):
    if periodo in (PERIODO_MES, PERIODO_MES_ANTERIOR):
        return _mes_relativo(inicio, -1), _mes_relativo(fin, -1)
    duracion = fin - inicio
    return inicio - duracion, inicio


def intervalo_para(inicio, fin):
    """Intervalo automático de las series: 15 min, 1 h, 1 día o 1 semana."""
    duracion = fin - inicio
    if duracion <= timedelta(days=2):
        return "15m"
    if duracion <= timedelta(days=14):
        return "1h"
    if duracion <= timedelta(days=92):
        return "1d"
    return "1sem"


INTERVALOS_SQL = {
    "15m": "15 minutes",
    "1h": "1 hour",
    "1d": "1 day",
    "1sem": "7 days",
}


def _variable(valor):
    if valor is None:
        return ""
    if not isinstance(valor, str):
        raise ValidationError({"variable": "La variable no es válida."})
    valor = valor.strip().upper()
    if valor in ("", "TODAS", "TODO"):
        return ""
    if valor not in VARIABLES:
        raise ValidationError(
            {"variable": "La variable debe ser «Todas», «TEMP», «HUM» o «AIRE»."}
        )
    return valor


def _cruzado(valor, areas, dispositivos):
    if valor in (None, {}, ""):
        return None
    if not isinstance(valor, dict):
        raise ValidationError({"cruzado": "El filtro cruzado debe ser un objeto."})
    desconocidas = set(valor) - CLAVES_CRUZADO
    if desconocidas:
        raise ValidationError(
            {"cruzado": f"El filtro cruzado no admite «{sorted(desconocidas)[0]}»."}
        )
    dimension = valor.get("dimension")
    if dimension not in DIMENSIONES:
        raise ValidationError({"cruzado": "La dimensión del filtro cruzado no es válida."})
    if "valor" not in valor or valor["valor"] in (None, ""):
        raise ValidationError({"cruzado": "El filtro cruzado necesita un valor."})
    crudo = valor["valor"]
    if dimension == "area":
        numero = _numero_positivo(crudo, "cruzado")
        if numero not in {area.num for area in areas}:
            raise PermissionDenied("El área del filtro cruzado no está a su alcance.")
        normalizado = numero
    elif dimension == "dispositivo":
        numero = _numero_positivo(crudo, "cruzado")
        if numero not in {dispositivo.num for dispositivo in dispositivos}:
            raise PermissionDenied("El dispositivo del filtro cruzado no está a su alcance.")
        normalizado = numero
    elif dimension == "variable":
        if not isinstance(crudo, str) or crudo.strip().upper() not in VARIABLES:
            raise ValidationError({"cruzado": "La variable del filtro cruzado no es válida."})
        normalizado = crudo.strip().upper()
    elif dimension == "nivel":
        if not isinstance(crudo, str) or crudo.strip().upper() not in NIVELES:
            raise ValidationError({"cruzado": "El nivel del filtro cruzado no es válido."})
        normalizado = crudo.strip().upper()
    else:
        if not isinstance(crudo, str) or crudo.strip().upper() not in ESTADOS:
            raise ValidationError({"cruzado": "El estado del filtro cruzado no es válido."})
        normalizado = crudo.strip().upper()
    origen = valor.get("origen")
    if origen is not None and not isinstance(origen, str):
        raise ValidationError({"cruzado": "El origen del filtro cruzado no es válido."})
    resultado = {"dimension": dimension, "valor": normalizado}
    if origen:
        resultado["origen"] = origen
    return resultado


def _numero_positivo(valor, campo):
    if isinstance(valor, bool):
        raise ValidationError({campo: "El valor debe ser un número."})
    if isinstance(valor, int):
        numero = valor
    elif isinstance(valor, str) and valor.isdigit():
        numero = int(valor)
    else:
        raise ValidationError({campo: "El valor debe ser un número."})
    if numero <= 0:
        raise ValidationError({campo: "El valor debe ser mayor que cero."})
    return numero


@dataclass
class Consulta:
    """Alcance resuelto de una consulta de Analítica.

    ``variable`` es el filtro global (vacío = Todas). Las tarjetas que siguen el filtro usan
    ``variable_efectiva``; las que fijan una variable la conservan. ``cruzado`` se aplica a
    todas las tarjetas menos a la de origen con ``para_tarjeta``.
    """

    usuario: object
    inicio: datetime
    fin: datetime
    previo_inicio: datetime
    previo_fin: datetime
    periodo: str
    intervalo: str
    variable: str
    areas: list = field(default_factory=list)
    dispositivos: list = field(default_factory=list)
    sensores: list = field(default_factory=list)
    variables: dict = field(default_factory=dict)
    cruzado: dict | None = None
    estado: str | None = None
    nivel: str | None = None
    # Memoria de la petición: evita repetir el mismo cálculo en varias tarjetas.
    memo: dict = field(default_factory=dict, repr=False)

    @property
    def area_ids(self):
        return tuple(area.num for area in self.areas)

    @property
    def dispositivo_ids(self):
        return tuple(dispositivo.num for dispositivo in self.dispositivos)

    @property
    def sensor_ids(self):
        return tuple(sensor.num for sensor in self.sensores)

    @property
    def duracion(self):
        return self.fin - self.inicio

    def info_variable(self, codigo):
        info = self.variables.get(codigo)
        if info is None:
            return {"codigo": codigo, "nombre": codigo, "unidad": "", "decimales": 1}
        return {
            "codigo": codigo,
            "nombre": info.nombre,
            "unidad": info.unidad,
            "decimales": 0 if info.unidad == "ppm" else 1,
        }

    def restringir(
        self,
        area_ids=None,
        dispositivo_ids=None,
        variable=None,
        estado=None,
        nivel=None,
    ):
        """Devuelve una copia con menos áreas, dispositivos o variable."""
        areas = self.areas
        if area_ids is not None:
            areas = [area for area in areas if area.num in set(area_ids)]
        ids_areas = {area.num for area in areas}
        dispositivos = self.dispositivos
        if area_ids is not None:
            dispositivos = [
                dispositivo for dispositivo in dispositivos if dispositivo.area_id in ids_areas
            ]
        if dispositivo_ids is not None:
            ids_dispositivos = set(dispositivo_ids)
            dispositivos = [
                dispositivo
                for dispositivo in dispositivos
                if dispositivo.num in ids_dispositivos
            ]
        ids_dispositivos = {dispositivo.num for dispositivo in dispositivos}
        sensores = [
            sensor for sensor in self.sensores if sensor.dispositivo_id in ids_dispositivos
        ]
        return replace(
            self,
            areas=areas,
            dispositivos=dispositivos,
            sensores=sensores,
            variable=self.variable if variable is None else variable,
            estado=self.estado if estado is None else estado,
            nivel=self.nivel if nivel is None else nivel,
            memo=dict(self.memo),
        )

    def para_tarjeta(self, tarjeta):
        """Aplica el filtro cruzado, salvo a la tarjeta que lo originó."""
        if not self.cruzado:
            return self
        if self.cruzado.get("origen") == tarjeta.get("id"):
            return self
        dimension = self.cruzado["dimension"]
        valor = self.cruzado["valor"]
        if dimension == "area":
            return self.restringir(area_ids=(valor,))
        if dimension == "dispositivo":
            return self.restringir(dispositivo_ids=(valor,))
        if dimension == "variable":
            return self.restringir(variable=valor)
        if dimension == "estado":
            return self.restringir(estado=valor)
        return self.restringir(nivel=valor)

    def variable_efectiva(self, tarjeta):
        opciones = tarjeta.get("opciones") or {}
        opcion = opciones.get("variable")
        if opcion not in (None, "filtro"):
            return opcion
        return self.variable or VARIABLE_FIJA

    def variables_solicitadas(self):
        """Variables del alcance en el orden del catálogo."""
        return [codigo for codigo in VARIABLES if codigo in self.variables]

    def umbrales(self, variable=None, dispositivo_id=None):
        if not self.dispositivo_ids:
            return []
        consulta = Umbral.objects.filter(
            dispositivo_id__in=self.dispositivo_ids,
            activo=True,
        ).select_related("variable")
        if dispositivo_id is not None:
            consulta = consulta.filter(dispositivo_id=dispositivo_id)
        if variable is not None:
            consulta = consulta.filter(variable_id=variable)
        return list(consulta)

    @property
    def alertas_base(self):
        if not self.dispositivo_ids:
            return Alerta.objects.none()
        return Alerta.objects.filter(
            umbral__dispositivo_id__in=self.dispositivo_ids,
        ).select_related("umbral__dispositivo__area", "umbral__variable", "atendida_por")

    def alertas(self, variable=None, inicio=None, fin=None, estado=None, nivel=None):
        consulta = self.alertas_base.filter(
            lectura_fecha_hora__gte=inicio or self.inicio,
            lectura_fecha_hora__lt=fin or self.fin,
        )
        if variable:
            consulta = consulta.filter(umbral__variable_id=variable)
        if estado or self.estado:
            consulta = consulta.filter(estado=estado or self.estado)
        if nivel or self.nivel:
            consulta = consulta.filter(nivel=nivel or self.nivel)
        return consulta


def resolver_filtros(usuario, filtros=None, cruzado=None, ahora=None):
    """Resuelve periodo, alcance y filtro cruzado de una consulta.

    ``filtros`` admite ``periodo``, ``desde``, ``hasta``, ``areas``, ``dispositivos`` y
    ``variable``. ``cruzado`` admite ``dimension``, ``valor`` y, opcionalmente, ``origen``
    (el id de la tarjeta que no debe filtrarse).
    """
    if filtros is None:
        filtros = {}
    if not isinstance(filtros, dict):
        raise ValidationError({"filtros": "Los filtros deben ser un objeto."})
    desconocidas = set(filtros) - CLAVES_FILTROS
    if desconocidas:
        raise ValidationError(
            {"filtros": f"El filtro «{sorted(desconocidas)[0]}» no existe."}
        )
    ahora = _ahora(ahora)

    areas = list(areas_visibles(usuario).order_by("nombre"))
    dispositivos = list(
        dispositivos_visibles(usuario).select_related("area").order_by("area__nombre", "nombre")
    )
    areas_visibles_todas = list(areas)
    dispositivos_visibles_todos = list(dispositivos)
    dispositivos_por_num = {dispositivo.num: dispositivo for dispositivo in dispositivos}

    areas_pedidas = _lista_enteros(filtros.get("areas"), "areas")
    if areas_pedidas:
        visibles = {area.num for area in areas}
        ajenas = [numero for numero in areas_pedidas if numero not in visibles]
        if ajenas:
            raise PermissionDenied("Alguna de las áreas pedidas no está a su alcance.")
        areas = [area for area in areas if area.num in set(areas_pedidas)]

    ids_areas = {area.num for area in areas}
    dispositivos_pedidos = _lista_enteros(filtros.get("dispositivos"), "dispositivos")
    visibles_dispositivos = {dispositivo.num for dispositivo in dispositivos}
    if dispositivos_pedidos:
        ajenos = [numero for numero in dispositivos_pedidos if numero not in visibles_dispositivos]
        if ajenos:
            raise PermissionDenied("Alguno de los dispositivos pedidos no está a su alcance.")
        fuera_de_areas = [
            numero
            for numero in dispositivos_pedidos
            if dispositivos_por_num[numero].area_id not in ids_areas
        ]
        if fuera_de_areas:
            raise ValidationError(
                {"dispositivos": "Alguno de los dispositivos no es de las áreas pedidas."}
            )
        dispositivos = [
            dispositivo
            for dispositivo in dispositivos
            if dispositivo.num in set(dispositivos_pedidos)
        ]
    else:
        dispositivos = [
            dispositivo for dispositivo in dispositivos if dispositivo.area_id in ids_areas
        ]

    ids_dispositivos = {dispositivo.num for dispositivo in dispositivos}
    sensores = list(
        sensores_visibles(usuario)
        .filter(dispositivo_id__in=ids_dispositivos)
        .select_related("dispositivo__area")
        .order_by("num")
    )
    variables = {variable.codigo: variable for variable in VariableAmbiental.objects.all()}
    if not variables:
        variables = {
            codigo: type(
                "_Variable",
                (),
                {"codigo": codigo, "nombre": codigo, "unidad": "", "rango_min": 0, "rango_max": 0},
            )()
            for codigo in VARIABLES
        }

    periodo = filtros.get("periodo") or catalogo.PERIODO_POR_OMISION
    if periodo not in PERIODOS:
        raise ValidationError({"periodo": f"El periodo «{periodo}» no es válido."})
    inicio, fin = _periodo(periodo, filtros, ahora)
    previo_inicio, previo_fin = _periodo_previo(periodo, inicio, fin)

    return Consulta(
        usuario=usuario,
        inicio=inicio,
        fin=fin,
        previo_inicio=previo_inicio,
        previo_fin=previo_fin,
        periodo=periodo,
        intervalo=intervalo_para(inicio, fin),
        variable=_variable(filtros.get("variable")),
        areas=areas,
        dispositivos=dispositivos,
        sensores=sensores,
        variables=variables,
        cruzado=_cruzado(cruzado, areas_visibles_todas, dispositivos_visibles_todos),
    )
