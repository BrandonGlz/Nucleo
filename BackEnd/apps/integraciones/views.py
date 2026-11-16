import secrets

from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from apps.integraciones import envio
from apps.integraciones.autenticacion import generar_clave, resumen
from apps.integraciones.models import TokenAPI, Webhook
from common import roles
from common.permissions import PermisoPorRol


class TokenAPISerializer(serializers.ModelSerializer):
    creado_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = TokenAPI
        fields = [
            "num",
            "nombre",
            "prefijo",
            "creado_por",
            "creado_por_nombre",
            "fecha_creacion",
            "fecha_expiracion",
            "ultimo_uso",
            "activo",
        ]
        read_only_fields = [
            "num",
            "prefijo",
            "creado_por",
            "fecha_creacion",
            "ultimo_uso",
            "activo",
        ]

    def get_creado_por_nombre(self, token):
        return token.creado_por.get_full_name() if token.creado_por_id else ""


class TokenAPIViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Tokens de API de solo lectura de la organización. Al crear uno, la respuesta trae
    ``clave`` (la única vez que se muestra). Borrar = revocar."""

    serializer_class = TokenAPISerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN,)
    roles_escritura = (roles.ADMIN,)

    def get_queryset(self):
        return TokenAPI.objects.filter(
            organizacion_id=self.request.user.organizacion_id
        ).select_related("creado_por")

    def create(self, request, *args, **kwargs):
        entrada = self.get_serializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        clave, prefijo = generar_clave()
        token = entrada.save(
            organizacion_id=request.user.organizacion_id,
            creado_por=request.user,
            prefijo=prefijo,
            clave_hash=resumen(clave),
        )
        datos = self.get_serializer(token).data
        return Response({**datos, "clave": clave}, status=status.HTTP_201_CREATED)

    def perform_destroy(self, token):
        token.activo = False
        token.save(update_fields=["activo"])


class WebhookSerializer(serializers.ModelSerializer):
    eventos = serializers.ListField(
        child=serializers.ChoiceField(choices=Webhook.Evento.choices), allow_empty=False
    )

    class Meta:
        model = Webhook
        fields = [
            "num",
            "nombre",
            "url",
            "eventos",
            "activo",
            "creado_por",
            "fecha_creacion",
            "ultimo_envio",
            "ultimo_estado",
            "fallos_consecutivos",
        ]
        read_only_fields = [
            "num",
            "creado_por",
            "fecha_creacion",
            "ultimo_envio",
            "ultimo_estado",
            "fallos_consecutivos",
        ]

    def validate_url(self, url):
        try:
            envio.validar_destino(url)
        except envio.DestinoNoPermitido as error:
            raise serializers.ValidationError(str(error)) from error
        return url

    def validate_eventos(self, eventos):
        return sorted(set(eventos))

    def update(self, instancia, datos):
        if datos.get("activo"):
            datos["fallos_consecutivos"] = 0
        return super().update(instancia, datos)


class WebhookViewSet(viewsets.ModelViewSet):
    """Webhooks de la organización. Al crear uno, la respuesta trae ``secreto`` (solo esa vez);
    ``probar/`` manda un evento de prueba y devuelve el resultado."""

    serializer_class = WebhookSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN,)
    roles_escritura = (roles.ADMIN,)
    roles_acciones = {"probar": (roles.ADMIN,)}

    def get_queryset(self):
        return Webhook.objects.filter(organizacion_id=self.request.user.organizacion_id)

    def create(self, request, *args, **kwargs):
        entrada = self.get_serializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        secreto = "whsec_" + secrets.token_urlsafe(32)
        webhook = entrada.save(
            organizacion_id=request.user.organizacion_id,
            creado_por=request.user,
            secreto=secreto,
        )
        datos = self.get_serializer(webhook).data
        return Response({**datos, "secreto": secreto}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def probar(self, request, pk=None):
        webhook = self.get_object()
        exito = envio.entregar(
            webhook,
            "prueba",
            {"mensaje": "Evento de prueba de Núcleo", "webhook": webhook.pk},
            esperas=(0,),
        )
        webhook.refresh_from_db()
        registrar(
            RegistroAuditoria.Accion.INTEGRACION,
            recurso="webhook",
            recurso_num=webhook.pk,
            descripcion=f"Probó el webhook: {webhook.ultimo_estado}",
        )
        return Response({"exito": exito, "estado": webhook.ultimo_estado})
