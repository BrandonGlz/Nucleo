"""Configuración común para todos los entornos de Núcleo."""

import sys
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    DB_CONN_MAX_AGE=(int, 60),
    DJANGO_LOG_LEVEL=(str, "INFO"),
)
environ.Env.read_env(BASE_DIR / ".env", overwrite=False, encoding="utf-8")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "channels",
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "apps.core",
    "apps.catalogos",
    "apps.organizaciones",
    "apps.usuarios",
    "apps.dispositivos",
    "apps.umbrales",
    "apps.mediciones",
    "apps.alertas",
    "apps.reportes",
    "apps.tiempo_real",
]

ASGI_APPLICATION = "config.asgi.application"

# Canal en vivo: Redis intermedia los mensajes entre procesos. Sin REDIS_URL se usa la
# memoria del proceso, útil en pruebas y con un solo proceso.
REDIS_URL = "" if "test" in sys.argv[1:2] else env("REDIS_URL", default="")
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

AUTH_USER_MODEL = "usuarios.Usuario"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Dos bases de datos: "default" es nucleo_db (PostgreSQL, información de negocio) e "iot" es
# nucleo_iot (TimescaleDB, lecturas como serie de tiempo). No hay llaves foráneas entre ellas.
DATABASES = {
    "default": env.db("DATABASE_URL"),
    "iot": env.db("IOT_DATABASE_URL"),
}
for _alias, _variable in (("default", "DATABASE_URL"), ("iot", "IOT_DATABASE_URL")):
    DATABASES[_alias]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE")
    DATABASES[_alias]["CONN_HEALTH_CHECKS"] = True
    if DATABASES[_alias]["ENGINE"] != "django.db.backends.postgresql":
        raise ImproperlyConfigured(
            f"Núcleo requiere PostgreSQL. {_variable} debe usar el esquema postgres://."
        )

# El modelo Lectura (app mediciones) vive en nucleo_iot; el resto, en nucleo_db.
DATABASE_ROUTERS = ["apps.core.routers.LecturaRouter"]

if "test" in sys.argv:
    # Cifrado rápido solo durante las pruebas.
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = env("DJANGO_LANGUAGE_CODE", default="es")
TIME_ZONE = env("DJANGO_TIME_ZONE", default="America/Tijuana")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "common.autenticacion.TokenCaducable",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    "EXCEPTION_HANDLER": "common.exceptions.manejar_excepcion",
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
    },
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
}

# Correo para alertas y reportes programados. El proveedor está por definir; en
# desarrollo los mensajes se imprimen en la consola.
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Núcleo <alertas@nucleo.local>")

# Cliente MQTT del backend: una sola conexión compartida al broker Mosquitto.
MQTT_HOST = env("MQTT_HOST", default="localhost")
MQTT_PORT = env.int("MQTT_PORT", default=8883)
MQTT_USERNAME = env("MQTT_USERNAME", default="")
MQTT_PASSWORD = env("MQTT_PASSWORD", default="")
MQTT_CA_CERT = env("MQTT_CA_CERT", default="")
MQTT_USE_TLS = env.bool("MQTT_USE_TLS", default=True)
MQTT_CLIENT_ID = env("MQTT_CLIENT_ID", default="nucleo-backend")
MQTT_TOPIC_LECTURAS = env("MQTT_TOPIC_LECTURAS", default="nucleo/devices/+/measurements")
MQTT_TOPIC_CONFIG = env("MQTT_TOPIC_CONFIG", default="nucleo/devices/{codigo_mqtt}/config")
MQTT_PUBLICAR_CONFIG = env.bool("MQTT_PUBLICAR_CONFIG", default=False)

# Reglas de monitoreo.
NUCLEO_SIN_CONEXION_FACTOR = env.int("NUCLEO_SIN_CONEXION_FACTOR", default=3)
NUCLEO_BATERIA_BAJA_PCT = env.int("NUCLEO_BATERIA_BAJA_PCT", default=20)
NUCLEO_ALERTAS_MAX_SEGUNDOS = 120
NUCLEO_TOKEN_DIAS_SIN_USO = env.int("NUCLEO_TOKEN_DIAS_SIN_USO", default=7)
NUCLEO_EXPO_PUSH_URL = env("NUCLEO_EXPO_PUSH_URL", default="https://exp.host/--/api/v2/push/send")
NUCLEO_PUSH_HABILITADO = env.bool("NUCLEO_PUSH_HABILITADO", default=False)

# Servicio externo de IA para redactar reportes; el proveedor está por definir.
IA_PROVEEDOR = env("IA_PROVEEDOR", default="")
IA_API_KEY = env("IA_API_KEY", default="")
IA_MODELO = env("IA_MODELO", default="")

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "console": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "console",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": env("DJANGO_LOG_LEVEL"),
    },
}
