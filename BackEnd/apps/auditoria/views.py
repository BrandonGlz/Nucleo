from rest_framework import serializers, viewsets

from apps.auditoria.models import RegistroAuditoria
from common import roles
from common.filtros import parametro_entero, parametro_fecha
from common.permissions import PermisoPorRol


class RegistroAuditoriaSerializer(serializers.ModelSerializer):
    accion_nombre = serializers.CharField(source="get_accion_display", read_only=True)
    usuario_nombre = serializers.SerializerMethodField()

    class Meta:
        model = RegistroAuditoria
        fields = [
            "num",
            "fecha_hora",
            "usuario",
            "usuario_correo",
            "usuario_nombre",
            "organizacion",
            "accion",
            "accion_nombre",
            "recurso",
            "recurso_num",
            "descripcion",
            "cambios",
            "ip",
        ]

    def get_usuario_nombre(self, registro):
        return registro.usuario.get_full_name() if registro.usuario_id else ""


class RegistroAuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    """Bitácora de auditoría. El administrador ve la de su organización; el administrador de
    plataforma, toda. Filtros: ``accion``, ``recurso``, ``usuario``, ``desde`` y ``hasta``."""

    serializer_class = RegistroAuditoriaSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN, roles.ADMIN_PLATAFORMA)

    def get_queryset(self):
        peticion = self.request
        usuario = peticion.user
        consulta = RegistroAuditoria.objects.select_related("usuario")
        if usuario.rol_id != roles.ADMIN_PLATAFORMA:
            consulta = consulta.filter(organizacion_id=usuario.organizacion_id)
        accion = peticion.query_params.get("accion")
        if accion:
            consulta = consulta.filter(accion=accion.upper())
        recurso = peticion.query_params.get("recurso")
        if recurso:
            consulta = consulta.filter(recurso=recurso.lower())
        persona = parametro_entero(peticion, "usuario")
        if persona is not None:
            consulta = consulta.filter(usuario_id=persona)
        desde = parametro_fecha(peticion, "desde")
        if desde:
            consulta = consulta.filter(fecha_hora__gte=desde)
        hasta = parametro_fecha(peticion, "hasta")
        if hasta:
            consulta = consulta.filter(fecha_hora__lt=hasta)
        return consulta
