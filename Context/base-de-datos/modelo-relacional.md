# Modelo relacional

Dos bases en Docker:

- **`nucleo_db`** (PostgreSQL 17): 20 tablas de negocio que crean las migraciones de
  Django a partir de los modelos de `BackEnd/apps/`. El mismo esquema, escrito en SQL,
  está en `Database/Web-Mobile/tables.sql` y se carga en `nucleo_test` para practicar.
- **`nucleo_iot`** (TimescaleDB 2.31): la hypertable `lectura`. Su SQL está en
  `Database/IoT/tables.sql` y se carga en `nucleo_iot_test`.

No hay llaves foráneas entre las dos bases. La alerta copia el valor y la fecha de la
lectura que la disparó, y el backend junta ambos lados al consultar.

Convención: las llaves primarias numéricas se llaman `num` y las de texto
`codigo`; las llaves foráneas llevan el nombre de la tabla de destino seguido de
`_num` o `_codigo`. Toda la información cuelga de una organización, que es lo que
aísla los datos de cada cliente.

## Relaciones

```text
nucleo_db
organizacion ─┬─ area ─┬─ usuario ─┬─ rol, estado_usuario
              │        │           └─ telefono_push
              │        └─ dispositivo ─┬─ sensor ─── estado_sensor
              │             │          ├─ umbral ─── variable_ambiental
              │             │          └─ (operador y registrado_por → usuario)
              │             └─ estado_dispositivo
              ├─ programacion_reporte
              ├─ reporte ─── envio_reporte (intentos de correo)
              └─ respuesta_aprendida (banco de Nico AI)
area ── puente_nico_num → dispositivo (ESP de Nico del área)
usuario, dispositivo ── pregunta_agente (registro de Nico AI)
usuario ── notificacion_nico, preferencia_avisos_nico (consola de Nico AI)
formato_reporte ─┬─ version_formato ─── reporte
                 ├─ programacion_reporte (formato_num)
                 └─ area (formato_reporte_num)
tablero_analitica ─── version_tablero

umbral ── alerta ── notificacion ─┬─ usuario
                                  └─ telefono_push (solo canal PUSH)
usuario ── aviso                   (campana: dispositivos, usuarios, reportes y Nico AI)
organizacion ─┬─ solicitud_acceso  (persona sin cuenta que pide entrar; área opcional)
area ─────────┘   (atendida_por y usuario_creado → usuario)

nucleo_iot
sensor_num, variable_codigo ··· lectura        (sin llave foránea; viene de nucleo_db)
alerta.lectura_num, lectura_fecha_hora ··· lectura
```

## Catálogos

Cada uno tiene `codigo` (PK), `nombre` (único) y `descripcion`; sus filas
iniciales las carga la migración `catalogos/0002_datos_iniciales.py`.

```text
rol                  ADMINPLAT, ADMIN, SUPER, ANALISTA, OPER
estado_usuario       ACT, INA, BLQ
estado_dispositivo   LINEA, CALENT, SINCONEX, BATBAJA, MANT, BAJA
estado_sensor        OPERA, CALIB, FALLA
variable_ambiental   TEMP (°C, −40 a 80), HUM (%HR, 0 a 100), AIRE (ppm, 0 a 10000)
                     [codigo, nombre, unidad, rango_min, rango_max; CHECK rango_min < rango_max]
```

## Tablas de nucleo_db

```text
organizacion   num, nombre, dir_calle, dir_numero, dir_colonia, ciudad, telefono,
               estado (def. ACTIVA), fecha_registro (def. now())
               CHECK estado en ACTIVA, SUSPENDIDA, BAJA
area           num, organizacion_num, nombre, descripcion,
               formato_reporte_num (opcional, SET NULL: predeterminado del área),
               puente_nico_num (opcional, SET NULL: dispositivo con puente_ia que habilita
               a Nico AI en esa área para SUPER, ANALISTA y OPER)
               UNIQUE (organizacion_num, nombre)
usuario        num, organizacion_num (opcional), area_num (opcional), rol_codigo,
               estado_usuario_codigo, nombre, primer_apellido, segundo_apellido,
               correo (único), telefono (TEXT cifrado con Fernet), password (hash),
               foto (opcional, ≤ 100: ruta en MEDIA_ROOT «fotos/<aleatorio>.webp»),
               debe_cambiar_password (def. FALSE; TRUE en las altas con contraseña temporal),
               ultimo_acceso, fecha_registro
               CHECK (rol_codigo = 'ADMINPLAT') = (organizacion_num IS NULL)
               ÍNDICE (organizacion_num, area_num)
telefono_push  num, usuario_num, token_expo (único), plataforma, fecha_registro
               CHECK plataforma en ANDROID, IOS
dispositivo    num, area_num, estado_dispositivo_codigo, operador_num (opcional),
               registrado_por, nombre, codigo_mqtt (único), intervalo_muestreo_seg
               (def. 30), nivel_bateria, voltaje_bateria, intervalo_reportado_seg, ultima_conexion, ultimo_arranque, recibe_ota
               (def. FALSE, la elige la consola de administración), puente_ia (def. FALSE: ESP32
               físico que sirve de llave de Nico AI), version_firmware y
               version_reportada_en (las informa el ESP al revisar la OTA), fecha_alta
               CHECK intervalo_muestreo_seg entre 5 y 120; CHECK nivel_bateria entre 0 y 100
sensor         num, dispositivo_num, estado_sensor_codigo, modelo, funcion,
               fecha_acondicionamiento, fecha_calibracion
               UNIQUE (dispositivo_num, modelo)
umbral         num, dispositivo_num, variable_codigo, configurado_por, peligro_min,
               advertencia_min, advertencia_max, peligro_max, activo, fecha_actualizacion
               UNIQUE (dispositivo_num, variable_codigo)
               CHECK peligro_min <= advertencia_min < advertencia_max <= peligro_max
alerta         num (bigint), umbral_num, atendida_por (opcional), lectura_num,
               lectura_fecha_hora, lectura_valor, nivel, tipo, estado (def. PENDIENTE),
               fecha_hora, fecha_atencion, observaciones
               CHECK nivel en ADVERTENCIA, PELIGRO; CHECK tipo en POR_ENCIMA, POR_DEBAJO;
               CHECK estado en PENDIENTE, ATENDIDA, DESCARTADA
               ÍNDICE ÚNICO (umbral_num, nivel) WHERE estado = 'PENDIENTE'
               ÍNDICE (estado, fecha_hora DESC)
notificacion   num (bigint), alerta_num, usuario_num, telefono_push_num (opcional),
               canal, estado_envio, fecha_envio
               CHECK canal en CORREO, PUSH; CHECK estado_envio en ENVIADA, FALLIDA
               CHECK canal = 'PUSH' o telefono_push_num nulo
aviso          num (bigint), usuario_num (CASCADE), tipo, nivel (def. INFO), titulo (≤ 120),
               detalle (≤ 300, def. ''), ruta (≤ 200, ruta de la web, def. ''), fecha_hora
               (def. now()), leido_en (NULL = sin leer)
               CHECK tipo en DISPOSITIVO, USUARIO, REPORTE, NICO; CHECK nivel en INFO,
               ADVERTENCIA, PELIGRO; CHECK ruta vacía o empieza con /
               ÍNDICE (usuario_num, fecha_hora DESC); ÍNDICE (usuario_num) WHERE leido_en IS NULL
solicitud_acceso
               num, organizacion_num (CASCADE), area_num (opcional, SET NULL), nombre,
               primer_apellido, segundo_apellido (def. ''), correo, estado (def. PENDIENTE),
               ip, fecha_solicitud (def. now()), atendida_por (opcional), fecha_atencion,
               usuario_creado (opcional)
               estado en PENDIENTE, APROBADA, RECHAZADA (choices de Django, sin CHECK en la base)
formato_reporte
               num, organizacion_num (opcional; NULL = plantilla del sistema), nombre (≤ 80),
               plantilla (vacío o EJECUTIVO, CUMPLIMIENTO, OPERATIVO, INCIDENTES),
               predeterminado (def. FALSE), activo (def. TRUE), creado_por (opcional),
               fecha_creacion
               CHECK (plantilla = '') = (organizacion_num IS NOT NULL)
               UNIQUE PARCIAL (organizacion_num) WHERE predeterminado AND activo
               UNIQUE PARCIAL (organizacion_num, nombre) WHERE activo
version_formato
               num, formato_num (PROTECT), numero (≥ 1), conf JSONB, creada_por (opcional),
               fecha
               UNIQUE (formato_num, numero)
tablero_analitica
               num, organizacion_num (opcional; NULL = plantilla del sistema), nombre (≤ 80),
               descripcion (≤ 200, def. ''), plantilla (vacío o EJECUTIVO, AMBIENTAL, ALERTAS,
               OPERACION), predeterminado (def. FALSE), activo (def. TRUE), creado_por (opcional),
               fecha_creacion
               CHECK (plantilla = '') = (organizacion_num IS NOT NULL)
               UNIQUE PARCIAL (organizacion_num) WHERE predeterminado AND activo
               UNIQUE PARCIAL (organizacion_num, nombre) WHERE activo
version_tablero
               num, tablero_num (PROTECT), numero (≥ 1), conf JSONB, creada_por (opcional),
               fecha
               UNIQUE (tablero_num, numero)
programacion_reporte
               num, organizacion_num, area_num (opcional), areas (INTEGER[], vacío = toda la
               organización; varias áreas dejan area_num nula), creada_por, formato_num
               (opcional), frecuencia, hora (def. 08:00), dia_semana (0–6, semanal),
               dia_mes (1–28, mensual), destinatarios (INTEGER[]), activa (def. TRUE),
               proxima_ejecucion, ultima_ejecucion, fecha_creacion
               CHECK frecuencia en DIARIA, SEMANAL, MENSUAL; CHECK cardinality(destinatarios) > 0;
               CHECK hora en punto o y media; CHECK día de semana 0–6; CHECK día del mes 1–28;
               semanal exige dia_semana y mensual exige dia_mes
               ÍNDICE (activa, proxima_ejecucion)
reporte        num, organizacion_num, area_num (opcional), areas (INTEGER[], vacío = toda la
               organización; varias áreas dejan area_num nula), generado_por (opcional),
               formato_version_num (opcional, PROTECT: versión con la que se generó),
               origen, periodo_inicio, periodo_fin, estado (def. LISTO), error, archivado
               (def. FALSE), destinatarios (INTEGER[], los del programado), asunto, cifras
               JSONB, contenido, archivo_pdf, fecha_generacion
               CHECK origen en MANUAL, PROGRAMADO, AGENTE; CHECK periodo_inicio < periodo_fin;
               CHECK estado en GENERANDO, LISTO, ENVIADO, FALLO
envio_reporte  num, reporte_num (CASCADE), fecha (def. now()), origen (MANUAL, PROGRAMADO,
               NICO), enviado_por (opcional, SET NULL), destinatarios JSONB ([{num, nombre}]
               congelados al enviar), resultado (OK, FALLO), error
               ÍNDICE (reporte_num, fecha DESC); la API muestra los 10 más recientes
respuesta_aprendida
               num, organizacion_num (CASCADE), pregunta, pregunta_normalizada, tema, plantilla,
               votos_si (def. 1), votos_no (def. 0), activa, fecha_creacion
pregunta_agente
               num (bigint), usuario_num (CASCADE), dispositivo_num (CASCADE; en alcance de área
               u organización, el puente del área o el primer dispositivo visible), pregunta,
               pregunta_normalizada, tema, via (PREDEFINIDA, BANCO, IA, ENRUTADA, REPETIDA,
               NO_ENTENDIDA), respuesta, datos JSONB (p. ej. {alcance, area}), aprendida y
               ensenada (opcionales, SET NULL → respuesta_aprendida), fecha_ensenada,
               calificacion (1, −1 o NULL), milisegundos, tokens_entrada, tokens_salida, fecha
segundo_factor num, usuario_num (único), secreto (cifrado), activo (def. FALSE), ultimo_paso
               (el último código TOTP usado no vale otra vez), codigos_recuperacion JSONB
               (SHA-256 de los pendientes), fecha_activacion, fecha_registro
registro_auditoria
               num (bigint), fecha_hora, usuario_num (opcional, SET NULL), usuario_correo,
               organizacion_num (opcional, SET NULL), accion, recurso, recurso_num,
               descripcion, cambios JSONB (antes y después; secretos ocultos), ip (INET)
               CHECK accion en CREAR, MODIFICAR, ELIMINAR, LOGIN, LOGIN_FALLIDO, LOGOUT,
               RECUPERAR, SEGUNDO_FACTOR, INTEGRACION, EXPORTAR
               ÍNDICES (organizacion_num, fecha_hora DESC) y (usuario_num, fecha_hora DESC)
token_api      num, organizacion_num, nombre, prefijo (único), clave_hash (SHA-256),
               creado_por (opcional), fecha_creacion, fecha_expiracion, ultimo_uso, activo
webhook        num, organizacion_num, nombre, url, secreto (cifrado), eventos JSONB, activo,
               creado_por (opcional), fecha_creacion, ultimo_envio, ultimo_estado,
               fallos_consecutivos (≥ 0)
               CHECK url empieza con https://
sesion         num (bigint), usuario_num (CASCADE), clave_hash (SHA-256, único), cliente
               (web, app o vacío en las anteriores a la actualización), agente (navegador o
               app resumido), ip (INET), creada, ultimo_uso. Una por inicio de sesión
               ÍNDICE (usuario_num)
politica_seguridad
               num (una sola fila), dias_sesion (1–90), intentos_login_por_minuto (3–60),
               roles_2fa_obligatorio JSONB, dias_auditoria (30–3650), ota_todos,
               actualizado, actualizado_por (opcional, SET NULL)
alerta_seguridad
               num, tipo (ip_fallidos, cuenta_fallidos, ip_nueva, cuenta_bloqueada), nivel
               (critico, advertencia), estado (nueva, revisada, descartada; def. nueva), clave
               (el caso: p. ej. ip_fallidos:<ip>), titulo, detalle, usuario_num (opcional, SET
               NULL), usuario_correo, ip (INET), eventos, creada (def. now()), ultimo_evento,
               revisada_por_num (opcional, SET NULL), fecha_revision, nota
               ÚNICO PARCIAL (clave) WHERE estado = 'nueva'; ÍNDICE (estado, ultimo_evento DESC)
notificacion_seguridad
               num, alerta_seguridad_num (CASCADE), usuario_num (CASCADE), nivel, fecha
               (def. now()), leida, correo_enviado (NULL si no se mandó correo)
               ÍNDICE (usuario_num, fecha DESC)
preferencia_avisos_seguridad
               usuario_num (PK, CASCADE), niveles_consola JSONB (def. ambos), niveles_correo
               JSONB (def. critico), actualizado

Consola de Nico AI (apps.nico)
notificacion_nico
               num (bigint), usuario_num (CASCADE), tipo (NO_ENTENDIDA, NEGATIVA, PUENTE, CARGA,
               APRENDIDA), nivel (INFO, OK, ADVERTENCIA, PELIGRO; def. INFO), titulo, texto,
               enlace, leida, correo_enviado, fecha
preferencia_avisos_nico
               usuario_num (PK, CASCADE), tipos JSONB ({TIPO: {consola, correo}}), actualizado
marca_aviso_nico
               clave (PK), valor, fecha (evita repetir el mismo aviso)
ajuste_herramienta
               nombre (PK), descripcion, proposito, ejemplo, activa, actualizado,
               actualizado_por (opcional, SET NULL)
ajuste_sugerencias
               num (una sola fila, def. 1), activas, maximo (def. 6), usar_banco,
               usar_incluidas, usar_herramientas, usar_frecuentes, fijadas JSONB, ocultas JSONB,
               actualizado, actualizado_por (opcional, SET NULL)
documento_nico num, clave (única), descripcion, contenido, activo (def. FALSE), orden,
               actualizado, actualizado_por (opcional, SET NULL)
```

Además existe `dispositivo (area_num)` como índice propio y las tablas internas de
Django (migraciones, tipos de contenido, permisos, sesiones, registro del panel de
administración y la de tokens de DRF, que ya no se usa: la migración
`usuarios.0005_tokens_a_sesiones` pasó sus tokens a `sesion`).

## Tabla de nucleo_iot

```text
lectura        num (bigint, GENERATED ALWAYS), fecha_hora (cuándo midió), sensor_num,
               variable_codigo, valor NUMERIC(8,2), recibida_en (cuándo llegó, def. now()),
               estabilizada (def. TRUE)
               PK (num, fecha_hora); hypertable por fecha_hora con bloques de 1 día
               CHECK variable_codigo en TEMP, HUM, AIRE
               CHECK valor dentro del rango físico de la variable
               ÍNDICE (sensor_num, variable_codigo, fecha_hora DESC)
```

`estabilizada` es falso para las lecturas de aire durante los 20 minutos de
calentamiento del CCS811: no generan alertas ni entran en los reportes.

## Qué garantiza la base de datos

- Un sensor pertenece a un dispositivo de un área de una organización; solo el
  administrador de plataforma no tiene organización.
- Cada umbral tiene sus cuatro límites en orden; hay un solo umbral por variable y
  dispositivo.
- Una alerta siempre tiene umbral, nivel y la copia de su lectura; no se repite una
  alerta pendiente del mismo umbral y nivel, pero una advertencia que escala a peligro
  genera otra.
- Una notificación push siempre apunta a un teléfono registrado; el correo no.
- Una alerta y sus notificaciones se registran juntas en una transacción de `nucleo_db`.
- Una lectura tiene variable conocida y valor en el rango físico.
- Un tablero de la organización tiene a lo sumo un predeterminado activo y no repite
  nombre entre sus tableros activos; las plantillas del sistema no tienen organización.
- `lectura.fecha_hora`, `lectura.recibida_en` y `notificacion.fecha_envio` permiten
  comprobar el límite de 2 minutos entre la medición y el aviso.

## Diferencias de implementación con los scripts SQL

- Django crea las columnas autoincrementales como `GENERATED BY DEFAULT AS IDENTITY`
  y añade índices automáticos en las llaves foráneas y en las llaves de texto. Las
  columnas, tipos, nulos, unicidades y `CHECK` son las mismas.
- Django no crea `ON DELETE CASCADE` ni `ON DELETE SET NULL` en la base (los aplica
  desde el código al borrar con el ORM); los scripts SQL sí los declaran en
  `telefono_push` y en `notificacion.telefono_push_num`.
- La migración de `lectura` convierte `num` en `GENERATED ALWAYS` y ajusta la llave
  compuesta con SQL, porque el modelo de Django declara `num` como llave simple.

## Usuarios de las bases

`nucleo_app` y `nucleo_iot` son los usuarios que crean los contenedores de PostgreSQL y
de TimescaleDB y por eso tienen privilegios de superusuario dentro de ellos. Son los
que usa el backend también en producción: cada base corre en su propio contenedor y ningún
usuario tiene acceso a la otra.
