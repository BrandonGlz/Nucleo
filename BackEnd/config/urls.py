"""Rutas raíz del backend de Núcleo."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

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
                path("", include("apps.avisos.urls")),
                path("", include("apps.reportes.urls")),
                path("", include("apps.analitica.urls")),
                path("nico/", include("apps.nico.urls")),
                path("consola/", include("apps.consola.urls")),
                path("", include("apps.auditoria.urls")),
                path("", include("apps.integraciones.urls")),
                path("esquema/", SpectacularAPIView.as_view(), name="esquema"),
                path("docs/", SpectacularSwaggerView.as_view(url_name="esquema"), name="docs"),
            ]
        ),
    ),
]
