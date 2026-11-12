# Servidor de producción

Cómo está publicado Núcleo y qué corre en el servidor. Los comandos de operación, el acceso por
SSH y la instalación desde cero están en [`deploy/README.md`](../../deploy/README.md).

## Direcciones

| Dirección | Para qué |
| --- | --- |
| **https://bynucleo.com** | Web, API de la app (`/api/v1`), panel en vivo y admin |
| **https://app.bynucleo.com** | Descarga de la app Android |
| `dispositivos.bynucleo.com` | Solo para los ESP32: MQTT (dentro de WebSocket) y llave de Nico AI |

Todo llega por un Cloudflare Tunnel, sin abrir puertos en el router. Abrir `dispositivos.` en el
navegador lleva a `bynucleo.com`. Corre en un servidor propio: una
laptop ASUS X75A con Debian 13 sin escritorio (procesador Intel Core i5-3230M de 2 núcleos y 4 hilos a
2.6 GHz, 8 GB de RAM y disco duro mecánico HDD de 750 GB, 698 GB utilizables) que funciona como VPS casero.

## Cómo llega una visita

```mermaid
flowchart LR
    U["Navegador o app<br/>cualquier red"] -->|"HTTPS bynucleo.com<br/>app.bynucleo.com"| CF["Cloudflare Tunnel<br/>cloudflared"]
    CF --> C["Caddy :8081<br/>127.0.0.1"]
    C --> W["Web compilada<br/>FrontEnd/dist"]
    C --> ST["Archivos /static"]
    C --> APK["APK en app.bynucleo.com"]
    C -->|"/api, /ws, /admin"| D
    subgraph SY["Servicios de systemd"]
        direction TB
        D["nucleo-daphne<br/>Daphne :8001"]
        MQ["nucleo-mqtt"]
        SC["nucleo-sin-conexion"]
        RP["nucleo-reportes.timer<br/>cada 15 min"]
    end
    subgraph DK["Docker · solo 127.0.0.1"]
        direction TB
        M["Mosquitto<br/>WebSocket :9001"]
        subgraph BD["Bases de datos"]
            PG[("PostgreSQL")]
            TDB[("TimescaleDB")]
            R[("Redis")]
        end
    end
    E["ESP32"] -->|"MQTT en WebSocket<br/>wss://dispositivos.bynucleo.com/mqtt"| CF
    CF -->|"/mqtt"| M
    M -->|lecturas| MQ
    SY <==>|"consultas, lecturas,<br/>alertas y eventos"| BD
    classDef cliente fill:#1d4ed8,stroke:#93c5fd,color:#fff,stroke-width:2px
    classDef red fill:#6d28d9,stroke:#c4b5fd,color:#fff,stroke-width:2px
    classDef web fill:#15803d,stroke:#86efac,color:#fff,stroke-width:2px
    classDef backend fill:#c2410c,stroke:#fdba74,color:#fff,stroke-width:2px
    classDef datos fill:#a16207,stroke:#fde047,color:#fff,stroke-width:2px
    classDef iot fill:#0f766e,stroke:#5eead4,color:#fff,stroke-width:2px
    classDef externo fill:#a21caf,stroke:#f0abfc,color:#fff,stroke-width:2px
    classDef doc fill:#475569,stroke:#cbd5e1,color:#fff,stroke-width:2px
    class U cliente
    class CF,C red
    class W,ST,APK web
    class D,MQ,SC,RP backend
    class PG,TDB,R datos
    class M,E iot
    style SY fill:transparent,stroke:#fb923c,stroke-dasharray:5 5
    style DK fill:transparent,stroke:#64748b,stroke-dasharray:5 5
    style BD fill:transparent,stroke:#facc15,stroke-dasharray:3 3
```

## Piezas

- **Dominio:** `bynucleo.com` está en Cloudflare; el túnel `nucleo` (servicio `cloudflared`)
  lleva las visitas a Caddy sin abrir puertos en el router. `http://` y `www.` redirigen a
  `https://bynucleo.com`; `app.bynucleo.com` entrega el APK.
- **Subdominio de los ESP32:** Cloudflare solo deja pasar HTTPS, así que los ESP32 hablan MQTT
  dentro de WebSocket en `wss://dispositivos.bynucleo.com/mqtt`; el túnel lo lleva directo al
  listener WebSocket de Mosquitto (solo local). El ESP valida el certificado con las raíces de
  Let's Encrypt y Google que lleva el firmware. En ese subdominio solo quedan además el respaldo
  HTTPS de Nico y la hora (`/api/v1/puente/`, `/api/v1/health/`).
- **Web:** Vite la compila contra la API real y Caddy la sirve como archivos estáticos.
- **API y tiempo real:** Daphne atiende HTTP y WebSocket (`/ws/panel/`) como servicio
  `nucleo-daphne`; Redis reparte los eventos en vivo.
- **Lecturas:** `nucleo-mqtt` recibe las lecturas del broker Mosquitto y las guarda en
  TimescaleDB; `nucleo-sin-conexion` marca los dispositivos que dejan de reportar.
- **Reportes:** `nucleo-reportes.timer` genera cada 15 minutos los reportes programados, con el
  texto redactado por `IA_PROVEEDOR=local`.
- **Correo:** Gmail por SMTP con una contraseña de aplicación de la cuenta del proyecto.
- **Push:** `NUCLEO_PUSH_HABILITADO=true`; el backend envía a Expo, que entrega por Firebase
  (proyecto `nucleo-firebase`) a los teléfonos registrados al iniciar sesión en la app.
- **App:** `deploy/compilar_apk.sh` compila el APK en el mismo servidor y lo publica en
  `https://app.bynucleo.com`.
- **Respaldos:** `nucleo-respaldo.timer` respalda a diario las dos bases y la configuración del
  broker: 7 días en el servidor y 30 en Google Drive.
- **Disponibilidad:** todos los servicios arrancan con el equipo y se reinician solos; los
  contenedores tienen límite de memoria. El equipo no se suspende con la tapa
  cerrada ni por inactividad, usa el cable si está conectado y el Wi-Fi como respaldo.

## Actualizar

Después de subir cambios a `dev`: desde el servidor,
`bash deploy/desplegar.sh` (trae `dev`, migra, recompila y reinicia).

El acceso por SSH desde cualquier red, los comandos de operación y la instalación desde cero
están en [`deploy/README.md`](../../deploy/README.md).
