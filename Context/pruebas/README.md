# Pruebas

## Cobertura actual

- Backend: pruebas de `SimpleTestCase` para el endpoint de salud y pruebas con
  bases de datos (`test_nucleo_db` y `test_nucleo_iot`, temporales) para las
  restricciones de ambos modelos y la hypertable, el aislamiento por organización, los
  permisos por rol, el administrador de plataforma, los teléfonos push, la ingesta de
  lecturas con alertas de advertencia y peligro y calentamiento del CCS811, la caducidad
  del token, el canal en vivo (conexión, rechazo, filtro por rol y eventos), el push con
  Expo (con la API simulada) y los reportes con PDF, series y programaciones (134 pruebas).
- Análisis estático: Ruff en backend y Oxlint en web y móvil.
- Compilación: `npm run build` para la web y `expo export` para móvil.
- IoT: MicroPython no se compila; `mpremote devs` confirma que la placa está
  conectada. La lógica del firmware (umbrales, calentamiento, baseline del CCS811, cola
  de lecturas sin conexión y forma del mensaje) tiene 16 pruebas en `IoT/tests/` que se
  ejecutan en una computadora con módulos simulados; el resto se prueba en el ESP32 real.
- Integración con el broker real: se comprobó a mano que un dispositivo publica por TLS
  con su usuario, que la ACL le impide publicar en otro tópico, y que la lectura llega al
  consumidor, genera la alerta y se emite el evento por Redis hasta un WebSocket abierto.
- Infraestructura: validación de Compose, healthcheck de PostgreSQL y
  TimescaleDB, bases y extensiones, y persistencia de los volúmenes.

## Comandos

```bash
cd BackEnd
.venv/bin/python manage.py check
.venv/bin/python manage.py test
.venv/bin/ruff check .
cd ../FrontEnd
npm run lint
npm run build
cd ../Mobile
npm run lint
npm run export:android
cd ..
IoT/.venv/bin/mpremote devs
IoT/.venv/bin/python -m unittest discover -s IoT/tests -t IoT
docker compose config --quiet
```

## Pendiente

- Pruebas de componentes y de integración de la web y la app móvil.
- Pruebas de la conexión real con el broker en un entorno automatizado; hoy se
  comprueba a mano con `Mosquitto/preparar.sh` y `escuchar_mqtt`.
- Pruebas del firmware en hardware real (pines, TLS, batería) y calibración del CCS811.
- Envío de push con un teléfono real y prueba del canal en vivo desde un cliente web o móvil.

Los reportes formales de ejecuciones reales se reservarán para
`Docs/reportes/`. La verificación inicial actual está en
[`reportes/verificacion-inicial.md`](../reportes/verificacion-inicial.md).
