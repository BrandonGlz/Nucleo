"""API de los tableros de analítica: CRUD con versiones y predeterminados."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.analitica import catalogo
from apps.analitica.models import TableroAnalitica, VersionTablero
from apps.analitica.serializers import (
    SolicitudCambioTableroSerializer,
    SolicitudRestaurarSerializer,
    SolicitudTableroSerializer,
    TableroAnaliticaSerializer,
    VersionTableroSerializer,
)
from common import roles
from common.permissions import PermisoPorRol


def _nueva_version(tablero, conf, usuario):
    """Agrega la siguiente versión; bloquea el tablero para que dos guardados a la vez no
    choquen con el mismo número. Llamar dentro de ``transaction.atomic()``."""
    TableroAnalitica.objects.select_for_update().filter(pk=tablero.pk).first()
    actual = tablero.version_actual()
    return VersionTablero.objects.create(
        tablero=tablero,
        numero=(actual.numero if actual else 0) + 1,
        conf=conf,
        creada_por=usuario,
    )


class TableroAnaliticaViewSet(viewsets.ModelViewSet):
    """Tableros de la organización y plantillas del sistema, con versiones.

    ADMIN, SUPER y ANALISTA leen los tableros de su organización y las plantillas; solo
    ADMIN y SUPER crean, editan, duplican, archivan, restauran y marcan predeterminados.
    Las plantillas del sistema no se editan: se duplican.
    """

    serializer_class = TableroAnaliticaSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR)
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        usuario = self.request.user
        consulta = TableroAnalitica.objects.filter(
            Q(organizacion__isnull=True) | Q(organizacion_id=usuario.organizacion_id)
        ).select_related("organizacion", "creado_por")
        archivados = self.request.query_params.get("archivados", "").lower()
        if archivados not in ("1", "true"):
            consulta = consulta.filter(Q(organizacion__isnull=True) | Q(activo=True))
        return consulta

    @staticmethod
    def _normalizar_conf(conf):
        try:
            return catalogo.validar_conf(conf)
        except DjangoValidationError as error:
            raise ValidationError({"conf": error.messages}) from error

    def _validar_nombre(self, nombre, excluir=None):
        consulta = TableroAnalitica.objects.filter(
            organizacion_id=self.request.user.organizacion_id,
            nombre=nombre,
            activo=True,
        )
        if excluir is not None:
            consulta = consulta.exclude(pk=excluir.pk)
        if consulta.exists():
            raise ValidationError({"nombre": "Ya existe un tablero activo con ese nombre."})

    def _nombre_libre(self, base):
        """El nombre pedido o, si ya existe en la organización, «Nombre (2)», «(3)»…"""
        base = base.strip()[:80] or "Tablero"
        usados = set(
            TableroAnalitica.objects.filter(
                organizacion_id=self.request.user.organizacion_id,
            ).values_list("nombre", flat=True)
        )
        if base not in usados:
            return base
        numero = 2
        while True:
            sufijo = f" ({numero})"
            candidato = f"{base[: 80 - len(sufijo)]}{sufijo}"
            if candidato not in usados:
                return candidato
            numero += 1

    def _tablero_de_origen(self, num):
        tablero = self.get_queryset().filter(pk=num).first()
        if tablero is None:
            raise NotFound("El tablero de origen no existe o no está a su alcance.")
        return tablero

    def create(self, request, *args, **kwargs):
        entrada = SolicitudTableroSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        original = self._tablero_de_origen(datos["desde"]) if "desde" in datos else None

        nombre = (datos.get("nombre") or "").strip()
        if nombre:
            self._validar_nombre(nombre)
        elif original is not None:
            nombre = self._nombre_libre(f"Copia de {original.nombre}")
        else:
            raise ValidationError({"nombre": "El tablero necesita un nombre."})

        if "conf" in datos:
            conf = self._normalizar_conf(datos["conf"])
        elif original is not None:
            actual = original.version_actual()
            conf = actual.conf if actual else catalogo.conf_vacia()
        else:
            conf = catalogo.conf_vacia()

        if "descripcion" in datos:
            descripcion = (datos["descripcion"] or "").strip()
        elif original is not None:
            descripcion = original.descripcion
        else:
            descripcion = ""

        with transaction.atomic():
            tablero = TableroAnalitica.objects.create(
                organizacion=request.user.organizacion,
                nombre=nombre,
                descripcion=descripcion,
                creado_por=request.user,
            )
            VersionTablero.objects.create(
                tablero=tablero,
                numero=1,
                conf=conf,
                creada_por=request.user,
            )
        return Response(self.get_serializer(tablero).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        tablero = self.get_object()
        if tablero.organizacion_id is None:
            raise PermissionDenied("Las plantillas no se editan; duplícalas para cambiarlas.")
        entrada = SolicitudCambioTableroSerializer(data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        nombre = None
        if "nombre" in datos:
            nombre = datos["nombre"].strip()
            if not nombre:
                raise ValidationError({"nombre": "El tablero necesita un nombre."})
            self._validar_nombre(nombre, excluir=tablero)
        conf = self._normalizar_conf(datos["conf"]) if "conf" in datos else None

        with transaction.atomic():
            campos = []
            if nombre is not None and nombre != tablero.nombre:
                tablero.nombre = nombre
                campos.append("nombre")
            if "descripcion" in datos:
                descripcion = (datos["descripcion"] or "").strip()
                if descripcion != tablero.descripcion:
                    tablero.descripcion = descripcion
                    campos.append("descripcion")
            if campos:
                tablero.save(update_fields=campos)
            if conf is not None:
                _nueva_version(tablero, conf, request.user)
        return Response(self.get_serializer(tablero).data)

    def destroy(self, request, *args, **kwargs):
        tablero = self.get_object()
        if tablero.organizacion_id is None:
            raise PermissionDenied("Las plantillas no se archivan.")
        tablero.activo = False
        tablero.predeterminado = False
        tablero.save(update_fields=["activo", "predeterminado"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def predeterminar(self, request, pk=None):
        tablero = self.get_object()
        if tablero.organizacion_id is None:
            raise PermissionDenied(
                "Las plantillas no pueden ser predeterminadas; duplica primero la que quieras usar."
            )
        if not tablero.activo:
            raise ValidationError({"tablero": "No se puede marcar un tablero archivado."})
        with transaction.atomic():
            TableroAnalitica.objects.filter(
                organizacion_id=tablero.organizacion_id,
                predeterminado=True,
            ).exclude(pk=tablero.pk).update(predeterminado=False)
            if not tablero.predeterminado:
                tablero.predeterminado = True
                tablero.save(update_fields=["predeterminado"])
        return Response(self.get_serializer(tablero).data)

    @action(detail=True, methods=["get"])
    def versiones(self, request, pk=None):
        tablero = self.get_object()
        versiones = tablero.versiones.select_related("creada_por")
        return Response(VersionTableroSerializer(versiones, many=True).data)

    @action(detail=True, methods=["post"])
    def restaurar(self, request, pk=None):
        tablero = self.get_object()
        if tablero.organizacion_id is None:
            raise PermissionDenied(
                "Las plantillas no se restauran; duplica primero la que quieras usar."
            )
        entrada = SolicitudRestaurarSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        version = tablero.versiones.filter(numero=entrada.validated_data["numero"]).first()
        if version is None:
            raise NotFound("La versión del tablero no existe.")
        with transaction.atomic():
            _nueva_version(tablero, version.conf, request.user)
        return Response(self.get_serializer(tablero).data)
