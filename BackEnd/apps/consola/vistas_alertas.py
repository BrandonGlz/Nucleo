"""API del módulo «Alertas» de la consola de administración: alertas de seguridad, sus
notificaciones (campana de la consola) y las preferencias de aviso de cada superusuario.
La lógica que las genera está en ``alertas.py``; el contrato, en ``Context/api/contrato-api.md``."""

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from common.exportar import respuesta_csv

from . import alertas
from .models import AlertaSeguridad, NotificacionSeguridad, PreferenciaAvisosSeguridad
from .views import ConsolaMixin

Estado = AlertaSeguridad.Estado
NIVELES = [n.value for n in AlertaSeguridad.Nivel]


class AlertaSeguridadSerializer(serializers.ModelSerializer):
    usuario = serializers.SerializerMethodField()
    revisada_por = serializers.SerializerMethodField()

    class Meta:
        model = AlertaSeguridad
        fields = [
            "num",
            "tipo",
            "nivel",
            "estado",
            "titulo",
            "detalle",
            "usuario",
            "ip",
            "eventos",
            "creada",
            "ultimo_evento",
            "revisada_por",
            "fecha_revision",
            "nota",
        ]

    def get_usuario(self, a):
        u = a.usuario
        if u is None:
            if not a.usuario_correo:
                return None
            return {"num": None, "nombre": "", "correo": a.usuario_correo}
        return {"num": u.num, "nombre": u.get_full_name(), "correo": u.correo}

    def get_revisada_por(self, a):
        return a.revisada_por.get_full_name() if a.revisada_por else None


class AlertaSeguridadViewSet(
    ConsolaMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = AlertaSeguridadSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = AlertaSeguridad.objects.select_related("usuario", "revisada_por")
        if (estado := p.get("estado")) in Estado.values:
            qs = qs.filter(estado=estado)
        if (nivel := p.get("nivel")) in NIVELES:
            qs = qs.filter(nivel=nivel)
        if (tipo := p.get("tipo")) in AlertaSeguridad.Tipo.values:
            qs = qs.filter(tipo=tipo)
        if q := (p.get("q") or "").strip():
            qs = qs.filter(
                Q(titulo__icontains=q) | Q(usuario_correo__icontains=q) | Q(ip__icontains=q)
            )
        return qs

    def _cerrar(self, estado, texto):
        alerta = self.get_object()
        if alerta.estado != Estado.NUEVA:
            raise ValidationError({"detail": "La alerta ya se había revisado o descartado."})
        nota = str(self.request.data.get("nota") or "").strip()
        alertas.cerrar(alerta, estado, self.request.user, nota)
        registrar(
            RegistroAuditoria.Accion.MODIFICAR,
            recurso="alerta_seguridad",
            recurso_num=alerta.pk,
            descripcion=f"{texto} la alerta de seguridad: {alerta.titulo}"[:255],
            request=self.request,
        )
        return Response(self.get_serializer(alerta).data)

    @action(detail=True, methods=["post"])
    def revisar(self, request, pk=None):
        return self._cerrar(Estado.REVISADA, "Revisó")

    @action(detail=True, methods=["post"])
    def descartar(self, request, pk=None):
        return self._cerrar(Estado.DESCARTADA, "Descartó")

    @action(detail=False, methods=["post"], url_path="revisar-todas")
    def revisar_todas(self, request):
        nuevas = list(AlertaSeguridad.objects.filter(estado=Estado.NUEVA))
        for alerta in nuevas:
            alertas.cerrar(alerta, Estado.REVISADA, request.user)
        if nuevas:
            registrar(
                RegistroAuditoria.Accion.MODIFICAR,
                recurso="alerta_seguridad",
                descripcion=f"Marcó como revisadas {len(nuevas)} alertas de seguridad",
                request=request,
            )
        return Response({"revisadas": len(nuevas)})

    @action(detail=False, methods=["get"])
    def exportar(self, request):
        """CSV de las alertas de seguridad con los mismos filtros de la lista (``estado``,
        ``nivel``, ``tipo``, ``q``), de la más reciente a la más antigua. Queda auditado."""
        consulta = self.get_queryset()
        encabezado = [
            "alerta",
            "tipo",
            "nivel",
            "estado",
            "titulo",
            "detalle",
            "usuario",
            "correo",
            "ip",
            "eventos",
            "creada",
            "ultimo_evento",
            "revisada_por",
            "fecha_revision",
            "nota",
        ]

        def fecha(valor):
            return timezone.localtime(valor).isoformat() if valor else ""

        def filas():
            for a in consulta.iterator(chunk_size=500):
                yield [
                    a.pk,
                    a.tipo,
                    a.nivel,
                    a.estado,
                    a.titulo,
                    a.detalle,
                    a.usuario.get_full_name() if a.usuario_id else "",
                    a.usuario.correo if a.usuario_id else a.usuario_correo,
                    a.ip or "",
                    a.eventos,
                    fecha(a.creada),
                    fecha(a.ultimo_evento),
                    a.revisada_por.get_full_name() if a.revisada_por_id else "",
                    fecha(a.fecha_revision),
                    a.nota,
                ]

        archivo = f"alertas-seguridad-{timezone.localdate():%Y-%m-%d}.csv"
        return respuesta_csv(request, "alertas_seguridad", encabezado, filas(), archivo)

    @action(detail=False, methods=["get"])
    def resumen(self, request):
        """Contador del menú y cifras de la página: nuevas, críticas, por tipo (30 días) y
        cuentas sin la verificación en dos pasos obligatoria (calculado al vuelo)."""
        nuevas = AlertaSeguridad.objects.filter(estado=Estado.NUEVA)
        hace_30 = timezone.now() - timedelta(days=30)
        por_tipo = dict(
            AlertaSeguridad.objects.filter(ultimo_evento__gte=hace_30)
            .values_list("tipo")
            .annotate(n=Count("num"))
        )
        return Response(
            {
                "nuevas": nuevas.count(),
                "criticas": nuevas.filter(nivel=AlertaSeguridad.Nivel.CRITICO).count(),
                "ultimos_30_dias": sum(por_tipo.values()),
                "por_tipo": [
                    {"tipo": t.value, "total": por_tipo.get(t.value, 0)}
                    for t in AlertaSeguridad.Tipo
                ],
                "sin_2fa": alertas.cuentas_sin_2fa(),
            }
        )


# ── Notificaciones de la consola (campana) y preferencias ───────────────────────────────────


class NotificacionSeguridadSerializer(serializers.ModelSerializer):
    alerta = AlertaSeguridadSerializer()

    class Meta:
        model = NotificacionSeguridad
        fields = ["num", "alerta", "nivel", "fecha", "leida", "correo_enviado"]


class PreferenciasSerializer(serializers.ModelSerializer):
    niveles_consola = serializers.ListField(
        child=serializers.ChoiceField(choices=NIVELES), allow_empty=True
    )
    niveles_correo = serializers.ListField(
        child=serializers.ChoiceField(choices=NIVELES), allow_empty=True
    )

    class Meta:
        model = PreferenciaAvisosSeguridad
        fields = ["niveles_consola", "niveles_correo"]

    def validate_niveles_consola(self, valor):
        return sorted(set(valor))

    def validate_niveles_correo(self, valor):
        return sorted(set(valor))


class NotificacionSeguridadViewSet(ConsolaMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Notificaciones del superusuario que consulta, con los niveles que eligió para la campana."""

    serializer_class = NotificacionSeguridadSerializer

    def get_queryset(self):
        pref = alertas.preferencias(self.request.user)
        qs = NotificacionSeguridad.objects.filter(
            usuario=self.request.user, nivel__in=pref.niveles_consola
        ).select_related("alerta__usuario", "alerta__revisada_por")
        if self.request.query_params.get("leida") in ("true", "false"):
            qs = qs.filter(leida=self.request.query_params["leida"] == "true")
        return qs

    def list(self, request, *args, **kwargs):
        respuesta = super().list(request, *args, **kwargs)
        respuesta.data["no_leidas"] = self.get_queryset().filter(leida=False).count()
        return respuesta

    @action(detail=False, methods=["post"])
    def leer(self, request):
        """Marca como leídas las ``nums`` indicadas, o todas si no se manda la lista."""
        qs = NotificacionSeguridad.objects.filter(usuario=request.user, leida=False)
        nums = request.data.get("nums")
        if nums is not None:
            if not isinstance(nums, list):
                raise ValidationError({"nums": "Debe ser una lista."})
            qs = qs.filter(pk__in=[n for n in nums if isinstance(n, int)])
        return Response({"leidas": qs.update(leida=True)})

    @action(detail=False, methods=["get", "patch"])
    def preferencias(self, request):
        pref = alertas.preferencias(request.user)
        if request.method == "PATCH":
            entrada = PreferenciasSerializer(pref, data=request.data, partial=True)
            entrada.is_valid(raise_exception=True)
            pref = entrada.save(usuario=request.user, actualizado=timezone.now())
        return Response(PreferenciasSerializer(pref).data)
