from django import forms
from django.contrib import admin
from django.contrib.auth.password_validation import validate_password

from .models import TelefonoPush, Usuario


class UsuarioAdminForm(forms.ModelForm):
    nueva_password = forms.CharField(
        label="Contraseña",
        required=False,
        widget=forms.PasswordInput(render_value=False),
        help_text="Obligatoria al crear; al editar, déjela vacía para conservar la actual.",
    )

    class Meta:
        model = Usuario
        exclude = ("password", "last_login")

    def clean_nueva_password(self):
        valor = self.cleaned_data["nueva_password"]
        if not self.instance.pk and not valor:
            raise forms.ValidationError("La contraseña es obligatoria.")
        if valor:
            validate_password(valor)
        return valor


@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    form = UsuarioAdminForm
    list_display = ("correo", "nombre", "primer_apellido", "organizacion", "rol", "estado_usuario")
    list_filter = ("organizacion", "rol", "estado_usuario")
    search_fields = ("correo", "nombre", "primer_apellido")
    readonly_fields = ("fecha_registro",)

    def save_model(self, request, obj, form, change):
        if form.cleaned_data.get("nueva_password"):
            obj.set_password(form.cleaned_data["nueva_password"])
        super().save_model(request, obj, form, change)


@admin.register(TelefonoPush)
class TelefonoPushAdmin(admin.ModelAdmin):
    list_display = ("usuario", "plataforma", "fecha_registro")
    list_filter = ("plataforma",)
    readonly_fields = ("fecha_registro",)
