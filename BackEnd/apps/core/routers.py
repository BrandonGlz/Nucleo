"""Enrutamiento de modelos entre las dos bases de datos de Núcleo."""


class LecturaRouter:
    """Envía las lecturas a nucleo_iot (TimescaleDB) y todo lo demás a nucleo_db.

    Cada base recibe solo sus propias migraciones y no se permiten relaciones entre
    modelos de bases distintas: ``sensor_num`` y ``variable_codigo`` son referencias
    lógicas que valida el backend antes de insertar.
    """

    app_iot = "mediciones"

    def db_for_read(self, model, **hints):
        return "iot" if model._meta.app_label == self.app_iot else "default"

    db_for_write = db_for_read

    def allow_relation(self, obj1, obj2, **hints):
        return obj1._state.db == obj2._state.db

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return (db == "iot") == (app_label == self.app_iot)
