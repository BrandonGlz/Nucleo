# Contexto de Núcleo

Esta carpeta reúne el conocimiento técnico estable del proyecto: arquitectura,
instalación, estructura de cada componente, operación y decisiones. Aquí se
documentan los detalles completos, sin simplificar y sin omitir información, para
que el equipo y los asistentes de IA puedan consultarla como fuente de verdad.

`Context/` no es la carpeta de reportes formales. La carpeta `Docs/` contiene el
SRS, el modelo relacional, el informe de avance (`informe-2026-10-24-nucleo.pdf`) y los documentos de planificación y análisis, y recibe
los reportes de avance, informes de seguridad, evidencias y entregables. La verificación inicial se conserva aquí como
línea base histórica del entorno.

```text
Context/
├── arquitectura/            Vista general, componentes y flujos
├── instalacion/             Preparación del entorno y solución de problemas
├── seguridad/               Secretos, red, permisos, broker y firmas de Nico AI
├── backend/                 Diseño y estructura de Django/DRF
├── frontend/                Diseño y estructura de la web React/Vite
├── mobile/                  Diseño y estructura de la app Expo/React Native
├── api/                     Contrato compartido entre web y móvil
├── iot/                     MicroPython, hardware, conexiones del ESP32 y comunicación MQTT
├── agente/                  Nico AI: recorrido de una pregunta, firmas y latido
├── servidor/                Producción: Cloudflare, Caddy, servicios, dos equipos, respaldos
├── base-de-datos/           PostgreSQL, TimescaleDB, modelo relacional y esquema local
├── mqtt/                    Broker Mosquitto, tópicos, mensajes y permisos
├── reportes/                Verificación inicial y evidencia técnica de la preparación
├── pruebas/                 Estrategia y documentación de pruebas
├── decisiones-tecnicas/     Decisiones de arquitectura y stack
├── equipo/                  Ramas y commits
└── README.md                Este documento
```

Los documentos de `reportes/` describen ejecuciones reales, con fecha y comandos.
No se deben incluir resultados inventados. Los reportes formales posteriores se
crearán en `Docs/`, no aquí.

## Documentos técnicos

- [Arquitectura general](arquitectura/arquitectura-general.md)
- [Guía de desarrollo local](instalacion/guia-desarrollo-local.md)
- [Estructura del backend](backend/estructura-backend.md) · [avisos de la campana](backend/estructura-backend.md#avisos-de-la-campana)
- [Estructura del frontend web](frontend/estructura-frontend.md) ·
  [pantallas de monitoreo](frontend/estructura-frontend.md#pantallas-de-monitoreo) (panel solo con gráficas, histórico sin gráfica, nota obligatoria en alertas) ·
  [campana](frontend/estructura-frontend.md#campana-y-notificaciones) ·
  [foto de perfil](frontend/estructura-frontend.md#foto-de-perfil) ·
  [sistema fluido de estilos](frontend/estructura-frontend.md#sistema-fluido-de-estilos) ·
  [consolas](frontend/estructura-frontend.md#consolas-por-dominio)
- [Estructura de la app móvil](mobile/estructura-mobile.md) ·
  [acceso con Nico y solicitud de cuenta](mobile/estructura-mobile.md#acceso-y-solicitud-de-cuenta)
- [Contrato de la API](api/contrato-api.md) ·
  [solicitud de acceso](api/contrato-api.md#solicitud-de-acceso)
- [Firmware y hardware](iot/firmware-y-hardware.md)
- [Conexiones del ESP32](iot/conexiones.md)
- [Nico AI](agente/nico-ai.md) · [modo de pruebas sin ESP](agente/nico-ai.md#quién-necesita-el-esp-encendido)
- [Herramientas de Nico AI](backend/herramientas-agente.md)
- [Servidor de producción](servidor/produccion.md) ·
  [operación en dos equipos y horarios](servidor/produccion.md#operación-en-dos-equipos)
- [Operación del servidor](../deploy/README.md): despliegue, build del APK, respaldos, descanso
  diario, vigilancia, instalación desde cero; copias de referencia de los scripts del equipo de
  compilación en [`deploy/dos-equipos/`](../deploy/dos-equipos/) y del descanso en
  [`deploy/descanso-servidor/`](../deploy/descanso-servidor/)
- [Seguridad](seguridad/seguridad.md)
- [Pruebas](pruebas/README.md)
- [Flujo de trabajo con Git](equipo/flujo-de-trabajo.md)
- [Modelo relacional](base-de-datos/modelo-relacional.md)
- [PostgreSQL y TimescaleDB con Docker](base-de-datos/postgresql-docker.md)
- [Broker MQTT](mqtt/broker-mosquitto.md)
- [Decisiones tecnológicas](decisiones-tecnicas/stack-tecnologico.md)
- [Verificación inicial](reportes/verificacion-inicial.md)

## READMEs por stack

- [Backend](../BackEnd/README.md)
- [Web](../FrontEnd/README.md)
- [Mobile](../Mobile/README.md)
- [IoT](../IoT/README.md)
- [Landing](../Landing/README.md)
- [Servidor](../deploy/README.md)
- [Base de datos](../Database/README.md)
