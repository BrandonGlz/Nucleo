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
| App Android | 0.2.7 (código 19) |
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

## [Sin publicar]

### Agregado

- Reportes con contenido nuevo: cumplimiento contra los límites de advertencia, comparativo
  contra el periodo anterior, tabla por dispositivo, gestión de alertas, disponibilidad,
  incidentes principales y observaciones. Las cuatro plantillas incluyen estas tarjetas en una
  versión nueva y los reportes viejos muestran «Sin datos para este reporte».
- Anexo CSV de las lecturas de cada reporte, descargable y opcional adjunto al correo desde la
  configuración del formato (comprimido en ZIP si pasa de 5 MB).
- Reportes con alcance flexible (un área, varias áreas o toda la organización), periodo
  personalizado de hasta 31 días y un asistente de tres pasos con vista previa de las cifras
  reales sin llamar a la IA. «Uno por cada área» conserva el comportamiento anterior.
- Programaciones de reportes administrables desde la web: crear, editar, pausar, reanudar y
  «Enviar prueba ahora» (solo a quien la pide, sin mover las fechas). Se elige la hora, el día de
  la semana o del mes (1–28) y el formato. Solo ADMIN y SUPER las administran; ANALISTA las
  consulta, y ya no se eliminan.
- Formatos de reporte en el servidor, compartidos por la organización: cuatro plantillas
  (Ejecutivo, Cumplimiento, Operativo detallado e Incidentes), versiones al guardar,
  predeterminados de la organización y de cada área, duplicar, archivar y consultar versiones.
  La web y Nico AI crean y editan formatos por la API; las plantillas se duplican antes de
  tocarlas.
- El PDF de los reportes se genera en el servidor con la versión del formato del reporte y la
  web lo descarga directamente, igual que la app y los correos.
- Aviso para que ADMIN y SUPER suban a la organización los formatos que quedaron guardados en
  el navegador, o los descarten.
- Dictado por voz en los chats de Nico AI de la web y de la app (0.2.7): un micrófono junto al botón de enviar
  transcribe en español lo que se dice y, al terminar de hablar, el mensaje se envía solo; a lo dictado Nico
  siempre contesta en voz alta.
- Voz propia de Nico, masculina y amigable, generada en el servidor e igual en la web y en la app; se lee por
  fragmentos para que suene continua y, si el servidor no responde, se usa la voz del navegador o del teléfono.
- Opción «Leer respuestas» (bocina junto al micrófono) para que Nico lea en voz alta también las respuestas a
  mensajes escritos; la preferencia se recuerda.
- Voz de Nico más natural (Supertonic 2, masculina, local): lee bien cifras, unidades, siglas y fechas, y empieza
  a hablar antes (primer fragmento corto y modelo precargado). Dictado más rápido y con menos memoria en el
  servidor (Whisper sin MKL, precarga al tocar el micrófono, fin de frase en 1 s) y barra de avance mientras se
  transcribe. App 0.2.8.
- La voz de Nico lee por frases completas (sin cortar en comas, que daban entonación de final), dice «Nico» en lugar
  de «Nico ei ai» y no lee los signos de menú (›). App 0.2.9.

### Corregido

- El canal en vivo (panel, alertas y avisos de Nico) ya no se desconecta cada pocos segundos: redis-py 8 cortaba
  la lectura a los 5 s, justo lo que Channels espera un mensaje, y cada conexión caía con «Timeout reading».

### Eliminado

- Voz de Nico en la web: el chat ya no tiene micrófono, lectura en voz alta ni botón para callar a Nico; dictar y
  oír a Nico queda solo en la app móvil. Se quitan también el dictado de respaldo con Whisper del servidor, el
  permiso de micrófono y la reproducción de audio de la web; la voz del servidor queda para la app.

## [0.9.0] - 2026-11-18 · SRS 82 %

### Agregado

- Voz de Nico en la web: el mensaje dictado se envía solo al terminar de hablar, Nico contesta con su propia voz
  masculina (Piper, en el servidor) y se puede activar que lea también las respuestas a lo escrito. En Brave,
  Firefox y otros navegadores sin servicio de dictado, el audio se transcribe en el servidor con Whisper.
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
