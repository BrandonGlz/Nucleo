import secrets

from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from apps.integraciones import envio
from apps.integraciones.autenticacion import generar_clave, resumen
from apps.integraciones.models import TokenAPI, Webhook
from apps.organizaciones.models import Organizacion
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


class PorOrganizacion:
    """Las integraciones se gestionan desde la consola de administración (admin.bynucleo.com):
    solo el administrador de plataforma, eligiendo la organización con ``?organizacion=``
    (obligatorio para listar y crear)."""

    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN_PLATAFORMA,)
    roles_escritura = (roles.ADMIN_PLATAFORMA,)

    def organizacion_id(self, obligatoria=True):
        valor = self.request.query_params.get("organizacion") or self.request.data.get(
            "organizacion"
        )
        try:
            num = int(valor)
        except (TypeError, ValueError):
            num = None
        if num is None or not Organizacion.objects.filter(pk=num).exists():
            if obligatoria:
                raise ValidationError({"organizacion": "Elige la organización."})
            return None
        return num

    def filtrar(self, consulta):
        num = self.organizacion_id(obligatoria=self.action in ("list", "create"))
        return consulta.filter(organizacion_id=num) if num is not None else consulta


class TokenAPIViewSet(
    PorOrganizacion,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Tokens de API de solo lectura de la organización. Al crear uno, la respuesta trae
    ``clave`` (la única vez que se muestra). Borrar = revocar."""

    serializer_class = TokenAPISerializer

    def get_queryset(self):
        return self.filtrar(TokenAPI.objects.select_related("creado_por"))

    def create(self, request, *args, **kwargs):
        entrada = self.get_serializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        clave, prefijo = generar_clave()
        token = entrada.save(
            organizacion_id=self.organizacion_id(),
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


class WebhookViewSet(PorOrganizacion, viewsets.ModelViewSet):
    """Webhooks de la organización. Al crear uno, la respuesta trae ``secreto`` (solo esa vez);
    ``probar/`` manda un evento de prueba y devuelve el resultado."""

    serializer_class = WebhookSerializer
    roles_acciones = {"probar": (roles.ADMIN_PLATAFORMA,)}

    def get_queryset(self):
        return self.filtrar(Webhook.objects.all())

    def create(self, request, *args, **kwargs):
        entrada = self.get_serializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        secreto = "whsec_" + secrets.token_urlsafe(32)
        webhook = entrada.save(
            organizacion_id=self.organizacion_id(),
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
            organizacion_id=webhook.organizacion_id,
            recurso="webhook",
            recurso_num=webhook.pk,
            descripcion=f"Probó el webhook: {webhook.ultimo_estado}",
        )
        return Response({"exito": exito, "estado": webhook.ultimo_estado})
