# Núcleo — Gestión y monitoreo del ambiente

Hoy todo el sistema funciona y está publicado: el backend, el modelo de datos, el broker,
el canal en vivo, la web con todas sus pantallas y la app Android (APK) con notificaciones
push. El firmware del ESP32 está escrito y probado en su lógica; falta probarlo en la placa
con los sensores, así que por ahora las lecturas vienen del simulador.

## Qué funciona

- **Backend**
  - Inicio de sesión con token (caduca a los 7 días sin uso, máximo 10 intentos por
    minuto), permisos por rol y aislamiento por organización.
  - API de organizaciones, áreas, usuarios, dispositivos, sensores, umbrales, lecturas,
    alertas, notificaciones y reportes.
  - Recibe las lecturas por MQTT, crea alertas de advertencia o peligro, avisa por correo
    y por push, y transmite en vivo por WebSocket las alertas y los cambios de estado.
  - Reportes con cifras, gráficas y PDF, manuales o programados por correo; el texto se
    redacta a partir de las cifras (`IA_PROVEEDOR=local`).
  - **Nico AI:** un agente por dispositivo que responde con sus lecturas y alertas, y
    genera reportes cuando se le piden («reporte de octubre», «de la semana pasada»); el
    resumen y el PDF se ven en el mismo chat de la web y de la app.
- **Web**
  - Panel en vivo, Dispositivos (con estado, batería, señal y «Calentando»), Detalle de
    dispositivo, Histórico, Alertas (atender o descartar), Reportes, Nico AI, Umbrales,
    Usuarios, Empresa y áreas, Mi perfil y Notificaciones, con tema claro u oscuro.
  - **Organizaciones**, solo para el administrador de plataforma: alta, edición,
    suspensión, baja y primer administrador de cada empresa cliente.
- **App móvil (Android)**
  - Inicio con el dispositivo en vivo (selector si hay varios), Detalle de variable,
    Alertas y su detalle, Nico AI y Perfil.
  - Canal en vivo con la app abierta y notificaciones push con la app cerrada; las de
    peligro suenan y vibran. Opción para reducir animaciones y preferencias guardadas en el teléfono.
  - Se instala con el APK de https://nucleo.tailb3f7d8.ts.net/app/nucleo.apk.
- **IoT**
  - Firmware de MicroPython (`boot.py`, `main.py` y el paquete `nucleo/`) con DHT22,
    CCS811, pantalla OLED, LED RGB, buzzer y MQTT con TLS, cola de lecturas sin conexión y
    baseline del CCS811, con 16 pruebas de su lógica.
  - Falta: cargarlo en un ESP32 real, ajustar los pines y calibrar el CCS811.
- **Broker MQTT**
  - Mosquitto con TLS en el puerto 8883, un usuario por dispositivo y permisos que lo
    limitan a su propio tópico.
- **Base de datos**
  - PostgreSQL con las 16 tablas del modelo relacional, TimescaleDB con la hypertable de
    lecturas, Redis para el canal en vivo y scripts de práctica para cada base. Cada base
    corre en su propio contenedor con su propio usuario.
- **Documentación**
  - READMEs por stack, `Context/` técnico completo y, en `Docs/`, el SRS, el modelo
    relacional y los documentos de planificación y análisis.

## Cómo funciona

```mermaid
flowchart LR
    E["ESP32<br/>DHT22 · CCS811<br/>OLED · LED · buzzer"] -->|"1 · MQTT con TLS"| M["Mosquitto<br/>:8883"]
    M -->|"2 · recibe y valida"| B["Backend Django<br/>escuchar_mqtt"]
    B -->|guarda la lectura| T[("TimescaleDB<br/>lecturas")]
    B -->|"3 · fuera de umbral"| A[("PostgreSQL<br/>alerta")]
    B -->|correo al supervisor| G["Gmail SMTP"]
    B -->|"4 · evento"| R[("Redis")]
    R -->|WebSocket /ws/panel/| W["Web React"]
    R -->|WebSocket /ws/panel/| P["App Android"]
    B -->|push con la app cerrada| X["Expo · Firebase"] --> P
    W -->|"5 · API con token<br/>según rol y organización"| B
    P --> B
    classDef cliente fill:#1d4ed8,stroke:#93c5fd,color:#fff,stroke-width:2px
    classDef red fill:#6d28d9,stroke:#c4b5fd,color:#fff,stroke-width:2px
    classDef web fill:#15803d,stroke:#86efac,color:#fff,stroke-width:2px
    classDef backend fill:#c2410c,stroke:#fdba74,color:#fff,stroke-width:2px
    classDef datos fill:#a16207,stroke:#fde047,color:#fff,stroke-width:2px
    classDef iot fill:#0f766e,stroke:#5eead4,color:#fff,stroke-width:2px
    classDef externo fill:#a21caf,stroke:#f0abfc,color:#fff,stroke-width:2px
    classDef doc fill:#475569,stroke:#cbd5e1,color:#fff,stroke-width:2px
    class E,M iot
    class B backend
    class T,A,R datos
    class G,X externo
    class W web
    class P cliente
```

1. El ESP32 lee el DHT22 y el CCS811, muestra los datos en la pantalla OLED, enciende
   el LED RGB y el buzzer según los umbrales y publica las mediciones por MQTT con TLS.
2. El backend las recibe del broker, las valida y las guarda en TimescaleDB.
3. Si una lectura sale de los límites de advertencia o de peligro de su dispositivo,
   crea la alerta en PostgreSQL y avisa por correo al supervisor del área.
4. El backend publica la alerta y los cambios de estado en Redis y llegan por WebSocket a
   la web y la app. Con la app cerrada, la alerta llega al teléfono por push (Expo y
   Firebase).
5. La web y la app móvil piden los datos al mismo backend con su token; cada
   persona ve solo lo que su rol y su organización permiten.

Hoy el flujo funciona de punta a punta desde el broker hasta la web y la app; mientras el
ESP32 no se prueba en la placa, `simular_dispositivos` publica lecturas con el mismo
formato que el firmware.

## Stack

```text
Stack
├── Backend          Python 3.12.15 · Django 5.2.18 · Django REST Framework 3.18.3 · Channels 4.3
├── Base de datos    PostgreSQL 17.11 · TimescaleDB 2.31.0 · Redis 7
├── Broker MQTT      Eclipse Mosquitto 2 con TLS
├── Web              React 19.3.1 · Vite 8.3.5 · React Router 7 · npm 11.16.0
├── App móvil        Expo 58.0.23 · React Native 0.88.1 · React Navigation 7 · npm 11.16.0
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
│                          y crear-roles.sh (opcional)
├── deploy/                Instalación, despliegue, respaldos y APK del servidor
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
- `cd BackEnd && .venv/bin/python manage.py sembrar_demo` — "crea dos organizaciones con áreas, usuarios de cada rol, 17 dispositivos, 14 días de lecturas, alertas y reportes; todas las cuentas usan la contraseña `Nucleo2026`."
- `cd BackEnd && .venv/bin/python manage.py sembrar_demo --reiniciar` — "borra los datos (menos los catálogos) y siembra de nuevo."
- `cd BackEnd && .venv/bin/python manage.py simular_dispositivos` — "simula los ESP32 en servicio: manda lecturas a su intervalo y genera alertas y eventos en vivo; se detiene con `Ctrl+C`."
- `cd BackEnd && .venv/bin/python manage.py escuchar_mqtt` — "recibe las lecturas del broker; se deja en otra terminal y se detiene con `Ctrl+C`."
- `cd BackEnd && .venv/bin/python manage.py runserver 0.0.0.0:8000` — "abre la API y el canal en vivo en `http://127.0.0.1:8000`; se detiene con `Ctrl+C`."

**Web**

- `cd FrontEnd && npm ci` — "instala las versiones exactas de React y Vite."
- `cd FrontEnd && npm run dev` — "abre la web en `http://localhost:5173`; se detiene con `Ctrl+C`."

**App móvil**

- `cd Mobile && npm ci` — "instala Expo y React Native."
- `cd Mobile && npm start` — "abre Expo y muestra un código QR; se detiene con `Ctrl+C`."
- `cd Mobile && npm run android` — "abre la app en un emulador Android."

Las notificaciones push solo llegan en el APK compilado (`deploy/compilar_apk.sh`), con
`Mobile/google-services.json` (fuera de git); en Expo Go o en el emulador se prueban con la
app abierta por el canal en vivo.

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
- `cd BackEnd && .venv/bin/python manage.py test` — "ejecuta las pruebas; muestra `Ran 147 tests` y `OK`."
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

```mermaid
flowchart LR
    N["Navegador"] -->|localhost:5173| V["Web de Vite"]
    V -->|"/api y /ws"| B["Backend<br/>127.0.0.1:8000<br/>API y WebSocket"]
    subgraph DK["Docker · solo 127.0.0.1"]
        PG[("PostgreSQL 17<br/>:55432")]
        TS[("TimescaleDB 2.31<br/>:55433")]
        RD[("Redis 7<br/>:56379")]
        MQ["Mosquitto 2<br/>:8883 TLS"]
    end
    B --> PG & TS & RD
    MQ --> B
    X[("PostgreSQL 18 nativo<br/>:5432 · ajeno a Núcleo")]
    classDef cliente fill:#1d4ed8,stroke:#93c5fd,color:#fff,stroke-width:2px
    classDef red fill:#6d28d9,stroke:#c4b5fd,color:#fff,stroke-width:2px
    classDef web fill:#15803d,stroke:#86efac,color:#fff,stroke-width:2px
    classDef backend fill:#c2410c,stroke:#fdba74,color:#fff,stroke-width:2px
    classDef datos fill:#a16207,stroke:#fde047,color:#fff,stroke-width:2px
    classDef iot fill:#0f766e,stroke:#5eead4,color:#fff,stroke-width:2px
    classDef externo fill:#a21caf,stroke:#f0abfc,color:#fff,stroke-width:2px
    classDef doc fill:#475569,stroke:#cbd5e1,color:#fff,stroke-width:2px
    classDef ajeno fill:#374151,stroke:#9ca3af,color:#e5e7eb,stroke-dasharray:4 4
    class N cliente
    class V web
    class B backend
    class PG,TS,RD datos
    class MQ iot
    class X ajeno
    style DK fill:transparent,stroke:#64748b,stroke-dasharray:5 5
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

## Servidor

Núcleo está publicado en **https://nucleo.tailb3f7d8.ts.net** (web) y
**https://nucleo.tailb3f7d8.ts.net/api/v1** (API de la app). Corre en un servidor propio: una
laptop ASUS X75A con Debian 13 sin escritorio (procesador Intel Core i5-3230M de 2 núcleos y 4 hilos a
2.6 GHz, 8 GB de RAM y disco duro mecánico HDD de 750 GB, 698 GB utilizables) que funciona como VPS casero.
La app Android se descarga en **https://nucleo.tailb3f7d8.ts.net/app/nucleo.apk**.

**Cómo llega una visita**

```mermaid
flowchart LR
    U["Navegador o app<br/>cualquier red"] -->|HTTPS| TS["Tailscale Funnel<br/>máquina «nucleo»"]
    TS --> C["Caddy :8081<br/>127.0.0.1"]
    C --> W["Web compilada<br/>FrontEnd/dist"]
    C --> ST["Archivos /static"]
    C --> APK["APK en /app/nucleo.apk"]
    C -->|"/api, /ws, /admin"| D
    subgraph SY["Servicios de systemd"]
        direction TB
        D["nucleo-daphne<br/>Daphne :8001"]
        MQ["nucleo-mqtt"]
        SC["nucleo-sin-conexion"]
        RP["nucleo-reportes.timer<br/>cada 15 min"]
    end
    subgraph DK["Docker · solo 127.0.0.1"]
        direction TB
        M["Mosquitto TLS<br/>:8883"]
        subgraph BD["Bases de datos"]
            PG[("PostgreSQL")]
            TDB[("TimescaleDB")]
            R[("Redis")]
        end
    end
    E["ESP32"] -->|MQTT/TLS| M
    M -->|lecturas| MQ
    SY <==>|"consultas, lecturas,<br/>alertas y eventos"| BD
    classDef cliente fill:#1d4ed8,stroke:#93c5fd,color:#fff,stroke-width:2px
    classDef red fill:#6d28d9,stroke:#c4b5fd,color:#fff,stroke-width:2px
    classDef web fill:#15803d,stroke:#86efac,color:#fff,stroke-width:2px
    classDef backend fill:#c2410c,stroke:#fdba74,color:#fff,stroke-width:2px
    classDef datos fill:#a16207,stroke:#fde047,color:#fff,stroke-width:2px
    classDef iot fill:#0f766e,stroke:#5eead4,color:#fff,stroke-width:2px
    classDef externo fill:#a21caf,stroke:#f0abfc,color:#fff,stroke-width:2px
    classDef doc fill:#475569,stroke:#cbd5e1,color:#fff,stroke-width:2px
    class U cliente
    class TS,C red
    class W,ST,APK web
    class D,MQ,SC,RP backend
    class PG,TDB,R datos
    class M,E iot
    style SY fill:transparent,stroke:#fb923c,stroke-dasharray:5 5
    style DK fill:transparent,stroke:#64748b,stroke-dasharray:5 5
    style BD fill:transparent,stroke:#facc15,stroke-dasharray:3 3
```

- **Publicación:** el contenedor `nucleo_tailscale` es una máquina de Tailscale propia
  (`nucleo`) que, con Funnel, da la URL `https`, el certificado y el puerto 443 sin dominio ni
  puertos abiertos en el router; se entra desde cualquier red.
- **Web:** Vite la compila contra la API real y Caddy la sirve como archivos estáticos.
- **API y tiempo real:** Daphne atiende HTTP y WebSocket (`/ws/panel/`) como servicio
  `nucleo-daphne`; Redis reparte los eventos en vivo.
- **Lecturas:** `nucleo-mqtt` recibe las lecturas del broker Mosquitto (TLS) y las guarda en
  TimescaleDB; `nucleo-sin-conexion` marca los dispositivos que dejan de reportar.
- **Reportes:** `nucleo-reportes.timer` genera cada 15 minutos los reportes programados, con el
  texto redactado por `IA_PROVEEDOR=local`.
- **Correo:** Gmail por SMTP con una contraseña de aplicación de la cuenta del proyecto.
- **Push:** `NUCLEO_PUSH_HABILITADO=true`; el backend envía a Expo, que entrega por Firebase
  (proyecto `nucleo-firebase`) a los teléfonos registrados al iniciar sesión en la app.
- **App:** `deploy/compilar_apk.sh` compila el APK en el mismo servidor y lo publica en
  `/app/nucleo.apk`.
- **Respaldos:** `nucleo-respaldo.timer` respalda a diario las dos bases y la configuración del
  broker: 7 días en el servidor y 30 en Google Drive.
- **Disponibilidad:** todos los servicios arrancan con el equipo y se reinician solos; los
  contenedores tienen límite de memoria. El equipo no se suspende con la tapa
  cerrada ni por inactividad, usa el cable si está conectado y el Wi-Fi como respaldo.

**Actualizar el servidor** después de subir cambios a `dev`: desde el servidor,
`bash deploy/desplegar.sh` (trae `dev`, migra, recompila y reinicia).

El acceso por SSH desde cualquier red, los comandos de operación y la instalación desde cero
están en [`deploy/README.md`](deploy/README.md).
