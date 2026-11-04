# FrontEnd — Núcleo

> **En simple:** es la parte que se ve en el navegador. Muestra la pantalla, los
> botones y los mensajes. No guarda datos: se los pide al backend.

Está hecho con React y Vite, con el sistema de diseño de Núcleo (`src/design-system/`).
Tiene todas las pantallas del diseño (`Docs/Mockups/nucleo-web.html`) y funciona sin
backend con datos simulados. La app móvil es otro cliente y usa el mismo backend.
Ambos hablan solo con la API REST; el navegador no se conecta al broker MQTT.

## Qué hace

- **Acceso:** inicio de sesión a pantalla completa. Sin sesión, cualquier ruta lleva
  a `/acceso`.
- **Monitoreo:** Panel con lecturas en vivo, Dispositivos, Detalle de dispositivo,
  Histórico y Alertas (atender o descartar con nota).
- **Análisis:** Reportes (vista previa y generación) y Agente IA.
- **Configuración:** Umbrales, Usuarios (ADMIN y SUPER) y Organización (ADMIN).
- **Cuenta:** Mi perfil y Notificaciones, a las que se llega desde el avatar y la
  campana del encabezado.
- **Diagnóstico:** `/estado` comprueba si la API responde.
- **Tema:** claro, oscuro o el del sistema, desde el menú del avatar o Mi perfil.

## Cómo funciona

1. `App.jsx` crea una ruta por cada módulo de `src/features/index.js` dentro de
   `MainLayout`, que dibuja el menú lateral agrupado por secciones y filtrado por rol.
2. Cada pantalla se arma con `Pantalla`: el encabezado (con los menús de la campana y
   del avatar), la tarjeta oscura de cifras clave y su contenido, que llena la altura
   de la ventana. Solo las listas y tablas largas hacen scroll.
3. Las pantallas piden los datos a los servicios de `src/services/` (`dispositivos.js`,
   `alertas.js`…) con el hook `useDatos`, que expone el estado `cargando`, `listo`,
   `vacio` o `error`.
4. Cada servicio decide: con `VITE_USE_MOCKS=true` responde `src/services/mock/`, que
   imita cada endpoint con la forma exacta del contrato; si no, llama a la API con el
   token de la sesión. Las rutas salen siempre de `src/api/`.
5. `src/utils/convertir.js` traduce la forma del contrato a las props de los
   componentes (por ejemplo `SINCONEX` → `status="offline"`).

Datos simulados:

- Cualquier correo y contraseña inician sesión; `error@nucleo.mx` muestra el error de
  credenciales.
- El rol sale de `VITE_MOCK_ROL`: `SUPER` (por defecto), `ADMIN` o `ANALISTA`.
- Las lecturas varían ±0.1 cada 30 s para simular el «en vivo».
- `?estado=cargando`, `?estado=vacio`, `?estado=error` o `?estado=sinConexion` en la
  URL fuerzan ese estado para revisar el diseño; `?agente=caido` en `/agente` simula
  el servicio de IA caído.

Los íconos salen únicamente de [Lucide](https://lucide.dev/icons/), a través de
`<Icon name="bell" />` del sistema de diseño o con `import { Bell } from 'lucide-react'`.
El lint marca como error cualquier otra librería de íconos.

Para agregar un módulo: crear `src/features/<modulo>/<Modulo>Page.jsx` y una
línea en `src/features/index.js` con su `seccion`, `icono` y `roles`; la ruta y el
menú aparecen solos.

## Carpetas

```text
FrontEnd/
├── public/                     Archivos que se sirven tal cual
├── src/
│   ├── api/                    Rutas del backend como constantes, un archivo por módulo
│   ├── assets/logos/           Logos oficiales (logo e ícono, en verde y lima)
│   ├── components/             Pantalla, CifrasClave (tarjeta oscura), EstadoError y
│   │                           la tarjeta de salud de /estado
│   ├── context/                SesionContext (sesión y tema) y AvisosContext
│   │                           (alertas pendientes y notificaciones)
│   ├── design-system/          Componentes, estilos y fuentes de Núcleo
│   ├── features/               Un módulo por carpeta; index.js es el registro
│   ├── hooks/                  useDatos, useMonitoreo y useHealthCheck
│   ├── layouts/                MainLayout (menú lateral) y Encabezado (campana y avatar)
│   ├── pages/                  HomePage, el diagnóstico de /estado
│   ├── services/               Un servicio por dominio, config.js con la bandera de
│   │   │                       mocks y el token
│   │   ├── api/                Cliente HTTP (client.js) y salud
│   │   └── mock/               datos.js (datos de ejemplo) y handlers.js (endpoints simulados)
│   ├── styles/global.css       Marco de la app y piezas propias de las pantallas
│   ├── utils/                  convertir.js (contrato → componentes) y formato.js (fechas)
│   ├── App.jsx                 Rutas y protección por sesión y rol
│   └── main.jsx                Enciende la aplicación
├── index.html                  Página que abre el navegador
├── vite.config.js              Configuración de Vite
├── package.json                Comandos y programas necesarios
├── package-lock.json           Versiones exactas
├── .oxlintrc.json              Reglas de revisión
├── .env.example                Plantilla de configuración
├── README.md                   Este documento
├── node_modules/               Programas instalados, no se versiona
└── dist/                       Paquete final, no se versiona
```

## Comandos

Todos se ejecutan desde la carpeta principal del proyecto:

- `cp FrontEnd/.env.example FrontEnd/.env` — "crea la configuración local: API en `http://localhost:8000/api/v1` y datos simulados activos."
- `cd FrontEnd && npm ci` — "instala React, Vite y las herramientas; crea `node_modules/`."
- `cd FrontEnd && npm run dev` — "abre la web en `http://localhost:5173`; se detiene con `Ctrl+C`."
- `cd FrontEnd && npm run build` — "genera el paquete final en `dist/`; muestra `built in ...`."
- `cd FrontEnd && npm run lint` — "revisa errores; solo muestra el aviso esperado de `useWidth` en `nc-lib.js`."
- `cd FrontEnd && npm run preview` — "muestra el paquete final en `http://localhost:4173` después del build."

Abre `http://localhost:5173` y entra con cualquier correo y contraseña, por ejemplo
`yadira.salazar@grupoaltamira.mx` y `nucleo2026`. Si cambias el `.env`, reinicia
`npm run dev` para que Vite lo lea.

## Para profundizar

La explicación técnica completa está en [`Context/`](../Context/README.md),
pensada para el equipo y para asistentes de IA.

- [Contrato compartido de la API](../Context/api/contrato-api.md)
- [Estructura del frontend](../Context/frontend/estructura-frontend.md)
- [Guía de desarrollo local](../Context/instalacion/guia-desarrollo-local.md)
- [Decisiones tecnológicas](../Context/decisiones-tecnicas/stack-tecnologico.md)
