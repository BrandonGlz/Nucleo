# Changelog

Cambios importantes de Núcleo, medidos contra la [especificación de requisitos](Docs/PDFs/SRS.pdf).
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones siguen
[Versionado Semántico](https://semver.org/lang/es/).

## Plan de versiones

| Cambio | Cuándo se usa | Ejemplo |
| --- | --- | --- |
| **MAYOR** (`1.0.0`) | El producto cumple el SRS completo o cambia de forma incompatible | Primera versión estable |
| **MENOR** (`0.9.0`) | Se entrega un hito que hace avanzar el SRS o una función nueva | Nuevo canal de avisos |
| **PARCHE** (`0.9.1`) | Se corrige un error sin agregar funciones | Ajuste de una alerta |

- `dev` concentra el trabajo y `main` es lo que corre en producción.
- Las versiones `0.1.0` a `0.9.0` se asignaron al ordenar el historial de commits y despliegues.
- El porcentaje indica los criterios del SRS cumplidos al cerrar cada versión; el detalle está en el
  [README](README.md#avance-contra-el-srs).

### Versiones por componente

Cada componente conserva su propio número porque se publica por separado.

| Componente | Versión actual |
| --- | --- |
| Proyecto | 0.9.0 |
| App Android | 0.2.6 (código 18) |
| Firmware del ESP32 | 1.1.4 |
| Web | 0.1.0 |
| API | 0.1.0 |

### Para llegar a 1.0.0

- Confirmar en la placa el LED RGB, el LED de Wi-Fi y el zumbador.
- Conectar y probar la batería para que el equipo sea portátil.
- Terminar la carcasa impresa en 3D.
- Probar la microSD con una tarjeta real y confirmar en la placa la actualización remota.
- Completar la primera prueba de restauración de respaldos.
- Registrar el acondicionamiento de 48 horas de cada CCS811.
- Completar la prueba de 100 horas continuas y medir la disponibilidad del 99 %.
- Probar la web en Chrome, Edge, Firefox y Safari.

## [0.9.0] - 2026-11-18 · SRS 82 %

### Agregado

- Solicitud de acceso desde el inicio de sesión: el administrador la aprueba desde el enlace del correo y Nico
  envía la bienvenida con una contraseña temporal que se cambia al entrar.
- Landing pública en `info.bynucleo.com` con planes, dispositivo interactivo y Nico como guía.
- Respaldo de lecturas sin conexión en microSD, pendiente de probar con una tarjeta real.

### Cambiado

- Los avisos de alerta llegan a los supervisores del área, los administradores y el operador asignado.
- El SRS pasa a la revisión 2, alineada con el sistema real y pendiente de validación por las partes; la revisión
  anterior se conserva en `Docs/PDFs/SRS-rev1.pdf`. El avance de todas las versiones se recalculó con sus criterios.
- El SRS define los proveedores: Ollama como IA local, Gmail para el correo y Firebase Cloud Messaging para las
  notificaciones push.
- El SRS define el intervalo de muestreo como programable según las necesidades de cada área, de 5 a 120 segundos.
- Los dispositivos nuevos miden cada 60 segundos por defecto; los ya registrados conservan su intervalo.
- Los correos de Núcleo usan la paleta oficial y los íconos de la web, llegan firmados por Nico y con un asunto
  más claro.

### Corregido

- El CCS811 físico vuelve a reportar la calidad del aire a la plataforma.

## [0.8.0] - 2026-11-16 · SRS 80 %

### Agregado

- ESP32-S3 físico midiendo temperatura y humedad en producción.
- Consola de administración con seguridad, accesos, equipos y auditoría.
- Vigía externo que revisa los servicios cada 15 minutos.
- Modo claro y oscuro en la app y estado de los sensores en la plataforma.

## [0.7.0] - 2026-11-15 · SRS 67 %

### Agregado

- Respaldos cifrados con prueba mensual de restauración.
- Firewall, auditoría y avisos de fallas.
- Actualización remota del firmware, pendiente de confirmar en la placa.
- MQTT dentro de WebSocket para los ESP32.

## [0.6.0] - 2026-11-11 · SRS 64 %

### Agregado

- Producción en `bynucleo.com` con HTTPS mediante Cloudflare Tunnel.
- El dispositivo como llave de Nico AI.
- Opción «Reducir animaciones» en la app.

## [0.5.0] - 2026-11-10 · SRS 62 %

### Agregado

- Notificaciones push con la app cerrada y avisos con sonido.
- Selector de dispositivos en la app para supervisores.

## [0.4.0] - 2026-11-09 · SRS 57 %

### Agregado

- Primer despliegue en el servidor y publicación del APK para Android.

## [0.3.0] - 2026-11-08 · SRS 54 %

### Agregado

- Web y app conectadas a la API con canal en vivo.
- Agente de IA, reportes y simulador de dispositivos.

## [0.2.0] - 2026-11-04 · SRS 26 %

### Agregado

- Interfaces web y móvil con datos simulados.

## [0.1.0] - 2026-10-24 · SRS 25 %

### Agregado

- API con roles por organización, modelo de datos, broker MQTT y firmware base.
