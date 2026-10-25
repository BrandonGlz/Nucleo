"""Configuración para producción.

Los valores de despliegue deben definirse mediante variables de entorno.
"""

from .base import *  # noqa: F403

DEBUG = False

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")  # noqa: F405
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])  # noqa: F405
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])  # noqa: F405

SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)  # noqa: F405
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=3600)  # noqa: F405
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(  # noqa: F405
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False
)
SECURE_HSTS_PRELOAD = env.bool("DJANGO_SECURE_HSTS_PRELOAD", default=False)  # noqa: F405

if env.bool("DJANGO_TRUST_X_FORWARDED_PROTO", default=False):  # noqa: F405
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

LOGGING["root"]["level"] = env("DJANGO_LOG_LEVEL", default="INFO")  # noqa: F405
