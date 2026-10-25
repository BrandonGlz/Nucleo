# Contrato compartido de la API

## Propósito

La web (`FrontEnd/`) y la app móvil (`Mobile/`) son dos clientes del mismo
backend Django. Ningún cliente accede directamente a PostgreSQL, a TimescaleDB ni
al broker MQTT.

## Base

- Prefijo: `/api/v1/`.
- Desarrollo: `http://127.0.0.1:8000/api/v1`.
- Formato: JSON (solo se acepta `application/json`).
- La URL se configura por cliente, no se escribe dentro del código de negocio.

- **Web:** `VITE_API_BASE_URL`, por ejemplo `http://localhost:8000/api/v1`.
- **Móvil:** `EXPO_PUBLIC_API_BASE_URL`, por ejemplo `http://10.0.2.2:8000/api/v1`.

Las listas están paginadas: `{"count", "next", "previous", "results"}` con 50
elementos por página y el parámetro `?page=`. Los nombres de campo son los del
modelo relacional, en español.

## Autenticación

Las rutas, salvo `health` y `auth/login`, exigen el encabezado:

```text
Authorization: Token <token>
```

```text
POST /auth/login/              {"correo", "password", "token_expo"?, "plataforma"?} → {"token", "usuario"};
                               máximo 10 por minuto. La app móvil envía token_expo y plataforma
                               (ANDROID o IOS) juntos para registrar su teléfono
POST /auth/logout/             {"token_expo"?}; invalida el token actual y elimina ese teléfono
GET  /auth/yo/                 Usuario autenticado
POST /auth/cambiar-password/   {"password_actual", "password_nueva"}; invalida el token
```

El token caduca tras 7 días sin uso (`NUCLEO_TOKEN_DIAS_SIN_USO`); cada petición lo
renueva (como máximo una vez por minuto) y deja de valer al cerrar sesión o cambiar la
contraseña. Con un token caducado la API responde 401 y basta iniciar sesión de nuevo.
Web y móvil usan el mismo mecanismo. CORS aplica al navegador; una app nativa debe respetar
autenticación y `ALLOWED_HOSTS`.

## Roles y alcance de los datos

Cada respuesta contiene solo datos de la organización del usuario (no inicia sesión una
cuenta cuya organización esté suspendida o dada de baja). Además:

- **ADMINPLAT:** no pertenece a ninguna organización; solo gestiona organizaciones y su
  primer administrador, y recibe 403 en el resto de las rutas.
- **ADMIN:** toda su organización.
- **SUPER y ANALISTA:** su área, si tienen una asignada.
- **OPER:** únicamente el dispositivo que tiene asignado.

Un recurso fuera del alcance responde 404; una acción no permitida para el rol
responde 403.

## Endpoints

```text
Salud y catálogos
├── GET  /health/                           Público
└── GET  /catalogos/                        Roles, estados y variables ambientales

Organizaciones y usuarios
├── /organizaciones/                        Todos: la organización propia; PATCH: ADMIN
│                                           (sin cambiar estado). ADMINPLAT: todas, alta (POST),
│                                           y estado ACTIVA, SUSPENDIDA o BAJA (PATCH)
├── POST /organizaciones/{num}/primer-administrador/
│                                           Solo ADMINPLAT; crea el primer ADMIN; 409 si ya existe
├── /areas/                                 Lectura: todos; escritura: ADMIN
└── /usuarios/                              ADMIN y SUPER; la baja marca la cuenta Inactiva;
                                            el rol ADMINPLAT no se asigna desde aquí

Dispositivos
├── /dispositivos/                          Alta y baja: ADMIN; PATCH del intervalo: ADMIN y SUPER;
│                                           estados LINEA, CALENT, SINCONEX, BATBAJA, MANT, BAJA
├── GET /dispositivos/{num}/ultimas-lecturas/    Última lectura de cada variable
└── /sensores/                              Escritura: ADMIN y SUPER; filtro ?dispositivo=

Umbrales
└── /umbrales/                              Escritura: ADMIN y SUPER; filtro ?dispositivo=;
                                            peligro_min ≤ advertencia_min < advertencia_max ≤ peligro_max

Mediciones
├── GET /lecturas/                          Filtros: dispositivo, sensor, variable, desde, hasta,
│                                           estabilizada (true|false)
└── GET /lecturas/serie/                    Tendencia: dispositivo y variable obligatorios,
                                            intervalo=minuto|hora|dia; sin fechas, últimas 24 h;
                                            solo lecturas estabilizadas

Alertas
├── GET /alertas/                           Filtros: estado, nivel, dispositivo, variable, desde, hasta;
│                                           incluye la lectura que la disparó y los 4 límites
├── POST /alertas/{num}/atender/            {"observaciones"}; ADMIN y SUPER
├── POST /alertas/{num}/descartar/          {"observaciones"}; ADMIN y SUPER
└── GET /notificaciones/                    Notificaciones del propio usuario

Reportes (ADMIN, SUPER y ANALISTA)
├── GET /reportes/                          Lista y detalle
├── POST /reportes/                         {"area"?, "periodo_inicio", "periodo_fin"}
├── GET /reportes/{num}/pdf/                Descarga en PDF
└── /programaciones-reporte/                Reportes periódicos: {"frecuencia" DIARIA|SEMANAL|MENSUAL,
                                            "destinatarios" [num de usuario], "area"?,
                                            "activa"?, "proxima_ejecucion"?}; destinatarios de la
                                            misma organización; SUPER y ANALISTA con área
                                            solo programan la suya
```

Las fechas se envían y se reciben en ISO 8601 con zona horaria, por ejemplo
`2026-10-23T15:20:00-07:00`.

## Canal en vivo (WebSocket)

```text
ws://<host>:8000/ws/panel/?token=<token de la API>
```

Una sola conexión por cliente. Al conectar responde `{"tipo": "conectado", "usuario": <num>}`.
Se rechaza con el código de cierre **4401** si el token falta, es falso o está caducado, o si
la cuenta es del administrador de plataforma. El cliente puede enviar `{"tipo": "ping"}` y
recibe `{"tipo": "pong"}`; los eventos tienen la forma `{"tipo", "datos"}`:

```text
alerta.nueva       num, estado, nivel, tipo, variable, dispositivo, dispositivo_nombre, valor, fecha_hora
alerta.atendida    los mismos campos
alerta.descartada  los mismos campos
dispositivo.estado dispositivo, nombre, estado, nivel_bateria, ultima_conexion
```

Cada conexión recibe solo los eventos de su organización que su rol puede ver: el operador,
los de su dispositivo; el supervisor y el analista con área, los de su área; el
administrador, todos. El canal no transmite lecturas: para ellas se consulta
`/dispositivos/{num}/ultimas-lecturas/`. Si la conexión se cae, el cliente debe reconectar
con espera creciente y volver a pedir por la API lo que haya cambiado.

### `GET /health/`

Público, sin autenticación.

```json
{
  "status": "ok",
  "service": "nucleo-backend",
  "version": "0.1.0",
  "timestamp": "2026-10-23T01:26:01.936368+00:00"
}
```

La web y la app móvil usan este endpoint en su pantalla inicial.

## Errores

- Los errores de validación responden 400 con `{"campo": ["mensaje"]}`.
- 401 sin credenciales válidas, 403 sin permiso, 404 fuera del alcance, 405 método
  no permitido.
- 409 cuando el recurso tiene registros relacionados, la alerta ya fue resuelta o la
  organización ya tiene administrador.
- 503 cuando el servicio de IA no está disponible al pedir un reporte.

## Reglas para nuevos endpoints

1. Mantener el prefijo `/api/v1/` mientras no haya un cambio incompatible.
2. Documentar método, ruta, autenticación, entrada y respuesta.
3. Validar la entrada en el backend; no confiar en la web ni en la app.
4. Devolver fechas en ISO 8601 con zona horaria.
5. No exponer credenciales, rutas internas ni detalles de la base.
6. Filtrar siempre con `common/scoping.py` y declarar roles con `PermisoPorRol`.
7. Actualizar este documento y los clientes en el mismo cambio.

## Datos de IoT

Los dispositivos no usan la API REST: publican por MQTT y el backend guarda las
lecturas en TimescaleDB (`nucleo_iot`; ver `Context/mqtt/broker-mosquitto.md`). Web y
móvil consultan esas mediciones solo a través de la API del backend.
