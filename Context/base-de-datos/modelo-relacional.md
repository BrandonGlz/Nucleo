# Modelo relacional

Dos bases en Docker:

- **`nucleo_db`** (PostgreSQL 17): 16 tablas de negocio que crean las migraciones de
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
              └─ reporte

umbral ── alerta ── notificacion ─┬─ usuario
                                  └─ telefono_push (solo canal PUSH)

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
area           num, organizacion_num, nombre, descripcion
               UNIQUE (organizacion_num, nombre)
usuario        num, organizacion_num (opcional), area_num (opcional), rol_codigo,
               estado_usuario_codigo, nombre, primer_apellido, segundo_apellido,
               correo (único), telefono, password (hash), ultimo_acceso, fecha_registro
               CHECK (rol_codigo = 'ADMINPLAT') = (organizacion_num IS NULL)
               ÍNDICE (organizacion_num, area_num)
telefono_push  num, usuario_num, token_expo (único), plataforma, fecha_registro
               CHECK plataforma en ANDROID, IOS
dispositivo    num, area_num, estado_dispositivo_codigo, operador_num (opcional),
               registrado_por, nombre, codigo_mqtt (único), intervalo_muestreo_seg
               (def. 30), nivel_bateria, ultima_conexion, ultimo_arranque, fecha_alta
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
programacion_reporte
               num, organizacion_num, area_num (opcional), creada_por, frecuencia,
               destinatarios (INTEGER[]), activa (def. TRUE), proxima_ejecucion,
               ultima_ejecucion, fecha_creacion
               CHECK frecuencia en DIARIA, SEMANAL, MENSUAL; CHECK cardinality(destinatarios) > 0
               ÍNDICE (activa, proxima_ejecucion)
reporte        num, organizacion_num, area_num (opcional), generado_por (opcional),
               origen, periodo_inicio, periodo_fin, cifras JSONB, contenido, archivo_pdf,
               fecha_generacion
               CHECK origen en MANUAL, PROGRAMADO, AGENTE; CHECK periodo_inicio < periodo_fin
```

Además existe `dispositivo (area_num)` como índice propio y las tablas internas de
Django (migraciones, tipos de contenido, permisos, sesiones, registro del panel de
administración y tokens de la API).

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
de TimescaleDB y por eso tienen privilegios de superusuario dentro de ellos. Son
credenciales de desarrollo.
