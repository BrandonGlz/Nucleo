"""Paginación de la API."""

from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.utils.urls import remove_query_param, replace_query_param


class Paginacion(PageNumberPagination):
    """50 registros por página; ``page_size`` pide hasta 1000 (listas completas del front)."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 1000


class PaginacionPorMomento(Paginacion):
    """Páginas numeradas (``page``, ``page_size``, misma respuesta que ``Paginacion``) que nunca
    parten un momento: las filas con el mismo ``campo`` (``fecha_hora``) van juntas.

    El queryset debe venir ordenado por ``-campo`` (y después por algo estable). Un momento
    pertenece a la página donde cae su primera fila, así que la página ``n`` son las filas con
    ``campo[n·tamaño − 1] <= campo < campo[(n − 1)·tamaño − 1]`` (posiciones del orden completo):
    puede traer unas filas de más (las del momento que empieza al final) o de menos (si el anterior
    se las llevó), pero cada fila sale en una sola página, ``count`` es el total de filas y
    ``next`` solo aparece si quedan filas más antiguas y apunta a la página donde empieza el
    próximo momento. Una página solo puede quedar vacía si un momento tiene más filas que
    ``page_size`` (y ``next`` se la salta).
    """

    campo = "fecha_hora"

    def paginate_queryset(self, queryset, request, view=None):
        self.request = request
        self.tamano = self.get_page_size(request)
        if not self.tamano:
            return None
        self.total = queryset.count()
        numero = request.query_params.get(self.page_query_param) or 1
        if numero in self.last_page_strings:
            numero = max(1, -(-self.total // self.tamano))
        try:
            numero = int(numero)
            if numero < 1:
                raise ValueError
        except (TypeError, ValueError):
            raise NotFound("Página inválida.") from None
        inicio, fin = (numero - 1) * self.tamano, numero * self.tamano
        if numero > 1 and inicio >= self.total:
            raise NotFound("Página inválida.")
        self.numero = numero
        fechas = queryset.values_list(self.campo, flat=True)
        pagina = queryset
        if inicio:
            pagina = pagina.filter(**{f"{self.campo}__lt": fechas[inicio - 1]})
        self.siguiente = None
        if fin < self.total:
            limite = fechas[fin - 1]
            pagina = pagina.filter(**{f"{self.campo}__gte": limite})
            # La siguiente es la página donde empieza el próximo momento (posición de su primera
            # fila); si un momento ocupa más de una página, se salta las que quedarían vacías.
            posicion = queryset.filter(**{f"{self.campo}__gte": limite}).count()
            if posicion < self.total:
                self.siguiente = posicion // self.tamano + 1
        return list(pagina)

    def get_next_link(self):
        if self.siguiente is None:
            return None
        url = self.request.build_absolute_uri()
        return replace_query_param(url, self.page_query_param, self.siguiente)

    def get_previous_link(self):
        if self.numero == 1:
            return None
        url = self.request.build_absolute_uri()
        if self.numero == 2:
            return remove_query_param(url, self.page_query_param)
        return replace_query_param(url, self.page_query_param, self.numero - 1)

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.total,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )
