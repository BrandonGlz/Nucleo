# Decisiones tecnológicas

## Registro de decisiones

**Backend**

- Python 3.12.15 — *Aceptada*. Compatibilidad estable con Django 5.2 LTS; se evitó 3.14.
- Django 5.2.18 LTS — *Aceptada*. Versión LTS solicitada y soportada.
- DRF 3.18.3 — *Aceptada*. Versión estable compatible con Django 5.2.
- psycopg 3.3.6 (binary) — *Aceptada*. Controlador PostgreSQL 3 con paquete binario.
- django-environ — *Aceptada*. Configuración por entorno y validación de `DATABASE_URL`.
- CORS con `django-cors-headers` — *Aceptada*. Permitir el origen de Vite en desarrollo.
- Django Channels 4.3 con Daphne y Redis 7 (`channels-redis`) — *Aceptada*. Servidor ASGI para HTTP y WebSocket; Redis reparte los eventos entre procesos (el consumidor MQTT y el servidor web son procesos distintos). Sin `REDIS_URL` se usa una capa en memoria, solo válida con un proceso.

**API**

- Prefijo `/api/v1/` — *Aceptada*. Versionado explícito de la API.
- Salud pública en `/api/v1/health/` — *Aceptada*. Verificación sin autenticación.
- Política por defecto `IsAuthenticated` — *Aceptada*. Solo `health` y `auth/login` son públicos.
- Autenticación por token de DRF para web y móvil — *Aceptada*. Un solo mecanismo para ambos clientes sin dependencias nuevas; el token caduca a los 7 días sin uso (`NUCLEO_TOKEN_DIAS_SIN_USO`) y se renueva con la actividad.
- Permisos por rol y aislamiento por organización en `common/` — *Aceptada*. Cada vista declara roles y toda consulta parte de la organización del usuario.
- API en español, con los nombres del modelo relacional — *Aceptada*. Los clientes usan los mismos nombres que las tablas.
- Un solo backend para web y móvil — *Aceptada*. Evitar duplicar lógica, datos y autenticación.

**Frontend**

- React 19.3.1 + Vite 8.3.5 — *Aceptada*. Stack solicitado, compilación verificada.
- React Router 7 — *Aceptada*. Navegación entre módulos; las rutas y el menú salen del registro `src/features/index.js`.
- JavaScript + JSX — *Aceptada*. Era la opción pedida; no había razón para TypeScript.
- npm + `package-lock.json` — *Aceptada*. Reproducibilidad.
- Oxlint — *Aceptada*. Incluido por el scaffolding oficial.

**Mobile**

- Expo SDK 58 + React Native 0.88 — *Aceptada*. App móvil con el mismo lenguaje de la web y sin configurar Android Studio/Xcode.
- JavaScript + JSX — *Aceptada*. Coherencia con la web y menor complejidad inicial.
- React Navigation (pila nativa) — *Aceptada*. Navegación entre módulos; las pantallas salen del registro `src/modules/index.js`.

**Base de datos**

- Modelo relacional de 16 tablas en `nucleo_db` y la hypertable `lectura` en `nucleo_iot`, creados con migraciones de Django — *Aceptada*. Nombres de tabla y columna del modelo; modelo de usuario propio (`usuarios.Usuario`).
- Valores por defecto en la base (`db_default`) y restricciones `CHECK` — *Aceptada*. La base impide datos inválidos aunque falle la aplicación.
- Zona horaria `America/Tijuana` con `USE_TZ` — *Aceptada*. Se guarda en UTC y se muestra en hora local.
- PostgreSQL 17 en Docker — *Aceptada*. Requisito obligatorio; sin instalación nativa.
- Puerto local 55432 en loopback — *Aceptada*. 5432 está ocupado por un PostgreSQL 18 nativo preexistente, no usado por Núcleo.
- PostgreSQL 17 para Django y TimescaleDB 2.31 para IoT, en servicios separados — *Aceptada*. Aislar la telemetría y usar hypertables sin mezclarla con datos transaccionales.
- Dos bases con `DATABASE_ROUTERS` (`LecturaRouter`) y sin llaves foráneas entre ellas — *Aceptada*. La alerta copia número, fecha y valor de su lectura; el código junta ambos lados al consultar.
- Cuatro límites por umbral (peligro y advertencia, mínimo y máximo) y alertas por nivel — *Aceptada*. Normal, Advertencia y Peligro; una alerta pendiente por umbral y nivel.
- Administrador de plataforma sin organización — *Aceptada*. Da de alta, suspende y da de baja organizaciones sin ver sus datos.
- Sin scripts de inicialización; las imágenes crean base y usuario desde `.env` — *Aceptada*. Mantener solo `docker-compose.yml`.

**IoT**

- Python con MicroPython 1.29.0 — *Aceptada*. Prototipado rápido y equipo familiarizado con Python; se acepta menor rendimiento que C.
- Build `ESP32_GENERIC` — *Provisional*. ESP32 normal (DevKit); no se conoce el módulo exacto.
- Pymakr 2.22.5, `esptool` 5.6.0 y `mpremote` 1.29.0 — *Aceptada*. Pymakr para trabajar desde VS Code; `esptool` graba el firmware.
- MQTT sobre TLS en 8883 con CA — *Aceptada*. Seguridad de transporte; sin desactivar la validación del certificado.
- Calidad del aire con CCS811 (eCO2 estimado) y marca `aire_estabilizado` — *Aceptada*. Las lecturas de los 20 minutos de calentamiento se guardan sin generar alertas ni entrar en reportes; el firmware guarda el baseline del sensor cada hora y lo restaura al arrancar.
- Cola en memoria de 20 mensajes con hora para reenviar lo medido sin conexión — *Aceptada*. Sin hora válida un mensaje no se encola (la plataforma fecharía la lectura al recibirla).

**Comunicación**

- Mosquitto 2 en Docker Compose con TLS en 8883, usuarios y ACL por dispositivo — *Aceptada*. Certificados de desarrollo con `Mosquitto/preparar.sh`.
- Cliente MQTT del backend como Singleton (`paho-mqtt`) — *Aceptada*. Una conexión compartida; el consumidor es un comando de Django.
- Usuario MQTT por dispositivo igual a su `codigo_mqtt`, con ACL `pattern ... %u` — *Aceptada*. Un dispositivo solo publica en su propio tópico aunque cambie su `client_id`; `Mosquitto/dispositivo.sh` crea cada usuario.
- Configuración retenida hacia el dispositivo en `nucleo/devices/<codigo_mqtt>/config` — *Aceptada*. Disponible con `MQTT_PUBLICAR_CONFIG`.

**Ingesta**

- Consumidor MQTT con validación de rango físico y alerta única por umbral pendiente — *Aceptada*. Los errores de un sensor no descartan el resto del mensaje.

**Reportes**

- Cifras calculadas en SQL y redacción por IA — *Aceptada*. La IA solo redacta; sin proveedor configurado la API responde 503.
- PDF con ReportLab — *Aceptada*. Se genera al crear el reporte, incluye una curva por variable (promedio, mínimo y máximo por hora o por día) y se puede descargar.

**Tiempo real y notificaciones**

- Canal WebSocket `ws/panel/?token=<token>` con grupo por organización y filtro por rol — *Aceptada*. Eventos `alerta.nueva`, `alerta.atendida`, `alerta.descartada` y `dispositivo.estado`, publicados al confirmarse la transacción.
- Push con la API de Expo vía `urllib` — *Aceptada*. Implementado y apagado por defecto (`NUCLEO_PUSH_HABILITADO`); elimina el teléfono si Expo responde `DeviceNotRegistered`.

**Seguridad de base de datos**

- Roles `nucleo_backend` y `nucleo_backend_iot` sin superusuario para producción (`Database/crear-roles.sh`) — *Aceptada*. Dueños de su base, sin acceso a la ajena; en desarrollo se usa el superusuario del contenedor.

## Consecuencias

- El backend falla al arrancar si `DATABASE_URL` o `IOT_DATABASE_URL` no apuntan a PostgreSQL o si
  falta `DJANGO_SECRET_KEY`.
- TimescaleDB crea la extensión `timescaledb` en `nucleo_iot`; la hypertable `lectura`
  la crea la migración de `mediciones` (`migrate --database=iot`).
- Cada base se crea solo al iniciar con su volumen vacío; los cambios
  posteriores deben ser migraciones explícitas.
- El nodo MicroPython no publicará hasta tener `boot.py`, `main.py`,
  credenciales locales en `secrets.py` y un certificado CA válido. La validación
  TLS debe quedar activa.
- El canal en vivo necesita Redis para funcionar entre procesos (`docker compose up -d redis`); las pruebas usan una capa en memoria.
- La web y la app móvil pueden mostrarse aunque el backend esté caído; ambas
  indican el estado de la API y permiten reintentar.
- La app móvil no accede a PostgreSQL ni TimescaleDB; todo pasa por la API.

## Decisiones pendientes

1. Proveedores de correo y de IA, y activación del push con Expo en un teléfono real.
2. Despliegue de Mosquitto fuera de desarrollo, certificados y rotación de secretos.
3. Estrategia de respaldo, retención y recuperación.
4. Modelo exacto de ESP32, pinout y circuito de alimentación.
5. Definición de umbrales por contexto.
6. Pruebas del frontend y de integración automatizadas con el broker real.
7. CI/CD, contenedores de aplicación y proxy inverso.
