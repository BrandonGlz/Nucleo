# FrontEnd — Núcleo

> **En simple:** es la parte que se ve en el navegador. Muestra la pantalla, los
> botones y los mensajes. No guarda datos: se los pide al backend.

Está hecho con React y Vite. Es un esqueleto: cada módulo ya tiene su carpeta, su
ruta y su entrada en el menú, y muestra «Hola mundo, este es el módulo de…» hasta
que se implemente. La app móvil es otro cliente y usa el mismo backend. Ambos hablan
solo con la API REST; el navegador no se conecta al broker MQTT.

## Qué hace

- **Hoy:** menú de módulos con navegación (React Router), pantalla de inicio que
  comprueba si la API responde y una pantalla provisional por módulo: acceso,
  panel, dispositivos, mediciones, alertas, reportes, usuarios y organizaciones.
- **Después:** cada equipo reemplaza la pantalla provisional de su módulo con la
  funcionalidad real (inicio de sesión con el token de la API, panel, gráficas,
  alertas, umbrales, reportes y gestión, según el rol).
- **Todavía no:** no tiene sesión, datos de negocio ni conexión en vivo.

## Cómo funciona

1. El navegador carga la aplicación y `App.jsx` crea una ruta por cada módulo de
   `src/features/index.js`.
2. `MainLayout` dibuja el encabezado, el menú (también generado desde esa lista) y
   la zona donde aparece cada pantalla.
3. En el inicio, una función pregunta al backend si está funcionando y muestra el
   resultado en una tarjeta; si la API falla, la página sigue visible y permite
   reintentar.
4. Cada módulo muestra su pantalla provisional (`ModuloBase`).

Para agregar un módulo: crear `src/features/<modulo>/<Modulo>Page.jsx` y una
línea en `src/features/index.js`; la ruta y el menú aparecen solos.

## Carpetas

```text
FrontEnd/
├── public/                     Archivos que se sirven tal cual
├── src/
│   ├── assets/                 Imágenes y recursos
│   ├── components/             Piezas reutilizables (ModuloBase, tarjeta de salud)
│   ├── features/               Un módulo por carpeta: acceso, panel, dispositivos,
│   │                           mediciones, alertas, reportes, usuarios y
│   │                           organizaciones; index.js es el registro
│   ├── hooks/                  Lógica de React con estado
│   ├── layouts/                Marco visual y menú (MainLayout)
│   ├── pages/                  Pantallas completas
│   ├── services/               Comunicación con la API
│   ├── styles/                 Colores, tipografía y estilos
│   ├── utils/                  Funciones pequeñas sin React
│   ├── App.jsx                 Une las piezas principales
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

- `cp FrontEnd/.env.example FrontEnd/.env` — "crea la configuración local; apunta a `http://localhost:8000/api/v1`."
- `cd FrontEnd && npm ci` — "instala React, Vite y las herramientas; crea `node_modules/`."
- `cd FrontEnd && npm run dev` — "abre la web en `http://localhost:5173`; se detiene con `Ctrl+C`."
- `cd FrontEnd && npm run build` — "genera el paquete final en `dist/`; muestra `built in ...`."
- `cd FrontEnd && npm run lint` — "revisa errores; no muestra avisos si todo está bien."
- `cd FrontEnd && npm run preview` — "muestra el paquete final en `http://localhost:4173` después del build."

Abre `http://localhost:5173`. Debes ver la pantalla inicial con una tarjeta de
**API disponible** o **API no disponible** y un menú con los módulos; cada uno
muestra «Hola mundo, este es el módulo de…». Si el backend está apagado, la página
igual abre y ofrece reintentar.

## Para profundizar

La explicación técnica completa está en [`Context/`](../Context/README.md),
pensada para el equipo y para asistentes de IA.

- [Contrato compartido de la API](../Context/api/contrato-api.md)
- [Estructura del frontend](../Context/frontend/estructura-frontend.md)
- [Guía de desarrollo local](../Context/instalacion/guia-desarrollo-local.md)
- [Decisiones tecnológicas](../Context/decisiones-tecnicas/stack-tecnologico.md)
