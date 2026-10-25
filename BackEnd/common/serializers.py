"""Utilidades para serializadores de la API."""


class ValoresPorDefectoDeBaseMixin:
    """Hace opcionales los campos que la base de datos rellena con ``db_default``.

    DRF no conoce ``db_default`` y los marcaría como obligatorios; si el cliente
    los omite, se aplica el valor definido en la tabla.
    """

    def get_extra_kwargs(self):
        extra = super().get_extra_kwargs()
        for campo in self.Meta.model._meta.concrete_fields:
            if campo.has_db_default() and campo.name in self.Meta.fields:
                opciones = extra.setdefault(campo.name, {})
                if not opciones.get("read_only"):
                    opciones.setdefault("required", False)
        return extra
