"""Configuración para desarrollo local."""

from .base import *  # noqa: F403

DEBUG = True

ALLOWED_HOSTS = env.list(  # noqa: F405
    "DJANGO_ALLOWED_HOSTS",
    default=["localhost", "127.0.0.1", "0.0.0.0"],
)

CORS_ALLOWED_ORIGINS = env.list(  # noqa: F405
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"],
)
CSRF_TRUSTED_ORIGINS = env.list(  # noqa: F405
    "CSRF_TRUSTED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"],
)

REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]

LOGGING["root"]["level"] = env("DJANGO_LOG_LEVEL", default="DEBUG")  # noqa: F405
