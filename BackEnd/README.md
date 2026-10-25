# BackEnd — Núcleo

> **En simple:** es la parte que no se ve. Recibe las lecturas del dispositivo
> por MQTT, las guarda, avisa cuando algo sale del rango y responde a la web y a
> la app móvil. Cada persona solo ve los datos de su organización.

Está hecho con Python, Django, Django REST Framework, Django Channels, PostgreSQL,
TimescaleDB y Redis.

## Qué hace

- **Hoy:**
  - Crea las 16 tablas del modelo relacional en PostgreSQL (`nucleo_db`) y la
    hypertable de lecturas en TimescaleDB (`nucleo_iot`) con migraciones, y carga los
    catálogos.
  - Inicia sesión con correo y contraseña y entrega un token para web y móvil; el token
    caduca a los 7 días sin uso y se renueva con la actividad.
  - Aplica permisos por rol (administrador de plataforma, administrador, supervisor,
    analista y operador) y aísla los datos por organización. El administrador de
    plataforma da de alta, suspende y da de baja las organizaciones.
  - Expone la API de organizaciones, áreas, usuarios, dispositivos, sensores,
    umbrales, lecturas, alertas, notificaciones y reportes.
  - Recibe las lecturas por MQTT, las valida, las guarda en TimescaleDB y crea alertas
    de advertencia o peligro con sus notificaciones; envía el correo al supervisor del
    área. Las lecturas del calentamiento del CCS811 se guardan sin generar alertas.
  - Marca como "Sin conexión" a los dispositivos que dejan de enviar datos.
  - Calcula las cifras de los reportes, genera el PDF y envía por correo las
    programaciones diarias, semanales o mensuales a sus destinatarios.
  - Registra los teléfonos de la app móvil al iniciar sesión y los quita al cerrarla.
  - Transmite en vivo por WebSocket (`/ws/panel/?token=`) las alertas nuevas o resueltas y
    los cambios de estado de los dispositivos, filtrados por rol, usando Redis.
  - Incluye una curva por variable (promedio, mínimo y máximo) en los reportes y su PDF.
  - Envía notificaciones push con Expo cuando se activa `NUCLEO_PUSH_HABILITADO`.
- **Después:** redacción de reportes con el servicio de IA y agente en lenguaje natural.
- **Todavía no:** el proveedor de IA está por definir, así que los reportes responden
  503; el push está apagado por defecto y sin probar con un teléfono real.

## Cómo funciona

1. El dispositivo publica sus lecturas en el broker Mosquitto.
2. `escuchar_mqtt` las valida y las guarda en TimescaleDB con su hora de medición y de
   recepción.
3. Cada lectura estabilizada se compara con el umbral de su dispositivo y variable.
4. Si sale de los límites de advertencia o de peligro, se crea la alerta (con una copia
   de la lectura) y sus notificaciones en PostgreSQL, en una sola transacción, y sale
   el correo.
5. La alerta y el cambio de estado del dispositivo se publican en Redis y llegan por
   WebSocket a las conexiones que su rol puede ver.
6. La web y la app piden lecturas, tendencias, alertas y reportes a la API REST.

## Carpetas

```text
BackEnd/
├── config/                     Configuración del proyecto
│   ├── settings/               Ajustes comunes, locales y de producción
│   ├── urls.py                 Direcciones de la API
│   ├── asgi.py                 Entrada HTTP y WebSocket (Daphne)
│   └── wsgi.py                 Entrada para servidores tradicionales
├── apps/                       Módulos del negocio, uno por tema
│   ├── core/                   Salud de la API
│   ├── catalogos/              Roles, estados y variables ambientales con su rango
│   ├── organizaciones/         Organizaciones y áreas
│   ├── usuarios/               Usuarios, teléfonos push, inicio de sesión y gestión
│   ├── dispositivos/           Dispositivos, sensores y estado de conexión
│   ├── umbrales/               Límites de advertencia y de peligro por variable
│   ├── mediciones/             Lecturas (TimescaleDB), ingesta MQTT e histórico
│   ├── alertas/                Alertas, notificaciones, correo y push con Expo
│   ├── tiempo_real/            Canal en vivo por WebSocket
│   └── reportes/               Cifras, programaciones, texto de IA y PDF
├── common/                     Roles, permisos, token con caducidad, aislamiento por organización y errores
├── scripts/                    Tareas operativas futuras
├── manage.py                   Comando principal de Django
├── requirements.txt            Programas para ejecutar
├── requirements-dev.txt        Programas para revisar el código
├── pyproject.toml              Reglas de estilo
├── .env.example                Plantilla de configuración
├── README.md                   Este documento
└── .venv/                      Herramientas instaladas, no se versiona
```

## Comandos

Todos se ejecutan desde la carpeta principal del proyecto:

- `python3.12 -m venv BackEnd/.venv` — "crea el entorno aislado de Python."
- `BackEnd/.venv/bin/pip install --upgrade pip` — "actualiza el instalador."
- `BackEnd/.venv/bin/pip install -r BackEnd/requirements-dev.txt` — "instala Django, DRF, psycopg, paho-mqtt, ReportLab y Ruff."
- `docker compose up -d --wait postgres timescaledb redis` — "enciende PostgreSQL, TimescaleDB y Redis y espera; terminan saludables."
- `cd BackEnd && .venv/bin/python manage.py migrate` — "crea las 16 tablas en `nucleo_db` y carga los catálogos; muestra `Applying ... OK`."
- `cd BackEnd && .venv/bin/python manage.py migrate --database=iot` — "crea la hypertable `lectura` en `nucleo_iot`; solo corre la app `mediciones`."
- `cd BackEnd && .venv/bin/python manage.py sembrar_demo` — "crea la organización de ejemplo, el administrador de plataforma, un usuario por rol y el dispositivo `NUC-001`; imprime las contraseñas una sola vez."
- `cd BackEnd && .venv/bin/python manage.py createsuperuser` — "crea un administrador de plataforma, sin organización, para entrar a `/admin/`."
- `cd BackEnd && .venv/bin/python manage.py runserver 0.0.0.0:8000` — "abre la API y el canal en vivo (Daphne atiende HTTP y WebSocket); se detiene con `Ctrl+C`."
- `cd BackEnd && .venv/bin/python manage.py escuchar_mqtt` — "recibe las lecturas del broker; requiere Mosquitto encendido y se detiene con `Ctrl+C`."
- `cd BackEnd && .venv/bin/python manage.py marcar_sin_conexion --cada 30` — "revisa cada 30 segundos qué dispositivos dejaron de enviar datos."
- `cd BackEnd && .venv/bin/python manage.py generar_reportes_programados` — "genera y envía por correo los reportes de las programaciones vencidas y fija su siguiente ejecución; se programa con cron."

Abre `http://127.0.0.1:8000/api/v1/health/`. Debes ver un JSON parecido a:

```json
{
  "status": "ok",
  "service": "nucleo-backend",
  "version": "0.1.0",
  "timestamp": "2026-10-23T01:26:01.936368+00:00"
}
```

También necesitas `BackEnd/.env`. Créalo desde `BackEnd/.env.example` y completa
`DJANGO_SECRET_KEY`, `DATABASE_URL` (PostgreSQL), `IOT_DATABASE_URL` (TimescaleDB) y
`DJANGO_ALLOWED_HOSTS`; `REDIS_URL` para el canal en vivo (vacío usa una capa en
memoria, válida con un solo proceso). Para el broker
completa además las variables `MQTT_*`; los pasos están en
[Broker MQTT](../Context/mqtt/broker-mosquitto.md).

Para iniciar sesión desde la API:

- `curl -X POST http://127.0.0.1:8000/api/v1/auth/login/ -H 'Content-Type: application/json' -d '{"correo":"admin@nucleo.local","password":"LA_CLAVE"}'` — "devuelve el token; envíalo después como `Authorization: Token ...`."

## Revisiones

- `cd BackEnd && .venv/bin/python manage.py check` — "revisa la configuración; muestra `System check identified no issues`."
- `cd BackEnd && .venv/bin/python manage.py makemigrations --check --dry-run` — "confirma que los modelos y las migraciones coinciden; muestra `No changes detected`."
- `cd BackEnd && .venv/bin/python manage.py test` — "ejecuta las pruebas con una base temporal; muestra `Ran 134 tests` y `OK`; crea `test_nucleo_db` y `test_nucleo_iot` y las borra al terminar."
- `cd BackEnd && .venv/bin/ruff check .` — "revisa el estilo; muestra `All checks passed!`."

## Para profundizar

La explicación técnica completa está en [`Context/`](../Context/README.md),
pensada para el equipo y para asistentes de IA.

- [Estructura del backend](../Context/backend/estructura-backend.md)
- [Contrato compartido de la API](../Context/api/contrato-api.md)
- [Modelo relacional](../Context/base-de-datos/modelo-relacional.md)
- [Broker MQTT](../Context/mqtt/broker-mosquitto.md)
- [PostgreSQL y TimescaleDB con Docker](../Context/base-de-datos/postgresql-docker.md)
- [Guía de desarrollo local](../Context/instalacion/guia-desarrollo-local.md)
