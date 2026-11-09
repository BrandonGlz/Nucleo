"""Paginación de la API."""

from rest_framework.pagination import PageNumberPagination


class Paginacion(PageNumberPagination):
    """50 registros por página; ``page_size`` pide hasta 1000 (listas completas del front)."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 1000
