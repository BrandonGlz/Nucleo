# Estructura del frontend

## Tecnologías

- React 19.3.1 y React DOM 19.3.1.
- React Router (`react-router-dom` 7) para la navegación entre módulos.
- Vite 8.3.5.
- `lucide-react` 1.59.0 (versión fija) como única fuente de íconos ([lucide.dev](https://lucide.dev/icons/)).
- JavaScript con JSX.
- npm 11.16.0; `package-lock.json` fija el árbol instalado.
- Oxlint para análisis estático.

La aplicación se creó con el scaffolding oficial de Vite y se adaptó a la
estructura de Núcleo. La interfaz usa el sistema de diseño propio de
`src/design-system/` (copiado de `Docs/Mockups/fuente/`), sin librerías de UI externas.
Los íconos se importan de `lucide-react`, directo o con `<Icon name="…" />`, y la regla
`no-restricted-imports` de `.oxlintrc.json` marca como error otras librerías de íconos
(react-icons, Heroicons, Font Awesome, MUI, Tabler, Phosphor, Feather, Radix, Iconify,
Ionicons, Ant Design). Es el cliente web; la app móvil vive en `Mobile/` y comparte el
contrato de `Context/api/contrato-api.md`.

## Organización

```text
FrontEnd/
├── public/favicon.svg
├── src/
│   ├── api/
│   │   ├── <modulo>.js   # rutas del backend como constantes, un archivo por módulo
│   │   └── index.js      # punto único de importación
│   ├── assets/logos/     # logos oficiales e index.js que los exporta
│   ├── components/
│   │   ├── Pantalla.jsx       # encabezado + tarjeta de cifras + contenido
│   │   ├── CifrasClave.jsx    # tarjeta oscura nc-ink de cada pantalla
│   │   ├── EstadoError.jsx    # tarjeta de error con reintento
│   │   └── HealthStatusCard.jsx
│   ├── context/
│   │   ├── SesionContext.jsx  # token, usuario, login, logout y tema
│   │   └── AvisosContext.jsx  # alertas pendientes y notificaciones (leídas en localStorage)
│   ├── design-system/
│   │   ├── componentes/  # 38 módulos ES (Button, Card, TrendChart…); index.js reexporta
│   │   ├── estilos/      # tokens de color, tipografía, espaciado y clases nc-*
│   │   └── fuentes/      # Plus Jakarta Sans 400–800
│   ├── features/
│   │   ├── index.js      # registro de módulos: ruta, título, página, sección, ícono y roles
│   │   └── <modulo>/     # acceso, panel, dispositivos (lista y detalle), mediciones,
│   │                     # alertas, reportes, agente, umbrales, usuarios, organizaciones,
│   │                     # perfil, notificaciones
│   ├── hooks/
│   │   ├── useDatos.js        # { estado, datos, error, reintentar, actualizar }
│   │   ├── useMonitoreo.js    # dispositivos + últimas lecturas + umbrales + alertas
│   │   └── useHealthCheck.js
│   ├── layouts/
│   │   ├── MainLayout.jsx     # menú lateral por secciones y filtrado por rol
│   │   └── Encabezado.jsx     # título, búsqueda, menú de la campana y del avatar
│   ├── pages/HomePage.jsx     # diagnóstico de la API en /estado
│   ├── services/
│   │   ├── api/               # client.js (fetch y errores) y health.js
│   │   ├── config.js          # USAR_MOCKS, token y pedir() con Authorization
│   │   ├── mock/              # datos.js y handlers.js
│   │   └── <dominio>.js       # auth, dispositivos, lecturas, alertas, umbrales,
│   │                          # reportes, usuarios, organizaciones, agente
│   ├── styles/global.css
│   ├── utils/                 # convertir.js, formato.js, formatDate.js
│   ├── App.jsx
│   └── main.jsx
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
└── vite.config.js
```

## Módulos y navegación

`src/features/index.js` exporta `modulos` (`ruta`, `titulo`, `Pagina`, `seccion`,
`icono`, `roles`) y `acceso`. `App.jsx` crea las rutas:

- `/acceso` va sin marco, a pantalla completa.
- `/` redirige a `/panel` si hay sesión y a `/acceso` si no.
- `/estado` muestra el diagnóstico de la API.
- El resto va dentro de `MainLayout` y exige sesión. Una ruta con `roles` devuelve al
  panel a quien no tiene el rol.

El menú lateral se agrupa en Monitoreo (Panel, Dispositivos, Histórico, Alertas),
Análisis (Reportes, Agente IA) y Configuración (Umbrales, Usuarios para ADMIN y SUPER,
Organización para ADMIN). `/dispositivos/:num`, `/perfil` y `/notificaciones` no
aparecen en el menú; las dos últimas se abren desde los menús del encabezado.

Cada pantalla ocupa la altura de la ventana: las tarjetas que llenan el resto llevan
`nc-grow` y solo las listas y tablas largas hacen scroll dentro de `nc-scroll`, con el
encabezado de la tabla fijo.

## Datos y servicios

Cada servicio exporta funciones `async` con nombres de negocio y decide con
`USAR_MOCKS`: devuelve `services/mock/handlers.js` o llama a `apiRequest` con las rutas
de `src/api/` y el encabezado `Authorization: Token <token>`. Los mocks responden con la
forma del contrato: listas paginadas `{ count, next, previous, results }`, campos del
modelo relacional, fechas ISO 8601, unidades del catálogo (`°C`, `%HR`, `ppm`), estados
`LINEA`… y roles `ADMIN`… Las pantallas convierten esa forma a las props de los
componentes con `utils/convertir.js`.

- La sesión simulada acepta cualquier correo y contraseña; `error@nucleo.mx` devuelve
  el error de credenciales y el rol sale de `VITE_MOCK_ROL` (por defecto `SUPER`).
- Panel, Dispositivos y Detalle vuelven a pedir los datos cada 30 s; el mock varía las
  lecturas ±0.1 en ese intervalo.
- `?estado=cargando|vacio|error|sinConexion` fuerza un estado de pantalla y
  `?agente=caido` simula el 503 del agente.
- El contrato no tiene ruta para el agente IA: fuera de los mocks se muestra como no
  disponible. Tampoco guarda si una notificación se leyó; eso se recuerda en
  `localStorage`.

## Configuración de la API

`VITE_API_BASE_URL` se define en `FrontEnd/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_USE_MOCKS=true
VITE_MOCK_ROL=SUPER
```

`src/services/api/client.js` elimina la barra final, centraliza `fetch` y expone
errores claros. Si la variable no está definida, usa el mismo valor por defecto
de desarrollo.

`src/hooks/useHealthCheck.js` consulta `GET /api/v1/health/` en `/estado`, cancela
peticiones anteriores con `AbortController` y ofrece una acción de reintento.

## CORS

El backend de desarrollo acepta peticiones desde `http://localhost:5173` y
`http://127.0.0.1:5173`. Vite se fija al puerto 5173 con `strictPort`. Si se
cambia el origen, actualiza `CORS_ALLOWED_ORIGINS` en `BackEnd/.env`.

## Scripts

```bash
npm run dev      # desarrollo en http://localhost:5173
npm run build    # compilación en dist/
npm run preview  # vista previa en http://localhost:4173
npm run lint     # Oxlint
```

No hay framework de pruebas. La compilación y el lint (con el único aviso esperado de
`useWidth` en `design-system/componentes/core/nc-lib.js`) se verifican en cada cambio.

## Pendientes

- Conectar con la API real (`VITE_USE_MOCKS=false`) y revisar cada pantalla contra el
  backend.
- Conectar el canal en vivo `ws/panel/?token=` para alertas y cambios de estado.
- Definir la ruta del agente IA en el contrato.
- Añadir pruebas.
- Definir estrategia de despliegue del build estático.
