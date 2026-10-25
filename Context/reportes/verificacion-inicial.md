# Reporte de verificación inicial

- Fecha local: 2026-10-22 (UTC-07:00); la parte IoT se comprobó el 2026-10-23
- Entorno: Fedora Linux 44, kernel 7.2.11, usuario `brandon`
- Alcance: infraestructura y esqueletos iniciales de Núcleo, incluida la app móvil
- Resultado global: **exitoso**, con las limitaciones indicadas al final

## Herramientas detectadas

- **Python del sistema:** 3.14.8 — Detectado, no usado para el backend.
- **Python del backend:** 3.12.15 — Usado en `BackEnd/.venv`.
- **Node.js:** 24.18.0 — Usado para Vite.
- **npm:** 11.16.0 — Usado para Vite y lockfile.
- **Docker Engine:** 29.9.2 — Funcionando.
- **Docker Compose:** 5.6.1 — Funcionando.
- **Git:** 2.56.0 — Repositorio inicializado.
- **PostgreSQL nativo preexistente:** 18 (`postgresql-18.service`) — Detectado en el puerto 5432; no usado por Núcleo.
- **esptool / mpremote:** 5.6.0 / 1.29.0 — Instalados en `IoT/.venv`.
- **Expo / React Native:** 58.0.17 / 0.88.0 — Usado en `Mobile/`.

## Estructura

Se verificó la presencia de:

- `BackEnd/` con `.venv`, configuración dividida, app `core`, pruebas,
  requirements, README y `.env.example`.
- `FrontEnd/` generado con Vite, con React, servicios API, hooks, layouts,
  páginas, estilos y carpetas reservadas por dominio.
- `Mobile/` con Expo, React Native, cliente API, hook de salud, pantalla inicial
  y configuración de lint.
- `IoT/` con el firmware de MicroPython, las bibliotecas en `micropython/lib/`,
  `pymakr.conf`, `requirements.txt` y README.
- `Database/` con scripts `.sql` para las bases locales de pruebas (`Web-Mobile/` e `IoT/`).
- `Context/` con las carpetas y documentos técnicos.
- `Docs/` con el SRS y el modelo relacional; recibirá los reportes formales.
- `docker-compose.yml`, `.env.example`, `.gitignore` y `README.md` en la raíz.
- Repositorio Git inicializado en la rama `main`; no se creó ningún commit.

## Backend

- **Versiones:** Python 3.12.15, Django 5.2.18, DRF 3.18.3, psycopg 3.3.6.
- **`python manage.py check`:** Sin incidencias (0 silenced).
- **Migraciones:** 18 migraciones aplicadas en `nucleo_db`.
- **`python manage.py test`:** 2 pruebas ejecutadas, 2 correctas.
- **Ruff:** Sin errores.
- **`GET /api/v1/health/`:** HTTP 200.
- **CORS para `http://localhost:5173`:** Cabecera `access-control-allow-origin` presente.
- **Conexión desde host:** `nucleo_app` conectó a `nucleo_db` por `127.0.0.1:55432`.

Respuesta real del endpoint:

```json
{"status":"ok","service":"nucleo-backend","version":"0.1.0","timestamp":"2026-10-23T01:26:01.936368+00:00"}
```

Las pruebas usan `SimpleTestCase` y no requieren crear una base temporal.

## Web

- **`npm ci`:** 24 paquetes; 0 vulnerabilidades reportadas por npm.
- **Versiones fijadas:** React/React DOM 19.3.1, Vite 8.3.5.
- **`npm run lint`:** Sin advertencias ni errores.
- **`npm run build`:** Compilación correcta en 313 ms.
- **Salida de build:** `dist/index.html`, CSS y JS generados.
- **Servidor Vite:** `GET /` y `GET /src/main.jsx` respondieron HTTP 200.

No se ejecutó una prueba E2E automatizada en navegador. La lógica de consulta al
endpoint de salud está implementada y el CORS del backend fue verificado.

## App móvil

- **Expo SDK / React Native:** 58.0.17 / 0.88.0.
- **React:** 19.3.0.
- **`npm install`:** 459 paquetes instalados.
- **`npm run lint`:** Sin avisos.
- **`npx expo install --check`:** Dependencias alineadas con SDK 58.
- **`npx expo-doctor`:** 20 de 20 comprobaciones correctas.
- **`npx expo export --platform android`:** Bundle de 623 módulos generado.
- **Dispositivo o emulador:** No probado.

La app móvil consume el mismo endpoint de salud y el mismo contrato que la web.
`npm audit` reporta 5 vulnerabilidades altas en dependencias transitivas de Expo
CLI; no se aplicó una corrección forzada para no romper el SDK.

## Firmware IoT

Comprobado el 2026-10-23:

- **Firmware:** `ESP32_GENERIC-20260824-v1.29.0.bin` (MicroPython 1.29.0),
  descargado de micropython.org; SHA-256
  `e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6`.
- **Herramientas:** `IoT/requirements.txt` instalado en `IoT/.venv`; `esptool`
  5.6.0 y `mpremote` 1.29.0 responden.
- **Bibliotecas:** `ccs811.py`, `mq135.py`, `ssd1306.py`, `umqtt/simple.py` y
  `umqtt/robust.py` pasan `py_compile` con Python 3.12.
- **Pymakr:** versión publicada 2.22.5.

No se grabó el firmware en una placa, no se leyeron sensores, no se probó una
conexión Wi-Fi real y no se estableció una sesión MQTT/TLS porque no hay
dispositivo ni broker/certificados disponibles en el entorno.

## Docker, PostgreSQL y TimescaleDB

- **`docker compose config --quiet`:** Válido.
- **Contenedores:** `nucleo_postgres` y `nucleo_timescaledb` en estado `running` / `healthy`.
- **Imágenes:** `postgres:17-alpine` y `timescale/timescaledb:2.31.0-pg17`.
- **Versiones:** PostgreSQL 17.11 y TimescaleDB 2.31.0.
- **Puertos:** `127.0.0.1:55432` y `127.0.0.1:55433` (el 5432 lo ocupa un PostgreSQL 18 nativo preexistente).
- **Bases:** `nucleo_db` y `nucleo_iot`.
- **Usuarios:** `nucleo_app` y `nucleo_iot`.
- **Extensión:** `timescaledb` 2.31.0 creada en `nucleo_iot`.
- **Hypertable:** `create_hypertable` funcionó con una tabla temporal eliminada después.
- **Volúmenes:** `nucleo_postgres_data` y `nucleo_timescale_data`.
- **`docker compose up -d --wait`:** Ambos servicios quedaron saludables; las 18 migraciones persistieron.

El PostgreSQL 18 nativo preexistente (`postgresql-18.service`) no fue
instalado por esta tarea, no fue utilizado por Núcleo, y no fue modificado ni
detenido. El puerto 5432 no fue alterado.

## Seguridad y Git

- `.env`, `BackEnd/.env`, `FrontEnd/.env`, `Mobile/.env` y `secrets.py`
  están ignorados por Git.
- También están ignorados `.venv/`, `node_modules/`, `dist/`,
  `__pycache__/`, `.ruff_cache/`, certificados y respaldos.
- `package-lock.json`, `requirements.txt` y `.env.example` sí se incluirían.
- Una búsqueda de las contraseñas locales en archivos no ignorados encontró
  **0 coincidencias**.
- Los archivos locales que contienen secretos tienen permisos `600`.

## Limitaciones y pendientes

1. El broker Mosquitto solo corre en desarrollo, con certificados TLS de desarrollo.
2. El firmware (`boot.py`, `main.py` y `nucleo/`) está escrito, pero no se grabó ni se
   probó por falta de ESP32 y sensores conectados.
3. El modelo exacto de ESP32 y el pinout siguen sin confirmarse.
4. El CCS811 no está calibrado; no se interpretaron lecturas como concentración.
5. Faltan el proveedor de IA y de correo, y probar el push con Expo en un teléfono real; el
   canal en vivo del backend no tiene todavía clientes web ni móvil.
6. No hay pruebas automatizadas de web ni móvil, ni del firmware en hardware.
7. La app móvil no se probó en un emulador ni en un teléfono real.
8. El puerto 5432 sigue ocupado por la instalación nativa preexistente
   PostgreSQL 18 (`postgresql-18.service`), ajena al proyecto; no se tocó.
