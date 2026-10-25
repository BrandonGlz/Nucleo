from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.organizaciones.models import Area
from apps.usuarios.models import TelefonoPush, Usuario
from common import roles


class UsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=False, style={"input_type": "password"}
    )
    ultimo_acceso = serializers.DateTimeField(source="last_login", read_only=True)

    class Meta:
        model = Usuario
        fields = [
            "num",
            "organizacion",
            "area",
            "rol",
            "estado_usuario",
            "nombre",
            "primer_apellido",
            "segundo_apellido",
            "correo",
            "telefono",
            "password",
            "ultimo_acceso",
            "fecha_registro",
        ]
        read_only_fields = ["num", "organizacion", "fecha_registro"]

    def validate_password(self, valor):
        validate_password(valor)
        return valor

    def validate(self, datos):
        actor = self.context["request"].user
        instancia = self.instance

        if actor.rol_id == roles.SUPERVISOR:
            # El supervisor solo da de alta y baja operadores de su área.
            datos["rol"] = datos.get("rol") or (instancia.rol if instancia else None)
            if datos["rol"] is None or datos["rol"].pk != roles.OPERADOR:
                raise serializers.ValidationError(
                    {"rol": "Un supervisor solo gestiona operadores."}
                )
            area = Area.objects.filter(pk=actor.area_id).first()
            datos["area"] = area

        area = datos.get("area", instancia.area if instancia else None)
        rol = datos.get("rol", instancia.rol if instancia else None)
        if rol is not None and rol.pk == roles.ADMIN_PLATAFORMA:
            raise serializers.ValidationError(
                {"rol": "El administrador de plataforma no se gestiona desde una organización."}
            )
        if area is not None and area.organizacion_id != actor.organizacion_id:
            raise serializers.ValidationError({"area": "El área no pertenece a su organización."})
        if rol is not None and rol.pk in (roles.SUPERVISOR, roles.OPERADOR) and area is None:
            raise serializers.ValidationError({"area": "Este rol requiere un área."})
        if instancia is None and "password" not in datos:
            raise serializers.ValidationError({"password": "La contraseña es obligatoria."})
        return datos

    def create(self, datos):
        password = datos.pop("password")
        datos["organizacion"] = self.context["request"].user.organizacion
        return Usuario.objects.create_user(password=password, **datos)

    def update(self, instancia, datos):
        password = datos.pop("password", None)
        usuario = super().update(instancia, datos)
        if password:
            usuario.set_password(password)
            usuario.save(update_fields=["password"])
        return usuario


class LoginSerializer(serializers.Serializer):
    """``token_expo`` y ``plataforma`` los envía la app móvil para recibir notificaciones push."""

    correo = serializers.EmailField()
    password = serializers.CharField(style={"input_type": "password"}, trim_whitespace=False)
    token_expo = serializers.CharField(max_length=255, required=False)
    plataforma = serializers.ChoiceField(choices=TelefonoPush.Plataforma.choices, required=False)

    def validate(self, datos):
        if ("token_expo" in datos) != ("plataforma" in datos):
            raise serializers.ValidationError(
                {"token_expo": "Envíe el token y la plataforma del teléfono juntos."}
            )
        return datos


class CierreSesionSerializer(serializers.Serializer):
    token_expo = serializers.CharField(max_length=255, required=False)


class PrimerAdministradorSerializer(serializers.ModelSerializer):
    """Alta del primer administrador de una organización por el administrador de plataforma."""

    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = Usuario
        fields = [
            "num",
            "nombre",
            "primer_apellido",
            "segundo_apellido",
            "correo",
            "telefono",
            "password",
        ]
        read_only_fields = ["num"]

    def validate_password(self, valor):
        validate_password(valor)
        return valor

    def create(self, datos):
        return Usuario.objects.create_user(
            rol_id=roles.ADMIN,
            organizacion=self.context["organizacion"],
            **datos,
        )


class CambiarPasswordSerializer(serializers.Serializer):
    password_actual = serializers.CharField(style={"input_type": "password"})
    password_nueva = serializers.CharField(style={"input_type": "password"})

    def validate_password_nueva(self, valor):
        validate_password(valor, self.context["request"].user)
        return valor
