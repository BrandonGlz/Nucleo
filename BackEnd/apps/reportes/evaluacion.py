"""Corre el banco de casos (``casos_agente.CASOS``) por el mismo camino que la API del agente.

Todo se hace dentro de una transacción que se revierte: no quedan preguntas en el registro ni
votos en el banco. La IA local se apaga para que el resultado dependa solo de las reglas y las
herramientas (lo que la IA hace se mide aparte, en el registro de producción).
"""

from dataclasses import dataclass, field
from unittest import mock

from django.db import transaction
from rest_framework.test import APIClient

from . import agente, carga, interprete, puente
from .casos_agente import CASOS


@dataclass
class Resultado:
    caso: dict
    respuesta: str
    intencion: str
    fallas: list = field(default_factory=list)

    @property
    def ok(self):
        return not self.fallas


def _revisar(caso, intencion, variables, texto):
    fallas = []
    if "intencion" in caso and intencion != caso["intencion"]:
        fallas.append(f"intención {intencion}, se esperaba {caso['intencion']}")
    if "variables" in caso and variables != caso["variables"]:
        fallas.append(f"variables {variables}, se esperaba {caso['variables']}")
    normal = agente._normalizar(texto)
    for frase in caso.get("contiene", ()):
        if agente._normalizar(frase) not in normal:
            fallas.append(f"no contiene «{frase}»")
    for frase in caso.get("no_contiene", ()):
        if agente._normalizar(frase) in normal:
            fallas.append(f"contiene «{frase}»")
    return fallas


def evaluar(usuario, dispositivo, casos=CASOS):
    cliente = APIClient(HTTP_HOST="localhost")
    cliente.force_authenticate(usuario)
    resultados = []
    with (
        transaction.atomic(),
        mock.patch.object(puente, "con_puente", return_value=False),
        mock.patch.object(puente, "activo", return_value=True),
        # La evaluación hace muchas preguntas seguidas: no le aplica el límite por minuto.
        mock.patch.object(carga, "excede_limite", return_value=False),
    ):
        for caso in casos:
            # Cada caso es independiente: sin la racha de repeticiones del anterior.
            agente_post = {"pregunta": caso["pregunta"], "dispositivo": dispositivo.pk}
            if caso.get("anterior"):
                agente_post["anterior"] = caso["anterior"]
            r = cliente.post("/api/v1/agente/", agente_post, format="json")
            texto = r.json().get("texto", "") if r.status_code == 200 else f"HTTP {r.status_code}"
            limpio = agente.sin_sentido(caso["pregunta"])[1] or caso["pregunta"]
            peticion = interprete.interpretar(limpio, caso.get("anterior", ""))
            resultados.append(
                Resultado(
                    caso,
                    texto,
                    peticion.intencion,
                    _revisar(caso, peticion.intencion, peticion.variables, texto),
                )
            )
        transaction.set_rollback(True)
    return resultados
