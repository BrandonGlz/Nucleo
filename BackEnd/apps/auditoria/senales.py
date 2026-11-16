"""Señales que llevan a la bitácora los cambios que hacen las personas.

Solo se registran los cambios con una persona detrás (petición autenticada a la API o al admin);
los del sistema (lecturas, estados de conexión, comandos) no, para que la bitácora diga quién
cambió qué sin llenarse de ruido.
"""

import datetime
import decimal
import uuid

from django.apps import apps
from django.db.models.signals import post_delete, post_save, pre_save

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import actor_actual, registrar
from common.cifrado import CampoCifrado

# Modelo -> camino hasta el número de su organización.
MODELOS = {
    "organizaciones.Organizacion": "pk",
    "organizaciones.Area": "organizacion_id",
    "usuarios.Usuario": "organizacion_id",
    "dispositivos.Dispositivo": "area.organizacion_id",
    "dispositivos.Sensor": "dispositivo.area.organizacion_id",
    "umbrales.Umbral": "dispositivo.area.organizacion_id",
    "alertas.Alerta": "umbral.dispositivo.area.organizacion_id",
    "reportes.ProgramacionReporte": "organizacion_id",
    "reportes.RespuestaAprendida": None,
    "nico.DocumentoNico": None,
    "nico.AjusteHerramienta": None,
    "nico.AjusteSugerencias": None,
    "integraciones.TokenAPI": "organizacion_id",
    "integraciones.Webhook": "organizacion_id",
    "consola.PoliticaSeguridad": None,
}
# Campos que no se registran: cambian solos o no aportan.
IGNORADOS = {
    "last_login",
    "ultimo_uso",
    "actualizado",
    "ultimo_envio",
    "ultimo_estado",
    "fallos_consecutivos",
}
# Campos cuyo valor nunca se copia a la bitácora.
SECRETOS = {"password", "clave_hash", "secreto"}


def _organizacion(instancia, camino):
    if camino is None:
        return None
    valor = instancia
    try:
        for parte in camino.split("."):
            valor = getattr(valor, parte)
    except Exception:
        return None
    return valor


def _serializable(valor):
    if isinstance(valor, (datetime.datetime, datetime.date, datetime.time)):
        return valor.isoformat()
    if isinstance(valor, (decimal.Decimal, uuid.UUID)):
        return str(valor)
    return valor


def _campos(modelo):
    return [
        campo
        for campo in modelo._meta.concrete_fields
        if not campo.primary_key and campo.attname not in IGNORADOS
    ]


def _valores(instancia):
    datos = {}
    for campo in _campos(type(instancia)):
        datos[campo.attname] = getattr(instancia, campo.attname)
    return datos


def _oculto(campo_attname, modelo):
    campo = next((c for c in modelo._meta.concrete_fields if c.attname == campo_attname), None)
    return campo_attname in SECRETOS or isinstance(campo, CampoCifrado)


def _antes(sender, instance, raw=False, update_fields=None, **kwargs):
    if raw or instance.pk is None or actor_actual() is None:
        return
    if update_fields is not None and set(update_fields) <= IGNORADOS:
        instance._auditoria_omitir = True
        return
    anterior = sender._default_manager.filter(pk=instance.pk).first()
    instance._auditoria_antes = _valores(anterior) if anterior is not None else None


def _despues(sender, instance, created, raw=False, **kwargs):
    if raw or actor_actual() is None or getattr(instance, "_auditoria_omitir", False):
        instance.__dict__.pop("_auditoria_omitir", None)
        return
    camino = MODELOS[sender._meta.label]
    actuales = _valores(instance)
    if created:
        cambios = {
            k: ("(oculto)" if _oculto(k, sender) else _serializable(v))
            for k, v in actuales.items()
            if v not in (None, "")
        }
        accion = RegistroAuditoria.Accion.CREAR
    else:
        anteriores = instance.__dict__.pop("_auditoria_antes", None) or {}
        cambios = {}
        for clave, nuevo in actuales.items():
            viejo = anteriores.get(clave)
            if viejo == nuevo:
                continue
            if _oculto(clave, sender):
                cambios[clave] = "(cambiado)"
            else:
                cambios[clave] = {"antes": _serializable(viejo), "despues": _serializable(nuevo)}
        if not cambios:
            return
        accion = RegistroAuditoria.Accion.MODIFICAR
    registrar(
        accion,
        organizacion_id=_organizacion(instance, camino),
        recurso=sender._meta.model_name,
        recurso_num=instance.pk,
        descripcion=str(instance)[:255],
        cambios=cambios,
    )


def _eliminado(sender, instance, **kwargs):
    if actor_actual() is None:
        return
    registrar(
        RegistroAuditoria.Accion.ELIMINAR,
        organizacion_id=_organizacion(instance, MODELOS[sender._meta.label]),
        recurso=sender._meta.model_name,
        recurso_num=instance.pk,
        descripcion=str(instance)[:255],
    )


def conectar():
    for etiqueta in MODELOS:
        try:
            modelo = apps.get_model(etiqueta)
        except LookupError:
            continue
        uid = f"auditoria:{etiqueta}"
        pre_save.connect(_antes, sender=modelo, dispatch_uid=f"{uid}:pre")
        post_save.connect(_despues, sender=modelo, dispatch_uid=f"{uid}:post")
        post_delete.connect(_eliminado, sender=modelo, dispatch_uid=f"{uid}:delete")
