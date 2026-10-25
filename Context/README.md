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
├── backend/                 Diseño y estructura de Django/DRF
├── frontend/                Diseño y estructura de la web React/Vite
├── mobile/                  Diseño y estructura de la app Expo/React Native
├── api/                     Contrato compartido entre web y móvil
├── iot/                     MicroPython, hardware, bibliotecas y comunicación MQTT
├── base-de-datos/           PostgreSQL, TimescaleDB, modelo relacional y esquema local
├── mqtt/                    Broker Mosquitto, tópicos, mensajes y permisos
├── reportes/                Verificación inicial y evidencia técnica de la preparación
├── pruebas/                 Estrategia y documentación de pruebas
├── decisiones-tecnicas/     Decisiones de arquitectura y stack
└── README.md                Este documento
```

Los documentos de `reportes/` describen ejecuciones reales, con fecha y comandos.
No se deben incluir resultados inventados. Los reportes formales posteriores se
crearán en `Docs/`, no aquí.

## Documentos técnicos

- [Arquitectura general](arquitectura/arquitectura-general.md)
- [Guía de desarrollo local](instalacion/guia-desarrollo-local.md)
- [Estructura del backend](backend/estructura-backend.md)
- [Estructura del frontend web](frontend/estructura-frontend.md)
- [Estructura de la app móvil](mobile/estructura-mobile.md)
- [Contrato de la API](api/contrato-api.md)
- [Firmware y hardware](iot/firmware-y-hardware.md)
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
- [Base de datos](../Database/README.md)
