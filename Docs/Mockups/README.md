# Mockups de Núcleo: guía de migración a FrontEnd y Mobile

Esta carpeta tiene el diseño completo de las dos apps y todo lo necesario para pasarlo a `FrontEnd/` (web) y `Mobile/` (app). El objetivo es que un agente pueda implementar **todo el front web y todo el front móvil con datos simulados, sin backend**, siguiendo solo este documento.

Si eres un agente y te piden "migra los mockups", sigue las secciones 3 (web) y 4 (móvil) en orden y termina con la sección 6 (verificación).

## 1. Qué hay aquí

```text
Docs/Mockups/
├── nucleo-web.html            Maqueta web navegable (abrir en el navegador; referencia visual)
├── nucleo-movil.html          Maqueta móvil navegable (referencia visual)
├── README.md                  Esta guía
└── fuente/                    Código listo para copiar
    ├── componentes/           38 módulos ES del sistema de diseño (React, sin JSX)
    │   ├── index.js           Reexporta todo: import { Button, Card } from '…/componentes/index.js'
    │   ├── actions/           Button, IconButton
    │   ├── charts/            AqiGauge, BarChart, Sparkline, TrendChart
    │   ├── core/              Icon, ICONS (mapa nombre → ícono de lucide-react), IconCircle, Logo, LogoMark,
    │   │                      nc-lib (cx, omit, fmt, STATUS, VARIABLES, LEVEL, hooks internos)
    │   ├── display/           Avatar, Badge, Battery, Card, DeviceCard, DeviceTable, HeroCard,
    │   │                      SensorCard, SignalBars, StatusBadge
    │   ├── feedback/          ActivityFeed, Alert, CriticalBanner, EmptyState, Skeleton, Toast
    │   ├── forms/             Chip, Field, Input, PeriodFilter, Select, Tabs, ThresholdSlider, Toggle
    │   └── navigation/        Header, Sidebar (+ DEFAULT_NAV), TabBar (+ DEFAULT_TABS)
    ├── estilos/               index.css importa: fonts, colors, typography, spacing, components
    ├── fuentes/               Plus Jakarta Sans 400–800 (.woff2)
    └── pantallas/
        ├── WebScreen.dc.html     Plantilla y datos de las 18 vistas web
        └── MobileScreen.dc.html  Plantilla y datos de las 10 vistas móviles
```

Estado verificado de `fuente/`:

- Los 38 módulos importan y renderizan con **React 19.3.1**, la versión de FrontEnd.
- `vite build` empaqueta los componentes, `estilos/index.css` y las fuentes sin configuración extra.
- Con el `.oxlintrc.json` de FrontEnd queda un solo aviso esperado (ver 3.1).

## 2. Cómo leer el diseño

### Maquetas HTML

`nucleo-web.html` y `nucleo-movil.html` llevan dentro React 18 y un runtime ("dc") que convierte plantillas en componentes. Sirven **solo como referencia visual**: no se copian al proyecto.

### Plantillas de pantalla (`fuente/pantallas/*.dc.html`)

Cada archivo tiene dos partes:

- `<x-dc>…</x-dc>`: el marcado de **todas** las vistas. Cada vista va dentro de un `<sc-if value="{{ s.<vista> }}">`; busca ese bloque para ver la estructura exacta de una pantalla.
- `<script data-dc-script>` con `class Component extends DCLogic`: en `renderVals()` están **todos los datos de ejemplo** (listas de dispositivos, alertas, series, usuarios…). Esos datos son la base de los mocks.

Reglas de traducción a JSX:

- `{{ expr }}` → `{expr}`.
- `<sc-if value="{{ x }}">…</sc-if>` → `{x && (…)}`.
- `<sc-for list="{{ items }}" as="it">…</sc-for>` → `{items.map((it) => …)}`; agrega `key`.
- `<x-import component-from-global-scope="NCleoDesignSystem_ca495a.Button" size="lg">Texto</x-import>` → `<Button size="lg">Texto</Button>`.
- Los atributos kebab-case pasan a camelCase: `status-label` → `statusLabel`, `default-value` → `defaultValue`, `active-index` → `activeIndex`.
- Un valor `"{{ 24.3 }}"` es número, y uno `"normal"` es string.
- Se borran `hint-size`, `hint-placeholder-*` y `<helmet>`; los usa solo el editor de diseño.
- `style="a:b;c:d"` → `style={{ a: 'b', c: 'd' }}`. Si un estilo inline se repite, conviértelo en clase CSS en el módulo.
- `this.state` / `this.setState` de `DCLogic` → `useState`. `window.__ncSet` y `window.__ncM` solo sirven en el lienzo y no se migran.

### Tema

El tema claro está en `:root` y el oscuro en `[data-theme="dark"]` (`estilos/colors.css`). Cualquier contenedor con `className="nc-theme"` y `data-theme="dark"` cambia de tema.

## 3. Web (`FrontEnd/`)

Stack: React 19.3, Vite 8, react-router-dom 7, JS + JSX y Oxlint. Los módulos se registran en `src/features/index.js` (`{ ruta, titulo, Pagina }`); `App.jsx` crea las rutas y `MainLayout` el menú.

### 3.1 Copiar el sistema de diseño

```text
Docs/Mockups/fuente/componentes  →  FrontEnd/src/design-system/componentes
Docs/Mockups/fuente/estilos      →  FrontEnd/src/design-system/estilos
Docs/Mockups/fuente/fuentes      →  FrontEnd/src/design-system/fuentes
```

- En `src/main.jsx`, importa `./design-system/estilos/index.css` **antes** de `./styles/global.css`.
- Vacía `src/styles/global.css` y deja solo lo propio de la app (layout de páginas). Sus variables viejas (`--bg`, `--text`, `--accent-strong`…) chocan con los tokens del diseño; usa los tokens (`--background`, `--surface`, `--text-primary`, `--accent`…).
- Importa los componentes desde `src/design-system/componentes/index.js`.
- Logo: `Logo` y `LogoMark` dibujan el logo oficial (los mismos trazos de `FrontEnd/src/assets/logos/`) con el color de `--logo-color`: verde `#03C051` en claro y lima `#C6EF4E` en oscuro. Sobre fondos que siempre son oscuros se usa `tone="lima"`. Para una imagen suelta (favicon, correo, PDF) se importan los SVG de `src/assets/logos`.
- Íconos: solo de [Lucide](https://lucide.dev/icons/). `lucide-react` ya está instalado en FrontEnd, y `core/icons.js` importa de ahí los 52 íconos del diseño. Se usan como `<Icon name="bell" />` o directo con `import { Bell } from 'lucide-react'`. Para uno nuevo: búscalo en lucide.dev, impórtalo en `icons.js` y regístralo con su nombre kebab-case. El lint marca como error cualquier otra librería de íconos.
- Oxlint da un solo aviso, y es esperado: `react-hooks(exhaustive-deps)` en `useWidth` de `nc-lib.js`. El efecto usa el setter de `useState`, que es estable.

### 3.2 Layout

Reemplaza el encabezado y el menú de `MainLayout` por la composición del diseño (busca `nc-sidebar` en `WebScreen.dc.html`):

- `Sidebar` a la izquierda y, a la derecha, `Header` + contenido, a 1440 px de referencia.
- Debajo del `Header`, cada pantalla abre con una tarjeta oscura de cifras clave (clase `nc-ink`, `#121413`, esquinas de 32 px), con anillos y el `LogoMark` lima tenue como decoración:
  - **A la izquierda:** la cifra principal en tipografía grande. En Panel lleva además una barra de rango.
  - **A la derecha:** cuatro cifras secundarias o menos, separadas por líneas verticales.
  - **De dónde salen:** el contenido de cada pantalla se calcula en `hero` dentro de `renderVals` de `WebScreen.dc.html`, con los mismos datos simulados.
- Las cifras de esa tarjeta ya no se repiten en el contenido. Por eso Panel y Detalle de dispositivo no usan `HeroCard` ni `SensorCard`, e Histórico no tiene tarjeta de resumen.
- El menú se agrupa en secciones y se filtra por rol:
  - **Monitoreo:** Panel, Dispositivos, Histórico, Alertas.
  - **Análisis:** Reportes, Agente IA.
  - **Configuración:** Umbrales, Usuarios (solo ADMIN y SUPER), Organización (solo ADMIN).
- Agrega `roles` a cada entrada de `features/index.js` y filtra el menú con el rol de la sesión simulada (sección 5).
- `/acceso` se muestra sin `Sidebar`, a pantalla completa.
- `/` redirige a `/panel` si hay sesión y a `/acceso` si no. `HomePage` y `HealthStatusCard` salen del menú; si se conservan, que sea en una ruta de diagnóstico (`/estado`).

### 3.3 Pantallas → módulos

Cada estado (cargando, vacío, error, sin conexión, solo lectura) va **dentro** del mismo módulo y se controla con estado o props, no con rutas aparte.

```text
features/acceso/AccesoPage.jsx                login, loginError
features/panel/PanelPage.jsx                  dashboard, dashboardLoading
features/dispositivos/DispositivosPage.jsx    devices, devicesEmpty
features/dispositivos/DetalleDispositivo.jsx  detail, detailOffline        ruta /dispositivos/:num
features/mediciones/MedicionesPage.jsx        history                      título en menú: Histórico
features/alertas/AlertasPage.jsx              alerts
features/reportes/ReportesPage.jsx            reports
features/usuarios/UsuariosPage.jsx            users, usersAdd (modal dentro de la página)
features/organizaciones/OrganizacionesPage.jsx  org                        título en menú: Organización
features/umbrales/UmbralesPage.jsx            thresholds, thresholdsReadonly   NUEVO módulo, ruta /umbrales
features/agente/AgentePage.jsx                agent, agentDown                 NUEVO módulo, ruta /agente
features/perfil/PerfilPage.jsx                profile                          NUEVO módulo, ruta /perfil; se abre desde el avatar
features/notificaciones/NotificacionesPage.jsx  notifications                  NUEVO módulo, ruta /notificaciones; se abre desde la campana
```

- Los módulos nuevos se crean con su carpeta y una línea en `features/index.js`. Perfil y Notificaciones no aparecen en el menú lateral. Se llega a ellas desde los menús desplegables del `Header`, que no son rutas sino estado del layout. `notifMenu` es el menú de la campana: las notificaciones de hoy, «Marcar como leídas» y «Ver todas las notificaciones», que lleva a /notificaciones. `userMenu` es el menú del avatar: «Ver perfil», «Notificaciones», el tema y «Cerrar sesión». En el diseño se muestran sobre el Panel, pero existen en todas las pantallas.
- Llenar la altura: el contenido de cada pantalla ocupa todo el espacio que queda bajo el `Header` y la tarjeta de cifras. Las tarjetas que llenan el resto llevan la clase `nc-grow`. Solo las listas y tablas largas hacen scroll, dentro de un contenedor `nc-scroll` con el encabezado de la tabla fijo. La página no hace scroll.
- Para la ruta de detalle, agrega en `App.jsx` `<Route path="/dispositivos/:num" element={<DetalleDispositivo />} />`.
- `thresholdsReadonly` es la misma página con los controles deshabilitados cuando el rol es ANALISTA.

## 4. Móvil (`Mobile/`)

Stack: Expo SDK 58, React Native 0.88, React 19.3, `@react-navigation/native-stack`. Los módulos se registran en `src/modules/index.js` (`{ nombre, titulo, Pantalla }`) y `AppNavigator` crea las pantallas. El diseño móvil es para el rol **OPER** (operador).

### 4.1 Lo que NO se copia

`fuente/componentes/` genera `div`, `span`, `button` y `svg` del navegador, y `estilos/` es CSS web. React Native no tiene DOM ni CSS, así que **no se importan en Mobile**. Cada componente se reescribe en RN usando el archivo web como especificación: sus props, sus variantes y su clase `.nc-*` en `estilos/components.css`, que tiene medidas, radios y colores exactos.

### 4.2 Preparación

- Dependencias, instaladas con `npx expo install` para que coincidan con el SDK:
  - `react-native-svg` para gráficas, logo y batería, y como base de los íconos.
  - `lucide-react-native` para los íconos (misma fuente que la web: lucide.dev).
  - `expo-font` y `@expo-google-fonts/plus-jakarta-sans`. RN no carga `.woff2`; este paquete trae los TTF.
  - `@react-navigation/bottom-tabs` para la barra inferior.
- `src/theme.js` se reemplaza por los tokens de `estilos/colors.css`, `typography.css` y `spacing.css` como objetos JS con los mismos nombres en camelCase:
  - `colors.light` y `colors.dark` (`background`, `surface`, `surfaceMuted`, `border`, `textPrimary`, `textSecondary`, `textMuted`, `accent`, `accentContrast`, `success`, `successSoft`, `warning`, `warningSoft`, `danger`, `dangerSoft`, `offline`, `offlineSoft`, `sidebar`, `sidebarText`, `sidebarTextMuted`, `chartLine`, `chartGrid`…).
  - `space` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64), `radius` (xs 8, sm 12, md 16, lg 24, xl 28, full 999) y `font` (pesos 400–800 con los nombres de familia de `@expo-google-fonts`).
- El tema sigue al sistema con `useColorScheme()`, y el Perfil permite forzarlo (pestañas Claro / Oscuro). En `app.json`, `userInterfaceStyle` pasa a `"automatic"`.
- Íconos: solo de [Lucide](https://lucide.dev/icons/). Se copia `fuente/componentes/core/icons.js` cambiando `from 'lucide-react'` por `from 'lucide-react-native'` (los nombres de los componentes son los mismos). El `Icon` de RN recibe `name`, `size`, `color` y `strokeWidth` (2 por defecto), igual que el de la web.

### 4.3 Componentes RN necesarios

Viven en `Mobile/src/components/ui/`, con el mismo nombre y las mismas props que la versión web:

```text
Icon, IconCircle, Logo, LogoMark, Avatar, Badge, StatusBadge, Battery, SignalBars,
Card, TrendChart, Sparkline, ActivityFeed, Skeleton, Chip, Tabs, Toggle, Input, Button,
IconButton, TabBar
```

Todas las pantallas móviles, salvo la notificación push, comparten el mismo esquema, con el estilo del login:

- **Zona oscura arriba** (`#121413`, de borde a borde, detrás de la barra de estado): muestra el dato principal en tipografía grande (temperatura, medidor circular, alertas pendientes, valor de la alerta o perfil). Lleva anillos y el `LogoMark` lima como decoración.
- **Hoja clara** (`background`, esquinas superiores de 32 px): sube sobre la zona oscura y contiene el resto. Usa mosaicos de dos columnas que combinan lima (`#C6EF4E`), tinta (`#121413`) y `surface`.
- **Piezas propias de la pantalla, no componentes:** la barra de rango, el medidor (`conic-gradient`) y las barras de 24 h. En RN se dibujan con `View` o `react-native-svg`.

### 4.4 Navegación

- Raíz: `native-stack` con `Acceso` (sin sesión) y `Principal` (con sesión).
- `Principal`: `bottom-tabs` con `tabBar={(props) => <TabBar …/>}`. Las tres pestañas son Inicio (`house`), Alertas (`bell`, con contador) y Perfil (`user`). Es la barra flotante oscura del diseño, a 16 px de los lados y 24 px del borde inferior.
- Las pantallas de detalle (Detalle de variable, Detalle de alerta) se apilan sobre las pestañas con `native-stack`.
- La barra de estado (hora, señal, batería) es la del sistema y no se dibuja.

### 4.5 Pantallas → módulos

```text
modules/acceso/AccesoScreen.js              login
modules/panel/PanelScreen.js                home, homeLoading, homeOffline   pestaña Inicio
modules/mediciones/MedicionesScreen.js      variable (detalle últimas 24 h)  se abre desde el bloque de temperatura
modules/alertas/AlertasScreen.js            alerts, alertsEmpty              pestaña Alertas
modules/alertas/DetalleAlertaScreen.js      alertDetail                      se abre desde una alerta
modules/perfil/PerfilScreen.js              profile                          NUEVO módulo, pestaña Perfil
```

- `push` (vista 7) es una notificación del sistema, no una pantalla. Se deja para cuando exista `expo-notifications` y el registro de `token_expo`.
- `modules/dispositivos` no aparece en el diseño del operador, porque solo tiene un dispositivo y este se ve en Inicio. Sácalo de la navegación y conserva la carpeta.
- Para Alertas, el diseño muestra solo consulta: el operador no atiende ni descarta alertas.

## 5. Datos simulados (sin backend)

Toda la app tiene que funcionar con mocks y quedar lista para cambiar a la API sin tocar las pantallas.

### Estructura (igual en web y móvil)

```text
src/api/
├── <modulo>.js            Ya existe: rutas del backend como constantes, un archivo por módulo
│                          (salud, catalogos, acceso, organizaciones, usuarios, dispositivos,
│                          umbrales, mediciones, alertas, reportes, tiempoReal)
└── index.js               import { DISPOSITIVOS, DISPOSITIVO } from '../api'
src/services/
├── api/client.js          Ya existe; no se toca
├── mock/
│   ├── datos.js           Datos de ejemplo (sacados de renderVals() de las plantillas)
│   └── handlers.js        Funciones que imitan cada endpoint con un retraso de 300–600 ms
├── auth.js                login, logout, yo
├── dispositivos.js        lista, detalle, ultimasLecturas
├── lecturas.js            serie
├── alertas.js             lista, atender, descartar
├── umbrales.js            lista, guardar
├── reportes.js            lista, crear
├── usuarios.js            lista, crear
└── organizaciones.js      propia, areas
```

### Reglas

- Cada servicio exporta funciones `async` con nombres de negocio. Dentro, decide así: `if (USAR_MOCKS) return handlers.x(params)`, y si no, `return apiRequest(DISPOSITIVO(num), …)`. Las rutas siempre se importan de `src/api`, nunca se escriben a mano.
- La bandera se lee de `VITE_USE_MOCKS` (web) o `EXPO_PUBLIC_USE_MOCKS` (móvil). Agrega `…_USE_MOCKS=true` a cada `.env.example`.
- Los mocks devuelven **exactamente la forma del contrato** (`Context/api/contrato-api.md`):
  - Listas paginadas `{ count, next, previous, results }`.
  - Campos con los nombres en español del modelo relacional (`Context/base-de-datos/modelo-relacional.md`).
  - Fechas ISO 8601 con zona horaria.
  - Estados de dispositivo `LINEA`, `CALENT`, `SINCONEX`, `BATBAJA`, `MANT` y `BAJA`.
  - Roles `ADMINPLAT`, `ADMIN`, `SUPER`, `ANALISTA` y `OPER`.
- Las pantallas convierten la forma del contrato a las props de los componentes con funciones pequeñas en `src/utils/` (por ejemplo `LINEA` → `status="normal"`, `SINCONEX` → `"offline"`). Así, al conectar la API solo cambia la bandera.
- Sesión simulada: `auth.login` acepta cualquier correo y contraseña y devuelve `{ token: 'mock', usuario }`. El rol sale de `VITE_MOCK_ROL` (web, por defecto `SUPER`) y en móvil siempre es `OPER`. El correo `error@nucleo.mx` devuelve el error de credenciales para mostrar `loginError`.
- Estados de pantalla: cada hook de datos expone `{ estado: 'cargando' | 'listo' | 'vacio' | 'error' | 'sinConexion', datos, reintentar }`. Para forzar un estado al revisar el diseño, usa el parámetro `?estado=` en la web o una constante en `mock/handlers.js` en móvil.
- No se abre el WebSocket. El "en vivo" se simula con un `setInterval` en el mock que varía ±0.1 las lecturas cada 30 s.
- Agente IA: el mock responde con texto fijo. `agentDown` se ve cuando el mock devuelve 503.

## 6. Verificación

Web:

```text
cd FrontEnd && npm run lint     sin errores (solo el aviso esperado de useWidth en nc-lib.js)
cd FrontEnd && npm run build    termina con "built in …"
cd FrontEnd && npm run dev      recorrer cada ruta en claro y oscuro y comparar con nucleo-web.html
```

Móvil:

```text
cd Mobile && npm run lint
cd Mobile && npx expo install --check
cd Mobile && npx expo export --platform android    genera el bundle sin errores
cd Mobile && npm start                              comparar cada pantalla con nucleo-movil.html
```

Al terminar, actualiza `FrontEnd/README.md`, `Mobile/README.md`, `Context/frontend/estructura-frontend.md` y `Context/mobile/estructura-mobile.md` con la estructura nueva.

## 7. Origen

Todo sale del proyecto de Claude Design `ad6281ad-b3e6-4a35-8cb2-0b31c7cdedd7`: `Núcleo Web.dc.html`, `Núcleo Móvil.dc.html` y el sistema de diseño "Núcleo". `fuente/componentes/` es el bundle de ese sistema separado en un módulo por archivo. Si el diseño cambia, se regeneran desde ahí.
