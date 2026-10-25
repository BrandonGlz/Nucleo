# Estructura del backend

## Tecnologías

- Python 3.12.15 en `BackEnd/.venv` (entorno exclusivo, no versionado).
- Django 5.2.18 LTS y Django REST Framework 3.18.3.
- PostgreSQL 17.11 y TimescaleDB 2.31 mediante `psycopg[binary]` 3.3.6.
- `paho-mqtt` 2.1.0 para el cliente MQTT y `reportlab` 4.4.4 para los PDF.
- Configuración por variables de entorno con `django-environ`.
- CORS con `django-cors-headers`.
- Django Channels 4.3, Daphne 4.2 y `channels-redis` 4.3 (Redis 7) para el canal en vivo.

Las versiones están fijadas en `requirements.txt`; `requirements-dev.txt` añade
Ruff para análisis estático.

## Organización

```text
BackEnd/
├── config/
│   ├── settings/
│   │   ├── base.py          # configuración común y lectura de .env
│   │   ├── development.py   # DEBUG, CORS y renderer navegable
│   │   └── production.py    # endurecimiento y configuración por entorno
│   ├── urls.py              # admin y /api/v1/
│   ├── asgi.py
│   └── wsgi.py
├── apps/
│   ├── core/                # salud de la API
│   ├── catalogos/           # rol, estados y variable_ambiental con su rango (códigos iniciales)
│   ├── organizaciones/      # organizacion y area
│   ├── usuarios/            # usuario (modelo de usuario de Django), telefono_push, login y gestión
│   ├── dispositivos/        # dispositivo y sensor; marcado de "Sin conexión"
│   ├── umbrales/            # umbral de cuatro límites por variable y dispositivo
│   ├── mediciones/          # lectura (TimescaleDB); ingesta MQTT y consultas de histórico
│   ├── alertas/             # alerta y notificacion; correo y push con Expo
│   ├── tiempo_real/         # WebSocket ws/panel/: consumidor, eventos y rutas
│   └── reportes/            # reporte y programacion_reporte; cifras, IA y PDF
├── common/                  # roles, permisos, token con caducidad, aislamiento por organización,
│                            # errores y utilidades de prueba
├── scripts/                 # scripts operativos
├── manage.py
├── requirements.txt
├── requirements-dev.txt
└── .env.example
```

Cada app sigue la misma disposición: `models.py`, `serializers.py`, `views.py`,
`urls.py`, `admin.py`, `tests.py` y, cuando hay reglas de negocio, un módulo de
servicios.

## Modelo de datos

Las migraciones de Django crean 16 tablas en PostgreSQL (`nucleo_db`) y la
hypertable `lectura` en TimescaleDB (`nucleo_iot`). Los nombres de tabla y de
columna son los del modelo (`db_table` y `db_column`), por ejemplo
`usuario.estado_usuario_codigo` o `lectura.recibida_en`.
El detalle está en `Context/base-de-datos/modelo-relacional.md`.

- `AUTH_USER_MODEL = "usuarios.Usuario"`. El acceso es por `correo`; los
  permisos salen del rol, sin tablas de grupos propias.
- Las restricciones del modelo viven en la base: `CHECK` del orden de los cuatro
  límites de cada umbral, del rol de plataforma sin organización, de intervalo
  de muestreo, de estado y tipo de alerta, unicidad de umbral por variable y
  dispositivo, y los índices de consulta.
- Las claves de los catálogos se cargan con la migración
  `catalogos/0002_datos_iniciales.py`.
- Los valores por defecto de la tabla (`now()`, `TRUE`, `30`) se definen con
  `db_default`.
- Dos bases: `DATABASES` define `default` (`DATABASE_URL`) e `iot`
  (`IOT_DATABASE_URL`). `apps/core/routers.py` (`LecturaRouter`) manda la app
  `mediciones` a `iot` y permite sus migraciones solo allí. No hay llaves foráneas
  entre bases: `Lectura` guarda `sensor_num` y `variable_codigo` como valores, y el
  código junta ambos lados en `apps/mediciones/consultas.py`.
- La migración de `mediciones` ajusta la llave a `(num, fecha_hora)`, deja `num`
  como identidad `GENERATED ALWAYS` y llama a `create_hypertable` con bloques de
  un día. Django no crea `ON DELETE CASCADE` ni `SET NULL` en la base; esas reglas
  (`telefono_push`, `notificacion.telefono_push_num`) solo están en los scripts SQL.

## Configuración

`config/settings/base.py` es la base común. `manage.py`, ASGI y WSGI seleccionan
el módulo por defecto:

- desarrollo (`manage.py`): `config.settings.development`;
- despliegue (WSGI/ASGI): `config.settings.production`, sobrescribible con
  `DJANGO_SETTINGS_MODULE`.

Variables principales:

```text
BackEnd/.env
├── Obligatorias
│   ├── DJANGO_SECRET_KEY       Clave secreta de Django
│   ├── DATABASE_URL            postgres://nucleo_app:...@127.0.0.1:55432/nucleo_db
│   ├── IOT_DATABASE_URL        postgres://nucleo_iot:...@127.0.0.1:55433/nucleo_iot
│   └── DJANGO_ALLOWED_HOSTS    Lista separada por comas
├── Opcionales
│   ├── REDIS_URL               redis://:clave@127.0.0.1:56379/0 (vacío: capa en memoria, un proceso)
│   ├── DJANGO_DEBUG            True en desarrollo
│   ├── CORS_ALLOWED_ORIGINS    Orígenes de la web
│   ├── CSRF_TRUSTED_ORIGINS    Orígenes confiables
│   └── DJANGO_TIME_ZONE        Por defecto America/Tijuana
├── Broker MQTT
│   ├── MQTT_HOST, MQTT_PORT    Broker Mosquitto (8883 con TLS)
│   ├── MQTT_USERNAME, MQTT_PASSWORD
│   ├── MQTT_USE_TLS, MQTT_CA_CERT
│   ├── MQTT_TOPIC_LECTURAS     nucleo/devices/+/measurements
│   ├── MQTT_TOPIC_CONFIG       nucleo/devices/{codigo_mqtt}/config
│   └── MQTT_PUBLICAR_CONFIG    True para enviar intervalo y umbrales al dispositivo
├── Correo
│   └── EMAIL_BACKEND, EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD,
│       EMAIL_USE_TLS, DEFAULT_FROM_EMAIL     (por defecto se imprime en consola)
├── Monitoreo
│   ├── NUCLEO_SIN_CONEXION_FACTOR   Intervalos sin datos para marcar "Sin conexión" (3)
│   ├── NUCLEO_BATERIA_BAJA_PCT      Porcentaje de "Batería baja" (20)
│   ├── NUCLEO_TOKEN_DIAS_SIN_USO    Días sin uso para que caduque el token (7)
│   ├── NUCLEO_PUSH_HABILITADO       False; True envía push con Expo
│   └── NUCLEO_EXPO_PUSH_URL         https://exp.host/--/api/v2/push/send
└── IA
    └── IA_PROVEEDOR, IA_API_KEY, IA_MODELO
```

Las URL de base deben usar el esquema `postgres://`; el arranque falla si se
configura otro motor.

## Autenticación y permisos

- `POST /api/v1/auth/login/` devuelve un token de DRF que web y móvil envían como
  `Authorization: Token <token>`. El inicio de sesión tiene un límite de 10
  intentos por minuto.
- El token caduca a los 7 días sin uso (`common/autenticacion.py`, `TokenCaducable`): usa
  `Token.created` como último uso, lo renueva en cada petición (como máximo una vez por
  minuto) y, si ya caducó, responde 401; un nuevo inicio de sesión crea un token nuevo.
- Solo pueden iniciar sesión las cuentas en estado Activo de una organización
  activa (las de una organización suspendida o dada de baja no entran). El
  administrador de plataforma no tiene organización.
- El inicio de sesión de la app móvil puede enviar `token_expo` y `plataforma`; se
  guarda en `telefono_push` (un usuario puede tener varios, y un token que cambia de
  usuario se reasigna). `POST /auth/logout/` con `token_expo` lo elimina.
- `common/permissions.py` define `PermisoPorRol`: cada vista declara qué roles
  leen, qué roles escriben y qué roles ejecutan cada acción especial.
- `common/scoping.py` aísla los datos. Toda consulta parte de la organización del
  usuario; además el operador solo ve su dispositivo asignado y el supervisor y el
  analista con área solo ven su área.

```text
Rol            Lo que hace
├── ADMINPLAT  Equipo Núcleo: alta, suspensión y baja de organizaciones; sin datos de ellas
├── ADMIN      Gestiona áreas, usuarios, dispositivos, sensores y umbrales de su organización
├── SUPER      Gestiona operadores de su área, intervalo de muestreo, umbrales y alertas
├── ANALISTA   Consulta histórico y genera reportes
└── OPER       Consulta en tiempo real su dispositivo asignado
```

El administrador de plataforma da de alta, suspende y da de baja las organizaciones
con la API (`/organizaciones/`) o el panel `/admin/`, y crea el primer administrador
de cada una con `POST /organizaciones/{num}/primer-administrador/`. No consulta
dispositivos, lecturas, alertas, umbrales, usuarios ni reportes.

## Ingesta de lecturas y alertas

El comando `manage.py escuchar_mqtt` mantiene una única conexión compartida al
broker (`apps/mediciones/mqtt.py`, patrón Singleton). Por cada mensaje:

1. `apps/mediciones/services.py` valida el JSON, el dispositivo (por
   `codigo_mqtt`), el sensor, la variable y el rango físico de cada valor. Una
   lectura inválida se descarta y las demás del mensaje se guardan.
2. Se guardan en TimescaleDB las lecturas con su hora de medición y de recepción. El
   aire del CCS811 se marca `estabilizada = false` si el mensaje trae
   `aire_estabilizado: false`, y se actualizan `ultima_conexion`, `nivel_bateria`
   (campo `bateria` del mensaje) y el estado del dispositivo: `CALENT` durante el
   calentamiento (con `ultimo_arranque`), `BATBAJA` o `LINEA`.
3. Cada lectura estabilizada se clasifica con `Umbral.clasificar`: Normal dentro de
   los límites de advertencia, Advertencia entre estos y los de peligro, Peligro más
   allá.
4. `apps/alertas/services.py` crea la alerta (con `lectura_num`, `lectura_fecha_hora`
   y `lectura_valor`, porque no hay llave a la otra base) y una notificación por
   responsable y canal en una sola transacción. Mientras haya una alerta pendiente del
   mismo umbral y nivel no se crea otra; si una advertencia escala a peligro se crea
   una nueva.
5. Reciben correo los supervisores del área; si no hay, los administradores. Con
   `NUCLEO_PUSH_HABILITADO` también se envía push a los teléfonos registrados
   (`apps/alertas/notificaciones.py` llama a la API de Expo y borra el teléfono si Expo
   responde `DeviceNotRegistered`; un fallo nunca interrumpe la ingesta).
6. La alerta nueva y el cambio de estado del dispositivo se publican en el canal en vivo.

`manage.py marcar_sin_conexion [--cada N]` marca como "Sin conexión" los
dispositivos que llevan más de tres intervalos de muestreo sin enviar lecturas.

Cuando `MQTT_PUBLICAR_CONFIG` está activo, al cambiar el intervalo o los umbrales
de un dispositivo el backend publica su configuración como mensaje retenido en
`MQTT_TOPIC_CONFIG`.

## Canal en vivo

`apps/tiempo_real/` ofrece `ws/panel/?token=<token>` (`PanelConsumer`, rutas en
`routing.py`, `config/asgi.py` con `ProtocolTypeRouter`). Autentica con el mismo token de
la API (código de cierre 4401 si falta, es falso, está caducado o es del administrador
de plataforma), une la conexión al grupo `org.<n>` y entrega solo los eventos que el rol
puede ver. `eventos.py` publica `alerta.nueva`, `alerta.atendida`, `alerta.descartada` y
`dispositivo.estado` con `transaction.on_commit`; si Redis no responde, el error se registra y
quien publicó sigue su curso. Redis (servicio `redis` de Docker Compose) hace de capa de
canales entre procesos (consumidor MQTT, servidor web y cron). Los formatos están en
`Context/api/contrato-api.md`.

Daphne es la primera app instalada, así que `manage.py runserver` ya atiende HTTP y
WebSocket. Fuera de desarrollo: `daphne -b 0.0.0.0 -p 8000 config.asgi:application`.

## Reportes

`apps/reportes/servicios.py` calcula los promedios, mínimos, máximos, picos y conteo
de alertas (por estado, nivel, tipo y variable) del periodo y los guarda en
`reporte.cifras`. Las lecturas se agregan en TimescaleDB solo con `estabilizada = true`
y las alertas se leen en PostgreSQL; el código junta los sensores de la organización
y del área con sus dispositivos.
`apps/reportes/ia.py` solicita a la IA solo la redacción del texto; si el
servicio no está configurado o no responde, la API responde 503 y no guarda nada.
`cifras` incluye `intervalo_serie` (por hora si el periodo dura hasta 3 días; si no, por
día) y `series` por variable con promedio, mínimo y máximo de cada tramo. El PDF se genera
con ReportLab, dibuja una curva por variable con sus picos y el conteo por nivel, y se
guarda en `media/reportes/`.

Las programaciones (`/programaciones-reporte/`, ADMIN, SUPER y ANALISTA) guardan
frecuencia diaria, semanal o mensual, área opcional, destinatarios (usuarios de la
misma organización) y `proxima_ejecucion`, que por defecto es un periodo adelante.
`manage.py generar_reportes_programados` busca las programaciones activas vencidas de
organizaciones activas, genera el reporte del periodo anterior, lo envía por correo con
el PDF adjunto y fija la siguiente ejecución; si la IA no responde la programación
sigue vencida y se reintenta en la siguiente corrida. Se programa con cron o un
temporizador del sistema.

## Datos de demostración

`manage.py sembrar_demo` (solo con `DJANGO_DEBUG=True`) crea la organización, un
área, un usuario por rol (incluido el administrador de plataforma) y el dispositivo
`NUC-001` con sus sensores DHT22 y CCS811 y umbrales de cuatro límites.
Imprime una vez la contraseña generada de cada usuario.

## API

Prefijo `/api/v1/`; el contrato completo está en `Context/api/contrato-api.md`.
`config/urls.py` incluye las rutas de cada app.

## Pruebas y calidad

```bash
cd BackEnd
.venv/bin/python manage.py check
.venv/bin/python manage.py test
.venv/bin/ruff check .
```

Las pruebas (134) usan dos bases temporales, `test_nucleo_db` y `test_nucleo_iot`, que
Django crea y elimina; el usuario de la base debe poder crear bases (en desarrollo, el
superusuario del contenedor). Las clases heredan de `common.testing.PruebaBase`; las del
canal en vivo, de `PruebaTransaccional`, porque Channels cierra conexiones y necesita
transacciones reales. Con `test`, el canal usa una capa en memoria.
Cubren las restricciones de ambas bases, la hypertable, el aislamiento por
organización, los permisos por rol, la ingesta con alertas y calentamiento, los
teléfonos push y su envío con Expo, la caducidad del token, el canal en vivo con su filtro
por rol, el administrador de plataforma, los reportes y sus programaciones.

## Migraciones

```bash
cd BackEnd
source .venv/bin/activate
python manage.py makemigrations
python manage.py migrate
python manage.py migrate --database=iot
```

`migrate` actúa sobre `nucleo_db` y `migrate --database=iot` sobre `nucleo_iot`; cada
comando aplica solo las migraciones de sus apps. TimescaleDB debe estar encendido.

## Producción

`config/settings/production.py` exige `DJANGO_ALLOWED_HOSTS`, activa redirección
SSL y cookies seguras, y permite configurar HSTS y proxy TLS por variables de
entorno. El servidor de desarrollo no debe usarse en producción. En producción se sirve con
Daphne (`config.asgi:application`, HTTP y WebSocket) con Redis encendido; el proxy inverso
y su configuración de WebSocket quedan pendientes de decisión. Los usuarios de base de datos
sin superusuario se crean con `Database/crear-roles.sh`.
