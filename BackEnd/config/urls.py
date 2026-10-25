"""Rutas raíz del backend de Núcleo."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path(
        "api/v1/",
        include(
            [
                path("", include("apps.core.urls")),
                path("", include("apps.catalogos.urls")),
                path("", include("apps.usuarios.urls")),
                path("", include("apps.organizaciones.urls")),
                path("", include("apps.dispositivos.urls")),
                path("", include("apps.umbrales.urls")),
                path("", include("apps.mediciones.urls")),
                path("", include("apps.alertas.urls")),
                path("", include("apps.reportes.urls")),
            ]
        ),
    ),
]
