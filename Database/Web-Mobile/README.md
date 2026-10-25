# Base de datos web y móvil — scripts locales

> **En simple:** esta carpeta tiene el modelo relacional de la aplicación web y móvil
> escrito en SQL para practicar en una base aparte (`nucleo_test`) sin tocar la base
> real del backend. La base real (`nucleo_db`) la crean las migraciones de Django.

Guarda organizaciones, usuarios, dispositivos, umbrales, alertas, notificaciones y
reportes. Las lecturas de los sensores no están aquí: viven en TimescaleDB
([`Database/IoT`](../IoT/README.md)).

## Archivos

```text
Database/Web-Mobile/
├── init.sql         Crea la base local nucleo_test
├── tables.sql       Las 16 tablas del modelo, con llaves, restricciones e índices
├── seed.sql         Códigos de los catálogos y datos de práctica
├── queries.sql      Alertas, límite de 2 minutos, destinatarios, estado de dispositivos y reportes
├── procedures.sql   Vacío: aquí van los procedimientos
├── triggers.sql     Vacío: aquí van los triggers
├── drop.sql         Elimina nucleo_test
└── README.md        Este documento
```

`nucleo_test` es solo para pruebas. No toca `nucleo_db` ni `nucleo_iot`. Las tablas de
`tables.sql` equivalen a las que crea Django; la única diferencia es que Django no crea
las reglas `ON DELETE CASCADE` ni `ON DELETE SET NULL` en la base, y el script sí
(`telefono_push` y `notificacion.telefono_push_num`).

Las 16 tablas son cinco catálogos (`rol`, `estado_usuario`, `estado_dispositivo`,
`estado_sensor`, `variable_ambiental`), `organizacion`, `area`, `usuario`,
`telefono_push`, `dispositivo`, `sensor`, `umbral`, `alerta`, `notificacion`,
`programacion_reporte` y `reporte`.

`seed.sql` incluye una organización, un área, cinco usuarios (uno por rol, sin contraseña
utilizable), dos teléfonos push, el dispositivo `NUC-001` con sus sensores DHT22 y
CCS811, tres umbrales, dos alertas con sus notificaciones, una programación y un
reporte. Las alertas apuntan a las lecturas 1 y 2 que carga `Database/IoT/seed.sql`;
como las bases no tienen llaves entre sí, cada alerta guarda también el valor y la fecha
de su lectura.

## Antes de empezar

- `docker compose up -d --wait postgres` — "enciende PostgreSQL y espera; termina con el contenedor saludable."
- `docker compose ps` — "muestra el estado; debe decir `running` o `healthy`."

## Ejecutar cada archivo

Todos los comandos se ejecutan desde la carpeta principal del proyecto y en este
orden la primera vez:

- `docker exec -i nucleo_postgres psql -U nucleo_app -d postgres -v ON_ERROR_STOP=1 < Database/Web-Mobile/init.sql` — "crea `nucleo_test`; no toca `nucleo_db`."
- `docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/tables.sql` — "crea las 16 tablas."
- `docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/seed.sql` — "carga catálogos y datos de práctica."
- `docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/queries.sql` — "ejecuta las consultas y muestra sus resultados."
- `docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/procedures.sql` — "ejecuta el archivo de procedimientos; ahora está vacío."
- `docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/triggers.sql` — "ejecuta el archivo de triggers; ahora está vacío."
- `docker exec -it nucleo_postgres psql -U nucleo_app -d nucleo_test` — "abre una consola en `nucleo_test`; se sale con `\q`."
- `docker exec -i nucleo_postgres psql -U nucleo_app -d postgres -v ON_ERROR_STOP=1 < Database/Web-Mobile/drop.sql` — "elimina solo `nucleo_test`."

`init.sql` borra y recrea `nucleo_test`, así que basta volver a ejecutar desde el
principio para empezar de cero.

## Para profundizar

La explicación técnica completa está en [`Context/`](../../Context/README.md),
pensada para el equipo y para asistentes de IA.

- [Modelo relacional](../../Context/base-de-datos/modelo-relacional.md)
- [PostgreSQL con Docker](../../Context/base-de-datos/postgresql-docker.md)
- [Guía de desarrollo local](../../Context/instalacion/guia-desarrollo-local.md)
