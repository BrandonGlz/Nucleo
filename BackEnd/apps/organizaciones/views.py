from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.organizaciones import logos
from apps.organizaciones.models import Organizacion
from apps.organizaciones.serializers import AreaSerializer, OrganizacionSerializer
from apps.usuarios.models import Usuario
from apps.usuarios.serializers import PrimerAdministradorSerializer, UsuarioSerializer
from common import roles
from common.permissions import PermisoPorRol
from common.scoping import areas_visibles


class OrganizacionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Organizaciones clientes.

    El administrador de plataforma da de alta, suspende o da de baja las organizaciones
    (``PATCH`` del ``estado``) y crea a su primer administrador. Cada administrador ve y
    edita solo su propia organización; los demás roles solo la consultan.
    """

    serializer_class = OrganizacionSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN_PLATAFORMA, *roles.TODOS)
    roles_escritura = (roles.ADMIN_PLATAFORMA, roles.ADMIN)
    roles_acciones = {
        "create": (roles.ADMIN_PLATAFORMA,),
        "primer_administrador": (roles.ADMIN_PLATAFORMA,),
        "logo": (roles.ADMIN,),
    }

    def check_permissions(self, request):
        super().check_permissions(request)
        # El permiso de la marca se revisa antes de validar el cuerpo: ADMINPLAT, SUPER y
        # OPER reciben 403 aunque manden un color válido.
        if request.user.rol_id != roles.ADMIN and (
            self.action == "logo"
            or (request.method in ("PATCH", "PUT") and "color_reporte" in request.data)
        ):
            self.permission_denied(
                request,
                message="Solo el administrador cambia la marca de los reportes.",
            )

    def get_queryset(self):
        usuario = self.request.user
        if usuario.rol_id == roles.ADMIN_PLATAFORMA:
            return Organizacion.objects.all()
        return Organizacion.objects.filter(pk=usuario.organizacion_id)

    @action(
        detail=True,
        methods=["post", "delete"],
        url_path="logo",
        parser_classes=[MultiPartParser],
    )
    def logo(self, request, pk=None):
        """Cambia (multipart, campo ``logo``) o quita el logo de la organización."""
        organizacion = self.get_object()
        if request.method == "POST":
            archivo = request.FILES.get("logo")
            if archivo is None:
                raise serializers.ValidationError({"logo": ["Adjunta el logo en el campo «logo»."]})
            logos.guardar(organizacion, logos.procesar(archivo))
        else:
            logos.quitar(organizacion)
        return Response(OrganizacionSerializer(organizacion, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="primer-administrador")
    def primer_administrador(self, request, pk=None):
        """Crea al primer administrador de la organización, mientras no tenga uno activo."""
        organizacion = self.get_object()
        if Usuario.objects.filter(
            organizacion=organizacion,
            rol_id=roles.ADMIN,
            estado_usuario_id=roles.USUARIO_ACTIVO,
        ).exists():
            return Response(
                {"detail": "La organización ya tiene un administrador activo."},
                status=status.HTTP_409_CONFLICT,
            )
        entrada = PrimerAdministradorSerializer(
            data=request.data, context={"request": request, "organizacion": organizacion}
        )
        entrada.is_valid(raise_exception=True)
        administrador = entrada.save()
        return Response(
            UsuarioSerializer(administrador, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AreaViewSet(viewsets.ModelViewSet):
    serializer_class = AreaSerializer
    permission_classes = [PermisoPorRol]
    # El supervisor solo cambia el ESP de Nico de sus áreas; crear y borrar sigue siendo del ADMIN.
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR)

    def get_queryset(self):
        return areas_visibles(self.request.user)

    def perform_create(self, serializer):
        serializer.save(organizacion=self.request.user.organizacion)

    def create(self, request, *args, **kwargs):
        if request.user.rol_id != roles.ADMIN:
            raise PermissionDenied("Solo el administrador agrega áreas.")
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.rol_id != roles.ADMIN:
            raise PermissionDenied("Solo el administrador elimina áreas.")
        return super().destroy(request, *args, **kwargs)
