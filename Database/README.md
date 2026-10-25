# Base de datos — Núcleo

> **En simple:** el sistema usa dos bases de datos. Una guarda las organizaciones, los
> usuarios y las alertas; la otra, de series de tiempo, guarda las lecturas de los sensores.

```text
Database/
├── Web-Mobile/   PostgreSQL 17 (nucleo_db): 16 tablas de la aplicación web y móvil
├── IoT/          TimescaleDB 2.31 (nucleo_iot): la hypertable lectura
├── crear-roles.sh  Usuarios de base de datos sin superusuario, para producción
└── README.md     Este documento
```

- **`Web-Mobile/`:** catálogos, organizaciones, áreas, usuarios, teléfonos push,
  dispositivos, sensores, umbrales, alertas, notificaciones, programaciones y reportes.
  Ver [su README](Web-Mobile/README.md).
- **`IoT/`:** las lecturas de temperatura, humedad y calidad del aire, que crecen sin
  parar y se consultan por fecha. Ver [su README](IoT/README.md).

Las dos bases corren en Docker (`nucleo_postgres` y `nucleo_timescaledb`) y no tienen
llaves foráneas entre sí: la alerta copia el valor y la fecha de la lectura que la
disparó, y el backend junta ambas bases al consultar. Cada carpeta tiene scripts `.sql`
para practicar en una base aparte (`nucleo_test` y `nucleo_iot_test`); las bases reales las
crean las migraciones de Django (`migrate` y `migrate --database=iot`).

Esta carpeta no guarda datos ni archivos `.db`.

## Usuarios sin superusuario

`crear-roles.sh` crea `nucleo_backend` y `nucleo_backend_iot`: roles sin superusuario, sin
permiso para crear bases ni roles, dueños de su propia base y sin acceso a la otra. Es lo
que debe usar el backend fuera de desarrollo.

- `bash Database/crear-roles.sh` — "crea (o actualiza) los dos roles; lee del `.env` raíz `BACKEND_DB_PASSWORD` y `BACKEND_IOT_DB_PASSWORD`."

Las pruebas de Django siguen usando el superusuario del contenedor, porque crean bases
temporales. Detalle en [PostgreSQL y TimescaleDB con Docker](../Context/base-de-datos/postgresql-docker.md).
