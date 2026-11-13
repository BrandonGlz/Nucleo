# Nico AI

Agente de cada dispositivo que responde en lenguaje natural sobre sus lecturas, alertas,
sensores, umbrales y reportes. Es de solo lectura y las cifras siempre salen del backend; la IA
solo interpreta y redacta.

## Recorrido de una pregunta

```mermaid
flowchart LR
    subgraph CL["Clientes"]
        direction TB
        W["Chat de Nico AI<br/>Web React"]
        A["Chat de Nico AI<br/>App Expo"]
    end
    subgraph HOST["Servidor · laptop Debian"]
        direction TB
        CF["Cloudflare Tunnel<br/>bynucleo.com"]
        C["Caddy :8081"]
        D["Daphne :8001<br/>Django · DRF<br/>AgenteView"]
        R[("Redis<br/>retos y firmas")]
        MQ["nucleo-mqtt<br/>escuchar_mqtt"]
        M["Mosquitto<br/>WebSocket"]
        subgraph BD["Bases de datos"]
            PG[("PostgreSQL<br/>umbrales · alertas<br/>sensores · reportes")]
            TDB[("TimescaleDB<br/>lecturas")]
        end
        O["Ollama :11434<br/>qwen2.5:1.5b"]
    end
    E["ESP32 · Núcleo A-01<br/>NC-0501 · MicroPython<br/>llave de la IA"]

    W -->|"1 · POST /api/v1/agente/<br/>pregunta + token"| CF
    A -->|"1"| CF
    CF --> C -->|"/api"| D
    D <-->|"1 · consultas"| BD
    D -->|"2 · reto"| R
    R --> MQ --> M
    M <-->|"2 · puente/peticion<br/>3 · puente/autoriza (HMAC)<br/>latido cada 20 s"| CF
    CF <-->|"wss://dispositivos.bynucleo.com/mqtt"| E
    MQ -->|"3 · firma válida"| R
    D -->|"3 · solo con firma"| O
    D -->|"4 · respuesta JSON<br/>texto · gráfica · tabla"| W
    D -->|"4"| A
    classDef cliente fill:#1d4ed8,stroke:#93c5fd,color:#fff,stroke-width:2px
    classDef red fill:#6d28d9,stroke:#c4b5fd,color:#fff,stroke-width:2px
    classDef web fill:#15803d,stroke:#86efac,color:#fff,stroke-width:2px
    classDef backend fill:#c2410c,stroke:#fdba74,color:#fff,stroke-width:2px
    classDef datos fill:#a16207,stroke:#fde047,color:#fff,stroke-width:2px
    classDef iot fill:#0f766e,stroke:#5eead4,color:#fff,stroke-width:2px
    classDef externo fill:#a21caf,stroke:#f0abfc,color:#fff,stroke-width:2px
    class W web
    class A cliente
    class CF,C red
    class D,MQ backend
    class R,PG,TDB datos
    class E,M iot
    class O externo
    style CL fill:transparent,stroke:#64748b,stroke-dasharray:5 5
    style HOST fill:transparent,stroke:#fb923c,stroke-dasharray:5 5
    style BD fill:transparent,stroke:#facc15,stroke-dasharray:3 3
```

1. La web o la app envía la pregunta al backend, que consulta las cifras.
2. Si hace falta la IA, el backend manda un reto al ESP32 de **Núcleo A-01 (NC-0501)** por MQTT.
3. El ESP lo firma con su clave (HMAC-SHA256) y solo con esa firma el backend usa Ollama
   (`qwen2.5:1.5b`, en el mismo servidor).
4. El backend responde al chat.

El ESP manda un latido cada 20 s: sin latido en 75 s, o con su último mensaje al desconectarse,
Nico se desactiva. Solo A-01 usa la IA; los demás dispositivos son simulados y responden sin
ella. Si la firma no llega en 12 s o la IA tarda más de 20 s, el agente contesta solo con las
reglas.

Para validar cambios: `manage.py evaluar_agente --dispositivo NC-0501` corre el banco de casos
(`apps/reportes/casos_agente.py`) sin guardar nada. El detalle está en
[`backend/estructura-backend.md`](../backend/estructura-backend.md#agente-ia).

## Consola de Nico AI (nicoai.bynucleo.com)

Página solo web para el superusuario (rol administrador de plataforma), para atender al agente sin
cambiar código. Es la misma web compilada: `main.jsx` abre `src/consola/` cuando el host empieza con
`nicoai.` (en desarrollo, `http://nicoai.localhost:5173`). La API vive en `apps/nico`
(`/api/v1/nico/…`).

- **Chat**: el mismo Nico eligiendo empresa, área y dispositivo; responde como administrador de esa
  empresa (copia en memoria del superusuario, nunca se guarda) y el registro queda a su nombre.
- **Banco de respuestas**: respuestas *fijas* (tema `FIJA`: se devuelven tal cual y ganan a la charla
  y a las reglas), *rutas* (`RUTA`: responder como si hubieran hecho otra pregunta) y las aprendidas
  de los 👍. Se pueden crear para una empresa o para todas, editar, apagar y borrar.
- **Registro de preguntas**: lo que preguntan los usuarios, con filtros por empresa, vía y voto;
  «Enseñar» crea la respuesta correcta en el banco.
- **Herramientas y propósitos**: se editan la descripción, el propósito y el ejemplo de cada
  herramienta (modelo `AjusteHerramienta`; «Restaurar» vuelve al texto del código) y se pueden
  apagar: Nico contesta que esa consulta está desactivada.
- **Documentos**: SOUL, IDENTITY, AGENTS, USER, TOOLS, MEMORY y los que se agreguen (modelo
  `DocumentoNico`). Los activos se suman a las instrucciones de la IA local, hasta 2 400 caracteres
  entre todos; con documentos el contexto de Ollama sube de 1024 a 2048 (igual en todas las
  llamadas para no recargar el modelo). Las cifras siempre salen de las herramientas.

Los ajustes se guardan en caché 5 minutos y se limpian al editar.

## Relacionado

- [Herramientas de Nico AI](../backend/herramientas-agente.md): catálogo, acciones en dos pasos,
  personalidad, protección del servidor y pruebas.
- [Firmware y hardware](../iot/firmware-y-hardware.md#llave-de-nico-ai): la llave en el ESP32 y el
  modo puente.
- [Servidor de producción](../servidor/produccion.md) y la sección de Ollama en
  [`deploy/README.md`](../../deploy/README.md).
