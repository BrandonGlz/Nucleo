# Núcleo — Gestión y monitoreo del ambiente

Núcleo monitorea la temperatura, la humedad y la calidad del aire con nodos ESP32. Avisa en
vivo cuando una lectura sale de sus umbrales y genera reportes. Tiene web, app Android y
**Nico AI**, un agente que responde sobre cada dispositivo. Dos consolas aparte, solo para el
superusuario de la plataforma, administran a Nico AI y la seguridad, los accesos y los equipos.
Una landing pública presenta el producto y sus planes.

## Stack tecnológico y ramificación del proyecto

```text
Stack
├── Backend          Python 3.12.15 · Django 5.2.18 · Django REST Framework 3.18.3 · Channels 4.3
├── Base de datos    PostgreSQL 17.11 · TimescaleDB 2.31.0 · Redis 7
├── Broker MQTT      Eclipse Mosquitto 2 con TLS
├── Web              React 19.3.1 · Vite 8.3.8 · React Router 7 · npm 11.16.0
├── App móvil        Expo 58.0.23 · React Native 0.88.1 · React Navigation 7 · npm 11.16.0
├── IoT              Python 3.12 · MicroPython 1.29.0 para ESP32 · Pymakr 2.22.5
└── Contenedores     Docker Engine 29.9.2 · Compose 5.6.1
```

Las versiones exactas están fijadas en los `requirements.txt` de backend e IoT y
en los `package-lock.json` de web y móvil.

```text
Nucleo/
├── BackEnd/               Django, API compartida, pruebas y README
├── FrontEnd/              Web React + Vite y README
├── Mobile/                App Expo + React Native y README
├── IoT/                   MicroPython para ESP32, bibliotecas y README
├── Landing/               Página pública info.bynucleo.com (estática, sin build) y README
├── Mosquitto/             Configuración del broker MQTT y scripts de certificados y dispositivos
├── Database/              Scripts .sql de práctica: Web-Mobile (PostgreSQL) e IoT (TimescaleDB),
│                          y crear-roles.sh (opcional)
├── deploy/                Instalación, despliegue, respaldos y APK del servidor
├── Context/               Documentación técnica completa para el equipo y la IA
├── Docs/                  SRS, modelo relacional, planificación y análisis
├── .github/workflows/     Vigía externo cada 15 min y revisiones de seguridad
├── docker-compose.yml     PostgreSQL, TimescaleDB, Redis y Mosquitto en Docker
├── .env.example           Plantilla de configuración, sin secretos
├── .gitignore             Archivos que Git debe ignorar
└── README.md              Este documento
```

Cada parte tiene su README con sus comandos: [BackEnd](BackEnd/README.md),
[Web](FrontEnd/README.md), [Mobile](Mobile/README.md), [IoT](IoT/README.md),
[Landing](Landing/README.md), [Servidor](deploy/README.md) y [Base de datos](Database/README.md). La documentación técnica completa está en
**[Context/](Context/README.md)**, la fuente de verdad del proyecto:

| Tema | Documento |
| --- | --- |
| Arquitectura y flujo de punta a punta | [arquitectura/arquitectura-general.md](Context/arquitectura/arquitectura-general.md) |
| Instalación y desarrollo local | [instalacion/guia-desarrollo-local.md](Context/instalacion/guia-desarrollo-local.md) |
| API compartida por web y móvil | [api/contrato-api.md](Context/api/contrato-api.md) |
| Base de datos | [base-de-datos/modelo-relacional.md](Context/base-de-datos/modelo-relacional.md) |
| Broker MQTT | [mqtt/broker-mosquitto.md](Context/mqtt/broker-mosquitto.md) |
| Firmware y conexiones del ESP32 | [iot/firmware-y-hardware.md](Context/iot/firmware-y-hardware.md) · [iot/conexiones.md](Context/iot/conexiones.md) |
| Nico AI | [agente/nico-ai.md](Context/agente/nico-ai.md) |
| Servidor de producción | [servidor/produccion.md](Context/servidor/produccion.md) |
| Seguridad | [seguridad/seguridad.md](Context/seguridad/seguridad.md) |
| Ramas y commits | [equipo/flujo-de-trabajo.md](Context/equipo/flujo-de-trabajo.md) |

En `Docs/` están el SRS, el modelo relacional, los documentos de planificación y análisis y el
[prototipo en 3D](Docs/nucleo3d/README.md). El trabajo se hace en la rama `dev`; `main` es lo
que corre en producción.

## Inicio rápido

Necesitas Python 3.12, Node.js 22 o superior, Docker con Compose y Git. Primero crea los `.env` a
partir de sus `.env.example` (los pasos y qué va en cada uno están en la
[guía de desarrollo local](Context/instalacion/guia-desarrollo-local.md)). Después, desde la
carpeta principal:

- `docker compose up -d --wait postgres timescaledb redis` — "enciende las bases de datos y Redis."
- `python3.12 -m venv BackEnd/.venv && BackEnd/.venv/bin/pip install -r BackEnd/requirements-dev.txt` — "instala el backend."
- `cd BackEnd && .venv/bin/python manage.py migrate && .venv/bin/python manage.py migrate --database=iot` — "crea las tablas y la hypertable de lecturas."
- `cd BackEnd && .venv/bin/python manage.py sembrar_demo` — "carga organizaciones, usuarios, dispositivos y lecturas de demostración."
- `cd BackEnd && .venv/bin/python manage.py runserver 0.0.0.0:8000` — "abre la API en `http://127.0.0.1:8000`."
- `cd FrontEnd && npm ci && npm run dev` — "abre la web en `http://localhost:5173`."

El broker, el simulador de dispositivos, la app móvil, el ESP32 y las comprobaciones están en la
misma guía.

## Qué funciona actualmente

- **Backend:** API con permisos por rol y por organización; recibe las lecturas por MQTT,
  crea alertas, avisa por correo y push a los supervisores del área, los administradores de la
  organización y el operador asignado, y transmite en vivo; reportes con gráficas y PDF.
- **Web:** panel en vivo, dispositivos, histórico, alertas, reportes, Nico AI, umbrales,
  usuarios y empresa; además, administración de organizaciones para la plataforma.
- **App Android:** dispositivo en vivo, alertas, Nico AI y perfil, con notificaciones push.
- **Nico AI:** responde con las lecturas y alertas de cada dispositivo y genera reportes cuando
  se le piden, en la web y en la app. Su consola tiene panel, banco de respuestas, registro de
  preguntas (con «Enseñar»), herramientas y notificaciones.
- **Consola de administración:** panel, alertas de seguridad con notificaciones, auditoría,
  políticas, usuarios, sesiones abiertas por dispositivo, dispositivos, integraciones y carga del
  firmware al ESP32 por USB desde el navegador.
- **IoT:** firmware 1.1.3 de MicroPython con DHT22, CCS811, pantalla OLED, LED RGB, buzzer, cola
  sin conexión, microSD y actualización remota (OTA). Un ESP32-S3 físico (`NC-0501`) ya publica
  temperatura, humedad y calidad del aire reales y es la llave de Nico AI; los demás equipos de la
  demostración vienen del simulador. Falta probar la batería y la microSD en la placa.
- **Landing:** presentación pública narrada por Nico, con modo claro y oscuro, capturas reales,
  dispositivo interactivo, planes y preguntas frecuentes.

## En dónde funciona

### Dominios y subdominios

| Dirección | Para qué |
| --- | --- |
| **https://bynucleo.com** | Página principal |
| **https://app.bynucleo.com** | Descarga de la app Android |
| **https://info.bynucleo.com** | Landing pública: producto, planes y preguntas |
| **https://nicoai.bynucleo.com** | Consola de Nico AI (solo superusuario) |
| **https://admin.bynucleo.com** | Consola de administración (solo superusuario) |
| `dispositivos.bynucleo.com` | Solo para los ESP32: MQTT dentro de WebSocket y llave de Nico AI |

### Host

Un solo servidor propio con Debian 13 publica todo por un túnel de Cloudflare, sin puertos
abiertos. Caddy sirve la web y reparte las peticiones; Daphne atiende la API y el canal en
vivo; PostgreSQL, TimescaleDB, Redis y Mosquitto corren en Docker; servicios de systemd
escuchan el broker, marcan los equipos sin conexión y generan los reportes programados. Hay dos
respaldos cifrados al día, una prueba mensual de restauración y un vigía externo en GitHub Actions
que revisa los sitios cada 15 minutos. Detalles en [servidor/produccion.md](Context/servidor/produccion.md)
y [deploy/README.md](deploy/README.md).

## Dispositivo ESP32

Cada nodo es un ESP32-S3 con MicroPython 1.29. Mide temperatura y humedad (DHT22) y
calidad del aire (CCS811), las muestra en una pantalla OLED y avisa con un LED RGB y un buzzer
cuando algo sale de rango. Publica sus lecturas por MQTT con TLS (por WebSocket a través de
Cloudflare), guarda en cola lo que no pudo enviar sin conexión, recibe su configuración y
umbrales del servidor y se actualiza solo (OTA). También firma las peticiones de Nico AI de su
dispositivo: sin el ESP conectado, ese agente no usa la IA. Conexiones y firmware en
[iot/firmware-y-hardware.md](Context/iot/firmware-y-hardware.md) e
[iot/conexiones.md](Context/iot/conexiones.md).

## Prototipo final esperado (beta)

Propuesta de cómo se vería Núcleo ya como producto, en una carcasa impresa en 3D (versión beta,
medidas aproximadas).

![Prototipo beta de Núcleo](Docs/nucleo3d/portada.svg)

Las vistas exteriores e interiores, el esqueleto vacío, el cableado completo, las piezas una por
una y los planos con medidas en centímetros están en [Docs/nucleo3d](Docs/nucleo3d/README.md).
