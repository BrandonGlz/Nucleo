from django.apps import AppConfig


class ConsolaConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.consola"
    verbose_name = "Consola de administración"

    def ready(self):
        from . import alertas

        alertas.conectar()
