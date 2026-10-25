from django.urls import path

from .views import CatalogosView

urlpatterns = [
    path("catalogos/", CatalogosView.as_view(), name="catalogos"),
]
