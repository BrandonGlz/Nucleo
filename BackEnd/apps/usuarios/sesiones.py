"""Sesiones abiertas de la propia cuenta (pantalla «Mi perfil» de la app).

- ``GET    auth/sesiones/``       las sesiones vigentes del usuario (``actual``: la de esta
  petición).
- ``DELETE auth/sesiones/<num>/`` cierra una de sus otras sesiones.
"""

from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar

from .models import Sesion


def _vigentes(usuario):
    # La política de días vive en la consola; se importa aquí para no acoplar los módulos al cargar.
    from apps.consola.views import sesiones_vigentes

    return sesiones_vigentes().filter(usuario=usuario).order_by("-ultimo_uso")


class _SesionPropia(serializers.ModelSerializer):
    actual = serializers.SerializerMethodField()

    class Meta:
        model = Sesion
        fields = ["num", "cliente", "agente", "ip", "creada", "ultimo_uso", "actual"]

    def get_actual(self, sesion):
        auth = self.context["request"].auth
        return isinstance(auth, Sesion) and auth.pk == sesion.pk


class MisSesionesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        datos = _SesionPropia(_vigentes(request.user), many=True, context={"request": request}).data
        return Response(datos)


class MiSesionView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, num):
        sesion = _vigentes(request.user).filter(pk=num).first()
        if sesion is None:
            raise NotFound("Esa sesión ya no está abierta.")
        if isinstance(request.auth, Sesion) and request.auth.pk == sesion.pk:
            raise ValidationError(
                {"detail": "Es la sesión con la que estás aquí: usa «Cerrar sesión»."}
            )
        sesion.delete()
        registrar(
            RegistroAuditoria.Accion.MODIFICAR,
            organizacion_id=request.user.organizacion_id,
            recurso="sesion",
            recurso_num=num,
            descripcion=f"Cerró una de sus sesiones ({sesion.agente or sesion.cliente})"[:255],
            request=request,
        )
        return Response(status=204)
