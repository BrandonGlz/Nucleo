from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.reportes import ia, pdf, servicios
from apps.reportes.models import ProgramacionReporte, Reporte
from apps.reportes.serializers import (
    ProgramacionReporteSerializer,
    ReporteSerializer,
    SolicitudReporteSerializer,
)
from common import roles
from common.permissions import PermisoPorRol
from common.scoping import areas_visibles


class ReporteViewSet(viewsets.ReadOnlyModelViewSet):
    """Reportes con IA. Se piden con ``POST``; el texto lo redacta la IA a partir de
    las cifras que calcula el backend, y se descargan en PDF con ``pdf/``."""

    serializer_class = ReporteSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)

    def get_queryset(self):
        usuario = self.request.user
        consulta = Reporte.objects.filter(organizacion_id=usuario.organizacion_id)
        if usuario.rol_id != roles.ADMIN and usuario.area_id:
            consulta = consulta.filter(area_id=usuario.area_id)
        return consulta.select_related("organizacion", "area")

    def create(self, request):
        entrada = SolicitudReporteSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        areas = areas_visibles(request.user)
        area = None
        if datos.get("area") is not None:
            area = areas.filter(pk=datos["area"]).first()
            if area is None:
                raise ValidationError({"area": "El área no existe o no está a su alcance."})
        elif request.user.rol_id != roles.ADMIN and request.user.area_id:
            area = areas.filter(pk=request.user.area_id).first()

        try:
            reporte = servicios.generar_reporte(
                request.user.organizacion,
                area,
                datos["periodo_inicio"],
                datos["periodo_fin"],
                Reporte.Origen.MANUAL,
                usuario=request.user,
            )
        except ia.IANoDisponible as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(reporte).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="pdf")
    def descargar_pdf(self, request, pk=None):
        reporte = self.get_object()
        respuesta = HttpResponse(pdf.construir(reporte), content_type="application/pdf")
        respuesta["Content-Disposition"] = f'attachment; filename="reporte-{reporte.num}.pdf"'
        return respuesta


class ProgramacionReporteViewSet(viewsets.ModelViewSet):
    """Reportes periódicos: frecuencia, área (o toda la organización) y destinatarios.

    Los genera y envía por correo la tarea ``generar_reportes_programados``.
    """

    serializer_class = ProgramacionReporteSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)

    def get_queryset(self):
        usuario = self.request.user
        consulta = ProgramacionReporte.objects.filter(organizacion_id=usuario.organizacion_id)
        if usuario.rol_id != roles.ADMIN and usuario.area_id:
            consulta = consulta.filter(area_id=usuario.area_id)
        return consulta

    def perform_create(self, serializer):
        usuario = self.request.user
        serializer.save(organizacion=usuario.organizacion, creada_por=usuario)
