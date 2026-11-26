"""Configuración común para todos los entornos de Núcleo."""

import sys
from pathlib import Path

import environ
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    DB_CONN_MAX_AGE=(int, 0),
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
    "drf_spectacular",
    "drf_spectacular_sidecar",
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
    "apps.avisos",
    "apps.reportes",
    "apps.nico",
    "apps.tiempo_real",
    "apps.auditoria",
    "apps.integraciones",
    "apps.consola",
]

ASGI_APPLICATION = "config.asgi.application"

# Canal en vivo: Redis intermedia los mensajes entre procesos. Sin REDIS_URL se usa la
# memoria del proceso, útil en pruebas y con un solo proceso.
REDIS_URL = "" if "test" in sys.argv[1:2] else env("REDIS_URL", default="")
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            # redis-py 8 corta cualquier lectura a los 5 s, lo mismo que espera channels_redis a
            # que llegue un mensaje (BZPOPMIN de 5 s): sin margen, cada conexión del panel en vivo
            # se caía con «Timeout reading» y se reconectaba cada ~6 s. Con 15 s la espera termina
            # antes que el corte.
            "CONFIG": {"hosts": [{"address": REDIS_URL, "socket_timeout": 15}]},
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
    # Deja la petición en curso a la bitácora de auditoría (quién hizo cada cambio).
    "apps.auditoria.servicios.PeticionActual",
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
    "DEFAULT_PAGINATION_CLASS": "common.paginacion.Paginacion",
    "PAGE_SIZE": 50,
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    "EXCEPTION_HANDLER": "common.exceptions.manejar_excepcion",
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
        "recuperar": "5/hour",
        "solicitud": "5/hour",
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
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# Esquema OpenAPI (/api/v1/esquema/) y Swagger (/api/v1/docs/), solo con sesión o token de API.
# Los archivos de Swagger se sirven desde el servidor (sidecar), sin CDN.
SPECTACULAR_SETTINGS = {
    "TITLE": "API de Núcleo",
    "DESCRIPTION": (
        "Monitoreo ambiental IoT. Autenticación: `Authorization: Token <token>` (web y app), "
        "`Authorization: ApiKey nuc_…` (integraciones, solo lectura) o la sesión de la web. "
        "Contrato completo en Context/api/contrato-api.md."
    ),
    "VERSION": "1",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAuthenticated"],
    "SERVE_AUTHENTICATION": [
        "common.autenticacion.TokenCaducable",
        "rest_framework.authentication.SessionAuthentication",
        "apps.integraciones.autenticacion.TokenAPIAutenticacion",
    ],
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
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
MQTT_PUBLICAR_CONFIG = env.bool("MQTT_PUBLICAR_CONFIG", default=True)
# Puente de Nico AI por MQTT: el ESP late (y su último mensaje avisa si se pierde) y firma cada
# petición del agente antes de que el servidor use la IA.
MQTT_TOPIC_LATIDO = env("MQTT_TOPIC_LATIDO", default="nucleo/devices/+/latido")
MQTT_TOPIC_PUENTE_AUTORIZA = env(
    "MQTT_TOPIC_PUENTE_AUTORIZA", default="nucleo/devices/+/puente/autoriza"
)
MQTT_TOPIC_PUENTE_PETICION = env(
    "MQTT_TOPIC_PUENTE_PETICION", default="nucleo/devices/{codigo_mqtt}/puente/peticion"
)

# Reglas de monitoreo.
NUCLEO_SIN_CONEXION_FACTOR = env.int("NUCLEO_SIN_CONEXION_FACTOR", default=3)

# Nico AI según la carga del servidor (apps/reportes/carga.py): memoria libre en MB y peticiones
# por usuario por minuto en cada nivel. Con memoria «alta» o «crítica» no se usa la IA.
NUCLEO_AGENTE_RAM_ALTA_MB = env.int("NUCLEO_AGENTE_RAM_ALTA_MB", default=1200)
NUCLEO_AGENTE_RAM_CRITICA_MB = env.int("NUCLEO_AGENTE_RAM_CRITICA_MB", default=500)
NUCLEO_AGENTE_LIMITE_NORMAL = env.int("NUCLEO_AGENTE_LIMITE_NORMAL", default=30)
NUCLEO_AGENTE_LIMITE_ALTA = env.int("NUCLEO_AGENTE_LIMITE_ALTA", default=10)
NUCLEO_AGENTE_LIMITE_CRITICA = env.int("NUCLEO_AGENTE_LIMITE_CRITICA", default=4)
NUCLEO_AGENTE_MANTENIMIENTO = env(
    "NUCLEO_AGENTE_MANTENIMIENTO", default=str(BASE_DIR / "var" / "agente-mantenimiento")
)
NUCLEO_BATERIA_BAJA_PCT = env.int("NUCLEO_BATERIA_BAJA_PCT", default=20)
# Voz de Nico (apps/nico/voz.py): motor («supertonic» o «piper» de respaldo) y carpeta de los
# modelos (deploy/instalar.sh los descarga ahí).
NUCLEO_VOZ_MOTOR = env("NUCLEO_VOZ_MOTOR", default="supertonic")
NUCLEO_VOZ_DIR = env("NUCLEO_VOZ_DIR", default="~/.local/share/nucleo/voces")
# Supertonic 2: voz masculina (M1 a M5; M3 = grave y tranquila, la más estable; M4 = tono medio),
# pasos de síntesis (más = más limpia y más lenta) y ritmo (> 1 = más ágil).
NUCLEO_SUPERTONIC_ESTILO = env("NUCLEO_SUPERTONIC_ESTILO", default="M3")
NUCLEO_SUPERTONIC_PASOS = env.int("NUCLEO_SUPERTONIC_PASOS", default=8)
NUCLEO_SUPERTONIC_RITMO = env.float("NUCLEO_SUPERTONIC_RITMO", default=1.05)
# Piper (respaldo): voz y ritmo (< 1 = más ágil).
NUCLEO_PIPER_VOZ = env("NUCLEO_PIPER_VOZ", default="es_MX-ald-medium")
NUCLEO_PIPER_RITMO = env.float("NUCLEO_PIPER_RITMO", default=0.92)
NUCLEO_ALERTAS_MAX_SEGUNDOS = 120
NUCLEO_TOKEN_DIAS_SIN_USO = env.int("NUCLEO_TOKEN_DIAS_SIN_USO", default=7)
# Cookie HttpOnly de la sesión web (common/autenticacion.py). Segura (solo HTTPS) fuera de DEBUG.
NUCLEO_COOKIE_SESION = "nucleo_sesion"
NUCLEO_COOKIE_SEGURA = env.bool("NUCLEO_COOKIE_SEGURA", default=not DEBUG)
NUCLEO_EXPO_PUSH_URL = env("NUCLEO_EXPO_PUSH_URL", default="https://exp.host/--/api/v2/push/send")
NUCLEO_PUSH_HABILITADO = env.bool("NUCLEO_PUSH_HABILITADO", default=False)

# Seguridad (Context/seguridad/seguridad.md).
# Detrás de Cloudflare Tunnel, la IP real del visitante llega en CF-Connecting-IP (common/red.py).
NUCLEO_CONFIAR_CF_CONNECTING_IP = env.bool("NUCLEO_CONFIAR_CF_CONNECTING_IP", default=False)
# Llave Fernet de los datos cifrados en la base (common/cifrado.py). Vacía: se deriva de
# DJANGO_SECRET_KEY (solo para desarrollo). En producción se guarda una copia fuera del servidor.
NUCLEO_CLAVE_CIFRADO = env("NUCLEO_CLAVE_CIFRADO", default="")
# Roles que deben usar la verificación en dos pasos, p. ej. ADMINPLAT,ADMIN. Vacío: opcional.
NUCLEO_2FA_OBLIGATORIO = env.list("NUCLEO_2FA_OBLIGATORIO", default=[])
# Dirección de la web, para el enlace de recuperación de contraseña.
NUCLEO_URL_WEB = env("NUCLEO_URL_WEB", default="http://localhost:5173")
PASSWORD_RESET_TIMEOUT = env.int("NUCLEO_RECUPERAR_SEGUNDOS", default=3600)
# Días que se guarda la bitácora de auditoría (manage.py depurar_auditoria).
NUCLEO_AUDITORIA_DIAS = env.int("NUCLEO_AUDITORIA_DIAS", default=365)
# Correos que reciben los avisos del servidor (servicio caído, respaldo, prueba de
# restauración). Vacío: los administradores de plataforma activos.
NUCLEO_CORREOS_AVISOS = env.list("NUCLEO_CORREOS_AVISOS", default=[])
# Tope de filas de una exportación CSV.
NUCLEO_EXPORTAR_MAX_FILAS = env.int("NUCLEO_EXPORTAR_MAX_FILAS", default=100000)
# Actualización remota del firmware (manage.py publicar_firmware): carpeta de las versiones
# publicadas y códigos MQTT que la reciben (* = todos; vacío = ninguno).
NUCLEO_FIRMWARE_DIR = env("NUCLEO_FIRMWARE_DIR", default=str(BASE_DIR / "firmware"))
NUCLEO_FIRMWARE_DISPOSITIVOS = env.list("NUCLEO_FIRMWARE_DISPOSITIVOS", default=[])
# Carga de firmware por USB desde la consola de administración (apps/consola/flasheo.py): código
# y MicroPython de IoT/micropython, alta del usuario MQTT en Mosquitto y host que usa la placa.
NUCLEO_IOT_DIR = env("NUCLEO_IOT_DIR", default=str(BASE_DIR.parent / "IoT" / "micropython"))
NUCLEO_MOSQUITTO_PASSWD = env(
    "NUCLEO_MOSQUITTO_PASSWD", default=str(BASE_DIR.parent / "Mosquitto" / "config" / "passwd")
)
NUCLEO_MOSQUITTO_CONTENEDOR = env("NUCLEO_MOSQUITTO_CONTENEDOR", default="nucleo_mosquitto")
NUCLEO_ESP_HOST = env("NUCLEO_ESP_HOST", default="dispositivos.bynucleo.com")
# Días que se guardan las lecturas (manage.py retencion_lecturas). 0 = todas; de todos modos las
# de más de 30 días se comprimen (migración mediciones 0002).
NUCLEO_LECTURAS_RETENCION_DIAS = env.int("NUCLEO_LECTURAS_RETENCION_DIAS", default=0)

# Servicio externo de IA para redactar reportes; el proveedor está por definir.
IA_PROVEEDOR = env("IA_PROVEEDOR", default="")
IA_API_KEY = env("IA_API_KEY", default="")
IA_MODELO = env("IA_MODELO", default="")
# Nico AI con IA local (Ollama) a través del ESP32 de cada dispositivo (apps/reportes/puente.py).
# Sin clave el puente está apagado y el agente responde solo con respuestas predefinidas.
IA_PUENTE_CLAVE = env("IA_PUENTE_CLAVE", default="")
IA_MODELO_LOCAL = env("IA_MODELO_LOCAL", default="qwen3:4b-instruct")
# Ollama visto desde el backend (modo ligero del puente: el servidor ejecuta la IA).
IA_OLLAMA_URL = env("IA_OLLAMA_URL", default="http://127.0.0.1:11434")
# Dispositivos con ESP32 físico como puente (codigo_mqtt). Los demás son simulados: su agente
# siempre está disponible y responde con lo predefinido y lo aprendido, sin IA.
IA_PUENTE_DISPOSITIVOS = env.list("IA_PUENTE_DISPOSITIVOS", default=[])
IA_ESPERA_SEGUNDOS = env.float("IA_ESPERA_SEGUNDOS", default=40)
# 👍 que necesita una misma pregunta (en ocasiones distintas y con la misma respuesta o ruta)
# para entrar al banco de Nico AI. Con 1 basta un 👍; con 2 se evita aprender de un acierto suelto.
IA_VOTOS_PARA_APRENDER = env.int("IA_VOTOS_PARA_APRENDER", default=2)

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
# Nombre del archivo en las descargas CSV cuando la web y la API están en orígenes distintos.
CORS_EXPOSE_HEADERS = ["Content-Disposition"]
# En desarrollo la web (5173) y la API (8000) son orígenes distintos: la cookie de sesión viaja
# con credentials: "include" y el encabezado X-Nucleo-Cliente debe estar permitido.
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "x-nucleo-cliente")
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
