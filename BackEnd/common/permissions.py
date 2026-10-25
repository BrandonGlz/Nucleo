"""Permisos por rol para la API de Núcleo."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from common import roles


class PermisoPorRol(BasePermission):
    """Autoriza según el rol del usuario.

    Cada vista declara:

    - ``roles_lectura``: roles que pueden usar métodos seguros (GET, HEAD, OPTIONS).
    - ``roles_escritura``: roles que pueden crear, modificar o eliminar.
    - ``roles_acciones``: roles por acción personalizada, ``{"atender": (...)}``.
    """

    def has_permission(self, request, view):
        usuario = request.user
        if not (usuario and usuario.is_authenticated):
            return False
        return usuario.rol_id in self.roles_permitidos(request, view)

    @staticmethod
    def roles_permitidos(request, view):
        por_accion = getattr(view, "roles_acciones", {})
        accion = getattr(view, "action", None)
        if accion in por_accion:
            return por_accion[accion]
        if request.method in SAFE_METHODS:
            return getattr(view, "roles_lectura", roles.TODOS)
        return getattr(view, "roles_escritura", (roles.ADMIN,))
