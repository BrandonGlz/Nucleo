# Núcleo — Gestión y monitoreo del ambiente

> **En simple:** Núcleo mide temperatura, humedad y calidad del aire. Tiene una
> web, una app móvil, un servidor compartido, PostgreSQL para la app, TimescaleDB
> para IoT, un broker MQTT y un ESP32 que toma las mediciones.

Hoy el backend, el modelo de datos, el broker y el canal en vivo están completos y
probados. El firmware base del ESP32 está escrito y falta probarlo en la placa. La web y
la app móvil son un esqueleto: cada módulo ya tiene su carpeta, su ruta y una pantalla
provisional enlazada por la navegación; sus pantallas de negocio son lo que sigue.

## Qué funciona

- **Backend**
  - Hoy: inicio de sesión con token, permisos por rol, aislamiento por organización
    y la API de usuarios, dispositivos, umbrales, lecturas, alertas y reportes.
    Recibe las lecturas por MQTT, crea alertas, envía el correo y transmite en vivo por
    WebSocket las alertas y los cambios de estado. El token caduca a los 7 días sin uso.
    Los reportes incluyen gráficas de tendencia en el PDF. El push con Expo está
    implementado y apagado.
  - Después: probar el push en un teléfono real, texto de los reportes con IA y agente en
    lenguaje natural.
- **Web**
  - Hoy: pantalla inicial con el estado de la API y un menú con un módulo por ruta
    (`acceso`, `panel`, `dispositivos`, `mediciones`, `alertas`, `reportes`, `usuarios`,
    `organizaciones`), cada uno con «Hola mundo, este es el módulo de…».
  - Después: implementar cada módulo (login, panel, gráficas, alertas, umbrales, reportes
    y gestión de usuarios).
- **App móvil**
  - Hoy: la misma comprobación de salud y una pantalla por módulo (`acceso`, `panel`,
    `dispositivos`, `mediciones`, `alertas`) con navegación y «Hola mundo, este es el
    módulo de…».
  - Después: implementar cada módulo (login, datos en tiempo real del dispositivo asignado,
    historial y alertas).
- **IoT**
  - Hoy: firmware base de MicroPython (`boot.py`, `main.py` y el paquete `nucleo/`) con
    DHT22, CCS811, pantalla OLED, LED RGB, buzzer y MQTT con TLS, cola de lecturas sin
    conexión y baseline del CCS811, con 16 pruebas de su lógica, más las bibliotecas y
    herramientas listas.
  - Después: carga en un ESP32 real, ajuste de pines y calibración del CCS811.
- **Broker MQTT**
  - Hoy: Mosquitto con TLS en el puerto 8883, un usuario por dispositivo y permisos que lo
    limitan a su propio tópico.
- **Base de datos**
  - Hoy: PostgreSQL con las 16 tablas del modelo relacional, TimescaleDB con la
    hypertable de lecturas, Redis para el canal en vivo y scripts locales de práctica para
    cada base, más `crear-roles.sh` para usuarios de base de datos sin superusuario.
- **Documentación**
  - Hoy: READMEs por stack, `Context/` técnico completo y, en `Docs/`, el SRS, el
    modelo relacional y los documentos de planificación y análisis.

## Cómo funciona

1. El ESP32 lee el DHT22 y el CCS811, muestra los datos en la pantalla OLED, enciende
   el LED RGB y el buzzer según los umbrales y publica las mediciones por MQTT con TLS.
2. El backend las recibe del broker, las valida y las guarda en TimescaleDB.
3. Si una lectura sale de los límites de advertencia o de peligro de su dispositivo,
   crea la alerta en PostgreSQL y avisa por correo al supervisor del área.
4. El backend publica la alerta y los cambios de estado en Redis y llegan por WebSocket a
   la web y la app.
5. La web y la app móvil piden los datos al mismo backend con su token; cada
   persona ve solo lo que su rol y su organización permiten.

Hoy el flujo de punta a punta funciona entre el broker, la API y el canal en vivo; la
web y la app móvil comprueban la salud del backend y tienen sus módulos como esqueleto,
y el firmware del ESP32 espera su primera prueba en hardware.

## Stack

```text
Stack
├── Backend          Python 3.12.15 · Django 5.2.18 · Django REST Framework 3.18.3 · Channels 4.3
├── Base de datos    PostgreSQL 17.11 · TimescaleDB 2.31.0 · Redis 7
├── Broker MQTT      Eclipse Mosquitto 2 con TLS
├── Web              React 19.3.1 · Vite 8.3.5 · React Router 7 · npm 11.16.0
├── App móvil        Expo 58.0.19 · React Native 0.88.0 · React Navigation 7 · npm 11.16.0
├── IoT              Python 3.12 · MicroPython 1.29.0 para ESP32 · Pymakr 2.22.5
└── Contenedores     Docker Engine 29.9.2 · Compose 5.6.1
```

Las versiones exactas están fijadas en los `requirements.txt` de backend e IoT y
en los `package-lock.json` de web y móvil.

## Carpetas

```text
Nucleo/
├── BackEnd/               Django, API compartida, pruebas y README
├── FrontEnd/              Web React + Vite y README
├── Mobile/                App Expo + React Native y README
├── IoT/                   MicroPython para ESP32, bibliotecas y README
├── Mosquitto/             Configuración del broker MQTT y scripts de certificados y dispositivos
├── Database/              Scripts .sql de práctica: Web-Mobile (PostgreSQL) e IoT (TimescaleDB),
│                          y crear-roles.sh
├── Context/               Documentación técnica completa para el equipo y la IA
├── Docs/                  SRS, modelo relacional, planificación y análisis
├── docker-compose.yml     PostgreSQL, TimescaleDB, Redis y Mosquitto en Docker
├── .env.example           Plantilla de configuración, sin secretos
├── .gitignore             Archivos que Git debe ignorar
└── README.md              Este documento
```

Consulta [BackEnd](BackEnd/README.md), [Web](FrontEnd/README.md),
[Mobile](Mobile/README.md), [IoT](IoT/README.md) y
[Base de datos](Database/README.md) para los comandos de cada parte.

## Antes de empezar

Necesitas Python 3.12, Node.js 22 o superior, npm, Docker con Compose, Git y
VS Code con la extensión Pymakr. Las herramientas del ESP32 se instalan dentro
de `IoT/.venv`.

- `cp .env.example .env` — "crea la configuración principal; después completa las contraseñas de PostgreSQL y TimescaleDB."
- `openssl rand -hex 24` — "genera cada contraseña (bases de datos, Redis y broker)."
- `chmod 600 .env` — "protege el archivo para que solo lo lea su dueño."
- `cp BackEnd/.env.example BackEnd/.env` — "crea la configuración de Django; completa `DJANGO_SECRET_KEY` y la contraseña de `DATABASE_URL`."
- `python3.12 -c "import secrets; print(secrets.token_urlsafe(64))"` — "genera la clave larga de Django."
- `chmod 600 BackEnd/.env` — "protege la configuración del backend."
- `cp FrontEnd/.env.example FrontEnd/.env` — "crea la configuración de la web con la URL de la API."
- `cp Mobile/.env.example Mobile/.env` — "crea la configuración de la app móvil con la URL de la API."

La contraseña de `POSTGRES_PASSWORD` debe ser la misma dentro de
`DATABASE_URL` en `BackEnd/.env`. `IOT_PASSWORD` se usará para TimescaleDB y `REDIS_PASSWORD` para Redis (va también dentro
de `REDIS_URL` en `BackEnd/.env`).
`MQTT_BACKEND_PASSWORD` y `MQTT_DEVICE_PASSWORD` son las contraseñas del broker; la
primera va también como `MQTT_PASSWORD` en `BackEnd/.env`. No subas `.env`,
`secrets.py` ni certificados privados a Git.

## Inicializar

Todos los comandos se ejecutan desde la carpeta principal del proyecto.

**Bases de datos**

- `docker compose up -d --wait postgres timescaledb redis` — "enciende PostgreSQL, TimescaleDB y Redis; termina con los tres contenedores saludables."
- `docker compose ps` — "muestra el estado de los servicios."

**Broker MQTT**

- `bash Mosquitto/preparar.sh` — "crea los certificados de desarrollo y los usuarios `nucleo_backend` y `NUC-001`; usa las contraseñas de `.env`."
- `bash Mosquitto/dispositivo.sh NUC-002` — "crea el usuario MQTT de otro dispositivo; imprime su contraseña una sola vez."
- `docker compose up -d --wait mosquitto` — "enciende Mosquitto con TLS en el puerto 8883."

**Backend**

- `python3.12 -m venv BackEnd/.venv` — "crea el entorno aislado de Python."
- `BackEnd/.venv/bin/pip install --upgrade pip` — "actualiza el instalador."
- `BackEnd/.venv/bin/pip install -r BackEnd/requirements-dev.txt` — "instala Django, DRF, el cliente MQTT, ReportLab y las herramientas."
- `cd BackEnd && .venv/bin/python manage.py migrate` — "crea las 16 tablas de `nucleo_db` y carga los catálogos."
- `cd BackEnd && .venv/bin/python manage.py migrate --database=iot` — "crea la hypertable `lectura` en `nucleo_iot`."
- `cd BackEnd && .venv/bin/python manage.py sembrar_demo` — "crea datos de ejemplo y muestra una sola vez la contraseña de cada usuario."
- `cd BackEnd && .venv/bin/python manage.py escuchar_mqtt` — "recibe las lecturas del broker; se deja en otra terminal y se detiene con `Ctrl+C`."
- `cd BackEnd && .venv/bin/python manage.py runserver 0.0.0.0:8000` — "abre la API y el canal en vivo en `http://127.0.0.1:8000`; se detiene con `Ctrl+C`."

**Web**

- `cd FrontEnd && npm ci` — "instala las versiones exactas de React y Vite."
- `cd FrontEnd && npm run dev` — "abre la web en `http://localhost:5173`; se detiene con `Ctrl+C`."

**App móvil**

- `cd Mobile && npm ci` — "instala Expo y React Native."
- `cd Mobile && npm start` — "abre Expo y muestra un código QR; se detiene con `Ctrl+C`."
- `cd Mobile && npm run android` — "abre la app en un emulador Android."

**IoT**

- `python3.12 -m venv IoT/.venv` — "crea el entorno de herramientas del ESP32."
- `IoT/.venv/bin/pip install --upgrade pip` — "actualiza el instalador."
- `IoT/.venv/bin/pip install -r IoT/requirements.txt` — "instala `esptool`, `mpremote` y el autocompletado de MicroPython."
- `code --install-extension pycom.pymakr` — "instala Pymakr en VS Code."

Grabar MicroPython en la placa, copiar las bibliotecas y usar Pymakr está
explicado paso a paso en [IoT/README.md](IoT/README.md).

Abre el backend, la web y la app móvil en terminales separadas. PostgreSQL y
TimescaleDB pueden quedar encendidos o apagarse sin perder datos.

## Mantenimiento

- `docker compose down` — "apaga PostgreSQL; conserva el volumen y los datos."
- `docker compose logs -f --tail=100 postgres timescaledb` — "muestra los mensajes en vivo; se corta con `Ctrl+C`."
- `docker compose config --quiet` — "revisa la receta de Docker; no muestra nada si está bien."

## Base de datos de prueba

`Database/` tiene una carpeta por base: `Web-Mobile/` con las 16 tablas y una base
aparte, `nucleo_test`, y `IoT/` con la hypertable de lecturas y `nucleo_iot_test`, para
practicar tablas, consultas, procedimientos y triggers sin tocar las bases reales. No usa
archivos `.db`: PostgreSQL no trabaja con ese formato. Los comandos `docker exec` están en
[Database/README.md](Database/README.md).

## Comprobaciones

- `cd BackEnd && .venv/bin/python manage.py check` — "revisa Django; muestra `System check identified no issues`."
- `cd BackEnd && .venv/bin/python manage.py test` — "ejecuta las pruebas; muestra `Ran 134 tests` y `OK`."
- `cd BackEnd && .venv/bin/ruff check .` — "revisa el estilo; muestra `All checks passed!`."
- `cd FrontEnd && npm run lint` — "revisa la web; no muestra avisos si todo está bien."
- `cd FrontEnd && npm run build` — "genera `FrontEnd/dist/`; Vite muestra `built in ...`."
- `cd Mobile && npm run lint` — "revisa la app móvil; no muestra avisos si todo está bien."
- `cd Mobile && npm run export:android` — "genera el bundle de Android; no crea un APK."
- `IoT/.venv/bin/python -m unittest discover -s IoT/tests -t IoT` — "ejecuta las 16 pruebas de la lógica del firmware; muestra `OK`."
- `IoT/.venv/bin/mpremote devs` — "lista las placas conectadas por USB; el ESP32 aparece con su puerto."
- `docker compose config --quiet` — "valida Docker Compose."

Para ver la API:

- `curl http://127.0.0.1:8000/api/v1/health/` — "muestra un JSON con `status: ok` si el backend está activo."

## Servicios

```text
Servicios
├── Backend                127.0.0.1:8000     API y canal en vivo (WebSocket) de Django
├── Web                    localhost:5173     Web de Vite
├── PostgreSQL 17          127.0.0.1:55432    Base de Django en Docker
├── TimescaleDB 2.31       127.0.0.1:55433    Telemetría de IoT en Docker
├── Redis 7                127.0.0.1:56379    Canal en vivo en Docker
├── Mosquitto 2            127.0.0.1:8883     Broker MQTT con TLS en Docker
└── PostgreSQL 18 nativo   127.0.0.1:5432     Ajeno a Núcleo; no se toca
```

## Documentación

- [Contexto técnico](Context/README.md): arquitectura, instalación, base de
  datos, firmware y decisiones.
- [Contrato de la API](Context/api/contrato-api.md): lo que comparten web y móvil.
- [Modelo relacional](Context/base-de-datos/modelo-relacional.md): las 16 tablas y la hypertable de lecturas.
- [Broker MQTT](Context/mqtt/broker-mosquitto.md): tópicos, mensajes y permisos.
- [Verificación inicial](Context/reportes/verificacion-inicial.md): comandos y
  resultados reales.
- [Informe de avance](Docs/informe-2026-10-24-nucleo.pdf): mapa de carpetas y archivos,
  guía de integración y pendientes del SRS.

La carpeta `Docs/` reúne el SRS, el modelo relacional y los documentos de
planificación y análisis, además de los reportes formales de avance, seguridad y
evidencias que se agreguen.

## Control de versiones

**Ramas**

```text
main       Solo entregas estables, con un tag por etapa
dev        Integración; siempre debe funcionar
backend    Trabajo del backend (BackEnd/)
frontend   Trabajo de la web (FrontEnd/)
mobile     Trabajo de la app móvil (Mobile/)
iot        Trabajo del firmware y del broker (IoT/ y Mosquitto/)
```

- Cada área trabaja solo en su rama: así dos áreas no editan los mismos archivos a la vez.
- La documentación (`Context/`, `Docs/`, READMEs) y `Database/` no tienen rama propia: viajan
  con la rama del área que las modifica. Un cambio que toca varias áreas se coordina en `dev`.
- Para evitar conflictos al integrar, se trae `dev` a la rama del área con frecuencia
  (`git merge dev`) y se suben cambios pequeños.
- Si dos personas trabajan a la vez dentro de una misma área, cada una usa una rama corta
  (`feature/<tarea>` o `fix/<tarea>`) que sale de la rama del área y vuelve a ella.
- Cada área se integra a `dev` con un pull request y las pruebas pasando.
- `dev` pasa a `main` solo al cerrar una etapa; esa versión lleva un tag con el nombre de la
  etapa (por ejemplo `etapa-1` o `v0.1.0`).
- Nadie trabaja directo sobre `main` ni sobre `dev`.

**Commits**

Un commit es un solo cambio lógico, con un mensaje de **una línea** con la forma
`tipo(alcance): resumen`:

- **Tipo:** `feat` (funcionalidad nueva), `fix` (corrección), `docs` (solo documentación),
  `test` (pruebas), `refactor` (reorganiza sin cambiar el comportamiento), `perf` (rendimiento),
  `style` (formato sin cambiar el código), `chore` (dependencias, configuración, tareas
  menores) y `revert` (deshace un commit).
- **Alcance** (opcional): `backend`, `web`, `mobile`, `iot`, `mosquitto`, `db` o el nombre de
  una app como `alertas`.
- **Resumen:** en español, con el verbo en presente (`agrega`, `corrige`, `elimina`), sin punto
  final y de máximo 72 caracteres.
- **Cuerpo:** solo si el porqué no es evidente; va separado por una línea en blanco y no
  repite lo que ya muestra el cambio.
- **Cambio que rompe compatibilidad:** se marca con `!` (por ejemplo `feat(backend)!:`) y
  se explica en el cuerpo.
- No se agregan coautores ni etiquetas automáticas de herramientas: el commit va a nombre de
  quien lo hizo.

Cuál usar según la situación:

- `feat(backend): agrega serie de lecturas por hora` — "agregaste una función."
- `fix(iot): reenvía las lecturas encoladas al reconectar` — "arreglaste un error."
- `docs: actualiza la guía de instalación` — "cambiaste solo documentación."
- `test(backend): cubre la caducidad del token` — "agregaste o ajustaste pruebas."
- `refactor(web): mueve el cliente HTTP a services/api` — "reorganizaste código sin cambiar su comportamiento."
- `chore(mobile): actualiza expo a 58.0.19` — "actualizaste dependencias."
- `chore(mosquitto): limita cada usuario a su tópico` — "cambiaste configuración."
- `revert: deshace "feat(backend): agrega serie por hora"` — "deshiciste un commit."

Se evita: `cambios`, `varios arreglos`, listas de archivos o párrafos que repiten el cambio.
Si un commit necesita muchas líneas para explicarse, probablemente son varios commits.

## Seguridad

- Los `.env` y `secrets.py` no se versionan.
- PostgreSQL, TimescaleDB, Redis y Mosquitto solo escuchan en `127.0.0.1`.
- El broker exige TLS y usuario; cada dispositivo solo publica en su propio tópico.
- La API exige token (caduca a los 7 días sin uso) y limita cada respuesta a la organización y al rol del usuario.
- Las contraseñas de los usuarios se guardan cifradas.
- No se deben guardar contraseñas ni claves en el código.
