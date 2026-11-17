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
elementos por página y el parámetro `?page=`; `?page_size=` pide hasta 1000 por página
(la web y la app piden 1000 y filtran en el dispositivo). Los nombres de campo son los del
modelo relacional, en español.

## Autenticación

Las rutas, salvo `health`, `auth/login`, `auth/recuperar` y `auth/restablecer`, exigen el
encabezado:

```text
Authorization: Token <token>
```

```text
POST /auth/login/              {"correo", "password", "codigo"?, "token_expo"?, "plataforma"?}
                               → {"token", "usuario", "configurar_segundo_factor"}; intentos por
                               minuto por IP según la política de seguridad (10 al instalar). Con la verificación en dos pasos activa y sin
                               "codigo": 401 {"detail", "requiere_codigo": true}. La app móvil
                               envía token_expo y plataforma (ANDROID o IOS) juntos para
                               registrar su teléfono
POST /auth/recuperar/          {"correo"}; siempre 204. Si la cuenta existe y está activa, manda
                               el enlace {NUCLEO_URL_WEB}/restablecer?uid=…&token=… (1 h, un solo
                               uso); máximo 5 por hora por IP
POST /auth/restablecer/        {"uid", "token", "password"}; 204 y cierra todas las sesiones
GET  /auth/2fa/                {"activo", "obligatorio", "codigos_restantes"}
POST /auth/2fa/configurar/     → {"secreto", "uri", "qr_svg"} (aún sin activar)
POST /auth/2fa/activar/        {"codigo"} → {"codigos_recuperacion": [10]} (solo se ven aquí)
POST /auth/2fa/desactivar/     {"password", "codigo"}; 403 si el rol la tiene obligatoria
POST /auth/2fa/codigos/        {"codigo"} → códigos de recuperación nuevos
POST /auth/logout/             {"token_expo"?}; cierra solo la sesión actual y elimina ese teléfono
POST /auth/telefono/           {"token_expo", "plataforma"}; activa los push en ese teléfono sin
                               volver a entrar (interruptor del perfil de la app)
DELETE /auth/telefono/         {"token_expo"}; los desactiva
GET  /auth/yo/                 Usuario autenticado
POST /auth/cambiar-password/   {"password_actual", "password_nueva"}; cierra todas sus sesiones
GET  /auth/sesiones/           Sus sesiones abiertas (cliente, agente, IP, creada, último uso;
                               `actual` = la de esta petición)
DELETE /auth/sesiones/{num}/   Cierra otra de sus sesiones (la actual: 400, usar logout)
```

Cada inicio de sesión abre una **sesión** propia (tabla `sesion`: navegador o teléfono, IP,
creación y último uso; solo se guarda el SHA-256 de la clave). La web la recibe en una cookie
HttpOnly y la app en `token`. Caduca tras los días sin uso de la política de seguridad (7 al
instalar); cada petición la renueva (como máximo una vez por minuto). Cerrar sesión cierra solo
esa; cambiar o restablecer la contraseña y la baja de la cuenta cierran todas. Desde la consola
de administración se ven y se cierran una por una. Con una sesión caducada o cerrada la API
responde 401 y basta iniciar sesión de nuevo. CORS aplica al navegador; una app nativa debe respetar
autenticación y `ALLOWED_HOSTS`.

Si el rol está entre los que la política de seguridad obliga a usar la verificación en dos pasos y la cuenta aún no configura la verificación en dos
pasos, todo lo que no sea `/auth/` responde 403 con `"segundo_factor_pendiente": true`; la web
lleva a Mi perfil y la app pide configurarla en la web.

### Tokens de API (integraciones)

Otros sistemas de la organización leen con `Authorization: ApiKey nuc_<prefijo>_<secreto>`
(creado en **Integraciones**; se muestra una sola vez). Actúa como ANALISTA de toda la
organización y solo con GET en `/dispositivos/`, `/sensores/`, `/lecturas/` (y `exportar/`) y
`/alertas/` (y `exportar/`); lo demás responde 401 o 403.

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
Salud, catálogos y documentación
├── GET  /health/                           Público
├── GET  /catalogos/                        Roles, estados y variables ambientales
├── GET  /esquema/                          Esquema OpenAPI 3 (YAML; JSON con Accept
│                                           application/vnd.oai.openapi+json); con sesión o ApiKey
└── GET  /docs/                             Swagger UI del esquema, servido sin CDN; con sesión

Organizaciones y usuarios
├── /organizaciones/                        Todos: la organización propia; PATCH: ADMIN
│                                           (sin cambiar estado). ADMINPLAT: todas, alta (POST),
│                                           y estado ACTIVA, SUSPENDIDA o BAJA (PATCH)
├── POST /organizaciones/{num}/primer-administrador/
│                                           Solo ADMINPLAT; crea el primer ADMIN; 409 si ya existe
├── /areas/                                 Lectura: todos; escritura: ADMIN
└── /usuarios/                              ADMIN y SUPER; la baja marca la cuenta Inactiva;
                                            el rol ADMINPLAT no se asigna desde aquí; POST exige
                                            password; acceso_agente permite el agente a un OPER

Dispositivos
├── /dispositivos/                          Alta y baja: ADMIN; PATCH del intervalo: ADMIN y SUPER;
│                                           PATCH del área: ADMIN (quita al operador de otra área);
│                                           estados LINEA, CALENT, SINCONEX, BATBAJA, MANT, BAJA;
│                                           solo lectura: version_firmware y version_reportada_en
│                                           (las informa el ESP en /puente/firmware/) y
│                                           version_firmware_publicada (null si no hay ninguna)
├── GET /dispositivos/{num}/ultimas-lecturas/    Última lectura de cada variable
└── /sensores/                              Escritura: ADMIN y SUPER; filtro ?dispositivo=

Umbrales
└── /umbrales/                              Escritura: ADMIN y SUPER; filtro ?dispositivo=;
                                            peligro_min ≤ advertencia_min < advertencia_max ≤ peligro_max

Mediciones
├── GET /lecturas/                          Filtros: dispositivo, sensor, variable, desde, hasta,
│                                           estabilizada (true|false)
├── GET /lecturas/exportar/                 CSV con los mismos filtros; sin fechas, últimos 7 días;
│                                           máximo NUCLEO_EXPORTAR_MAX_FILAS; queda en la auditoría
└── GET /lecturas/serie/                    Tendencia: dispositivo y variable obligatorios,
                                            intervalo=minuto|hora|dia; sin fechas, últimas 24 h;
                                            solo lecturas estabilizadas

Alertas
├── GET /alertas/                           Filtros: estado, nivel, dispositivo, variable, desde, hasta;
│                                           incluye la lectura que la disparó y los 4 límites
├── POST /alertas/{num}/atender/            {"observaciones"}; ADMIN y SUPER
├── POST /alertas/{num}/descartar/          {"observaciones"}; ADMIN y SUPER
├── GET /alertas/exportar/                  CSV con los mismos filtros; queda en la auditoría
└── GET /notificaciones/                    Notificaciones del propio usuario

Seguridad
├── GET /auditoria/                         ADMIN (su organización) y ADMINPLAT (todo); filtros
│                                           accion, recurso, usuario, desde, hasta; paginado
├── /integraciones/tokens/                  ADMIN; POST {"nombre", "fecha_expiracion"?} → incluye
│                                           "clave" una sola vez; DELETE revoca
├── /integraciones/webhooks/                ADMIN; {"nombre", "url" (https), "eventos", "activo"};
│                                           POST → incluye "secreto" una sola vez
└── POST /integraciones/webhooks/{num}/probar/   Envía un evento "prueba" → {"exito", "estado"}

ESP32 (clave X-Puente-Clave, sin sesión)
├── GET /puente/tomar/?dispositivo=         Respaldo HTTPS del latido de Nico AI
├── GET /puente/firmware/?dispositivo=&version=
│                                           Manifiesto firmado de la versión publicada; 204 si
│                                           ya la tiene o no está en NUCLEO_FIRMWARE_DISPOSITIVOS;
│                                           guarda la versión que informa en el dispositivo
└── GET /puente/firmware/archivo/?dispositivo=&version=&ruta=
                                            Un archivo de esa versión

Reportes (ADMIN, SUPER y ANALISTA)
├── GET /reportes/                          Lista y detalle
├── POST /reportes/                         {"area"?, "periodo_inicio", "periodo_fin"}
├── GET /reportes/{num}/pdf/                Descarga en PDF; el texto lo redacta IA_PROVEEDOR
│                                           (local: plantillas con las cifras); sin proveedor, 503
└── /programaciones-reporte/                Reportes periódicos: {"frecuencia" DIARIA|SEMANAL|MENSUAL,
                                            "destinatarios" [num de usuario], "area"?,
                                            "activa"?, "proxima_ejecucion"?}; destinatarios de la
                                            misma organización; SUPER y ANALISTA con área
                                            solo programan la suya

Consola de Nico AI (solo superusuario: ADMINPLAT activo, sin organización)
└── /nico/
    ├── POST chat/ · POST calificar/       Igual que /agente/, con el dispositivo de cualquier empresa
    ├── GET estado/                         Agentes activos de todas las empresas
    ├── GET arbol/                          {puente, empresas: [{num, nombre, areas: [{num, nombre,
    │                                       dispositivos: [{num, nombre, activo, fisico}]}]}]}
    ├── GET resumen/                        Cifras y series del dashboard (por_dia, por_hora,
    │                                       por_via, por_empresa, no_entendidas_frecuentes);
    │                                       no_entendidas = las que siguen sin enseñar,
    │                                       ensenadas = las enseñadas desde la consola
    ├── GET incluidas/                      Respuestas que Nico trae en código (explicación, charla,
    │                                       capacidades, consulta)
    ├── banco/                              CRUD de respuestas: {organizacion | todas, pregunta,
    │                                       tema FIJA|RUTA (TEMP/HUM/AIRE aprendidas), plantilla,
    │                                       activa, registro?}; filtros organizacion, tema,
    │                                       activa, q. Con registro (num de la pregunta desde
    │                                       la que se enseña) esa pregunta y las iguales de la
    │                                       empresa quedan enseñadas (también al editar)
    ├── GET registro/                       Preguntas registradas con ensenada (num de la
    │                                       respuesta) y fecha_ensenada; filtros organizacion,
    │                                       via (NO_ENTENDIDA = solo sin enseñar; ENSENADA =
    │                                       las enseñadas), ensenada true|false,
    │                                       calificacion si|no, q
    ├── GET notificaciones/                 Campana del superusuario: {no_leidas, results:
    │                                       [{num, tipo, nivel, titulo, texto, enlace, leida,
    │                                       fecha}]} (100 más recientes); filtros tipo, leida.
    │                                       tipo NO_ENTENDIDA|NEGATIVA|APRENDIDA|PUENTE|CARGA,
    │                                       nivel INFO|OK|ADVERTENCIA|PELIGRO
    ├── POST notificaciones/leer/           {nums?} → {marcadas, no_leidas}; sin nums, todas
    ├── notificaciones/preferencias/        GET {correo, tipos: [{tipo, etiqueta, descripcion,
    │                                       consola, correo}]}; PATCH {tipos: {TIPO: {consola?,
    │                                       correo?}}}
    ├── GET herramientas/                   {herramientas: [{nombre, descripcion, proposito,
    │   PATCH herramientas/{nombre}/        ejemplo, activa, accion, editada, original}],
    │                                       propositos: [{clave, nombre}]};
    │                                       PATCH {descripcion?, proposito?, ejemplo?, activa?,
    │                                       restaurar?}
    ├── chat/sugerencias/                   GET ?dispositivo= → como /agente/sugerencias/
    ├── sugerencias/                        GET [?dispositivo=] → {ajuste, candidatas}; PATCH
    │                                       {activas, maximo (3-10), usar_banco, usar_incluidas,
    │                                       usar_herramientas, usar_frecuentes, fijadas, ocultas}
    └── documentos/                         GET {documentos: [NICO], secciones, limite, usados};
        ├── {num}/                          PATCH {contenido, activo, descripcion}; un solo
        │                                   documento: no hay POST ni DELETE (405)
        └── {num}/generar/                  POST {seccion}: la IA propone respuestas en segundo
                                            plano; GET ?seccion= → {estado, propuestas, error}

Agente IA (ADMIN, SUPER, ANALISTA y OPER con acceso_agente)
├── GET /agente/sugerencias/               ?dispositivo= → {activas, maximo, sugerencias:
│                                           [{texto, tipo, etiqueta}]}; la web las filtra al escribir
└── POST /agente/                           {"pregunta", "dispositivo"}; un agente por dispositivo;
                                            {"accion"?} confirma una acción preparada;
                                            responde {"texto", "via", "registro", "pasos"}
                                            y, según el caso, "codigo" (sin_permiso,
                                            datos_faltantes, ambiguo, periodo_invalido,
                                            sin_datos, no_encontrado, fuera_de_alcance,
                                            accion_vencida, ia_no_disponible,
                                            mantenimiento, limite_peticiones), "opciones"
                                            (nombres ambiguos, máx. 5) o "accion" {id,
                                            vence} (reporte, envío por correo o
                                            programación preparados que esperan «sí» o
                                            «cancela», 10 min). Una precarga con el servidor
                                            limitado o en mantenimiento recibe 429
                                            ("pasos": lo que el agente hizo, para «Cómo lo
                                            resolví») y, si la pregunta es de una
                                            variable con lecturas sobre el máximo, "picos"
                                            [{cuando, valor}], "serie" y "etiquetas" (máximo
                                            diario de 7 días), "unidad" y "maximo"; 404 si el
                                            dispositivo no está a su alcance. Si se le pide un
                                            «reporte» o «informe» (admin, supervisor o
                                            analista), prepara el del área del dispositivo
                                            con el periodo que nombre (hoy, ayer, esta
                                            semana, mes pasado, octubre, últimos N días; si
                                            no nombra uno, lo pregunta) y responde "accion";
                                            al confirmar («sí») lo genera y responde además
                                            {"reporte": {num, titulo,
                                            periodo_inicio, periodo_fin, dias, lecturas,
                                            alertas, peligro, variables[{variable, nombre,
                                            unidad, promedio, minimo, maximo, alertas}],
                                            resumen}}, que la web y la app muestran en el chat
```

Las fechas se envían y se reciben en ISO 8601 con zona horaria, por ejemplo
`2026-10-23T15:20:00-07:00`.

## Consola de administración (`/consola/`)

Solo el administrador de plataforma (superusuario), desde https://admin.bynucleo.com; cualquier
otro rol recibe 403. Ve y gestiona todas las organizaciones.

```text
GET   /consola/resumen/                 Panel en gráficas: sesiones_activas y sesiones {web, app},
                                        usuarios por estado y sin la 2FA obligatoria, accesos de
                                        hoy y fallidos 24 h/7 días, equipos por estado,
                                        alertas_seguridad {nuevas, criticas}, serie_accesos (14
                                        días: exitosos/fallidos) y accesos_por_hora (24 h, 14 días)
GET   /consola/organizaciones/          [{num, nombre, areas: [{num, nombre}]}]
GET   /consola/usuarios/                ?organizacion&rol&estado&q (paginada); incluye
                                        segundo_factor y sesiones abiertas
POST  /consola/usuarios/                {organizacion, area, rol, nombre, primer_apellido,
                                        segundo_apellido?, correo, password}
PATCH /consola/usuarios/{num}/          rol, área, estado (ACT desbloquea, INA da de baja y cierra
                                        sus sesiones), nombre y correo. No edita al propio
                                        superusuario ni a otro administrador de plataforma
POST  /consola/usuarios/{num}/restablecer/      Le envía el enlace para crear contraseña nueva
POST  /consola/usuarios/{num}/quitar-2fa/       Quita la verificación en dos pasos y cierra sus sesiones
POST  /consola/usuarios/{num}/cerrar-sesiones/  → {cerradas}
GET   /consola/sesiones/                ?organizacion&usuario&cliente=web|app&q (paginada, solo
                                        vigentes): {id, cliente, dispositivo, ip, creada,
                                        ultimo_uso, actual, usuario}
DELETE /consola/sesiones/{id}/          Cierra esa sesión (400 si es la actual)
GET   /consola/dispositivos/            ?organizacion&estado&q (paginada): estado, en_linea,
                                        batería, última conexión y arranque, recibe_ota
PATCH /consola/dispositivos/{num}/      {estado: MANT|BAJA|ACTIVO, recibe_ota}; ACTIVO lo deja sin
                                        conexión hasta su siguiente lectura
GET   /consola/firmware/                {version, publicada, ota_todos, dispositivos_ota}
GET/PATCH /consola/politicas/           {dias_sesion 1–90, intentos_login_por_minuto 3–60,
                                        roles_2fa_obligatorio, dias_auditoria 30–3650, ota_todos}
```

### Alertas de seguridad (módulo «Alertas» de la consola)

Se guardan en `alerta_seguridad` y se abren solas al ocurrir el evento (no al consultar):

| tipo | Cuándo | Nivel |
|---|---|---|
| `ip_fallidos` | ≥5 inicios de sesión fallidos desde una IP en 24 h | crítico desde 10 |
| `cuenta_fallidos` | ≥3 fallidos en una misma cuenta en 24 h | crítico desde 10 |
| `ip_nueva` | acceso desde una IP que la cuenta no usó en los 30 días previos (si ya tenía accesos) | advertencia |
| `cuenta_bloqueada` | la cuenta pasa a `BLQ`; al desbloquearla la alerta queda revisada sola | advertencia |

No se duplica una alerta abierta (`estado = nueva` con la misma `clave`, índice único parcial): los
eventos siguientes actualizan `eventos`, `ultimo_evento` y suben el nivel. Tras revisar o descartar,
los intentos anteriores ya no cuentan para reabrirla. Las cuentas sin la 2FA obligatoria no son un
evento: se calculan al vuelo (`sin_2fa` de `/alertas/resumen/`).

```text
GET   /consola/alertas/                 ?estado=nueva|revisada|descartada&nivel=critico|advertencia
                                        &tipo&q (cuenta, IP o título) (paginada): {num, tipo,
                                        nivel, estado, titulo, detalle, usuario {num, nombre,
                                        correo}|null, ip, eventos, creada, ultimo_evento,
                                        revisada_por, fecha_revision, nota}
GET   /consola/alertas/resumen/         {nuevas, criticas, ultimos_30_dias, por_tipo: [{tipo,
                                        total}], sin_2fa}
POST  /consola/alertas/{num}/revisar/   {nota?} → alerta (400 si ya no es nueva)
POST  /consola/alertas/{num}/descartar/ {nota?} → alerta (400 si ya no es nueva)
POST  /consola/alertas/revisar-todas/   → {revisadas}
GET   /consola/notificaciones/          ?leida=true|false (paginada) + no_leidas: avisos del
                                        superusuario que consulta, con los niveles de su campana:
                                        {num, alerta, nivel, fecha, leida, correo_enviado}
POST  /consola/notificaciones/leer/     {nums?} → {leidas} (sin nums marca todas)
GET/PATCH /consola/notificaciones/preferencias/  {niveles_consola, niveles_correo} (listas de
                                        critico/advertencia; por omisión campana con ambos y
                                        correo solo con las críticas)
```

Una alerta nueva, o una que sube de advertencia a crítica, crea una notificación para cada
superusuario activo y le manda correo si el nivel está en sus `niveles_correo`
(`correo_enviado`: `null` si no tocaba, `true`/`false` según salió). No hay push a la app.

La bitácora (`/auditoria/`, con `?organizacion=`) y las integraciones (`/integraciones/…`, con
`?organizacion=` obligatorio para listar y crear) también son solo del administrador de
plataforma y se gestionan desde esta consola. Todo lo que se hace en ella queda en la bitácora.

## Webhooks

Cada evento elegido (`alerta.nueva`, `alerta.atendida`, `alerta.descartada`; `prueba` desde el
botón) se envía como `POST` JSON `{"evento", "fecha_hora", "datos"}` con los encabezados
`X-Nucleo-Evento`, `X-Nucleo-Entrega` (id único), `X-Nucleo-Fecha` (segundos Unix) y
`X-Nucleo-Firma: sha256=<hex>` = HMAC-SHA256(secreto, `"<X-Nucleo-Fecha>.<cuerpo>"`). El
receptor debe comparar la firma en tiempo constante y rechazar fechas viejas. Hay 3 intentos;
tras 10 fallas seguidas el webhook se pausa. Solo se aceptan direcciones HTTPS con IP pública y
no se siguen redirecciones.

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
7. Actualizar este documento y los clientes en el mismo cambio, incluidas las
   constantes del módulo en `FrontEnd/src/api/` y `Mobile/src/api/` (las dos
   carpetas son iguales).

## Datos de IoT

Los dispositivos no usan la API REST: publican por MQTT y el backend guarda las
lecturas en TimescaleDB (`nucleo_iot`; ver `Context/mqtt/broker-mosquitto.md`). Web y
móvil consultan esas mediciones solo a través de la API del backend.
