# Estructura del frontend

## Tecnologías

- React 19.3.1 y React DOM 19.3.1.
- React Router (`react-router-dom` 7) para la navegación entre módulos.
- Vite 8.3.8.
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
│   ├── admin/            # consola de administración (admin.<dominio>), se descarga aparte
│   ├── consola/          # consola de Nico AI (nicoai.<dominio>), se descarga aparte
│   ├── context/
│   │   ├── SesionContext.jsx  # token, usuario, login, logout y tema
│   │   ├── AvisosContext.jsx  # alertas pendientes y campana: notificaciones de alertas + avisos
│   │   └── AgenteContext.jsx  # estado de Nico AI (puente, disponibles) y conversaciones
│   ├── design-system/
│   │   ├── componentes/  # 38 módulos ES (Button, Card, TrendChart…); index.js reexporta
│   │   ├── estilos/      # tokens de color, tipografía, espaciado y clases nc-*
│   │   └── fuentes/      # Plus Jakarta Sans 400–800
│   ├── features/
│   │   ├── index.js      # registro de módulos: ruta, título, página, sección, ícono y roles
│   │   └── <modulo>/     # acceso (con recuperar y solicitar acceso), panel, dispositivos
│   │                     # (lista y detalle), mediciones (Histórico), alertas, reportes,
│   │                     # agente, umbrales, usuarios, areas, organizaciones, solicitudes,
│   │                     # perfil (foto y verificación en dos pasos) y notificaciones
│   ├── hooks/
│   │   ├── useDatos.js        # { estado, datos, error, reintentar, actualizar }
│   │   ├── useMonitoreo.js    # dispositivos + últimas lecturas + umbrales + alertas
│   │   ├── useSalida.js       # useSalida (menús y listas) y useCierre (modales): animación de salida
│   │   ├── useMenuMovil.js    # CONSULTA_MOVIL (max-width: 900px): menú lateral como cajón
│   │   ├── useLatido.js       # GET /latido cada minuto en producción (Caddy cuenta conectados)
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
│   │                          # reportes, usuarios, organizaciones, agente,
│   │                          # seguridad (auditoría, integraciones y descarga de CSV)
│   ├── styles/
│   │   ├── fluido.css         # tokens que escalan con la ventana (clamp) y los dos puntos de quiebre
│   │   ├── global.css         # marco de la app y piezas propias de las pantallas
│   │   └── movil.css          # celular y tableta (≤ 900 px)
│   ├── utils/                 # convertir.js, formato.js, formatDate.js, foto.js (foto_url → URL),
│   │                          # tablasMovil.js (data-label para tablas como tarjetas)
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

- `/acceso` va sin marco, a pantalla completa; pide el código de la verificación en dos pasos
  cuando la API responde `requiere_codigo`.
- `/recuperar` y `/restablecer?uid=&token=` (enlace del correo) son públicas, con el mismo
  marco que el acceso.
- Si la API responde 403 `segundo_factor_pendiente`, `services/api/client.js` lanza el evento
  `nucleo:segundo-factor-pendiente`; la sesión lo guarda y cualquier ruta lleva a `/perfil`
  hasta configurarla.
- `/` redirige a `/panel` si hay sesión y a `/acceso` si no.
- `/estado` muestra el diagnóstico de la API.
- El resto va dentro de `MainLayout` y exige sesión. Una ruta con `roles` devuelve al
  panel a quien no tiene el rol.

El menú lateral se agrupa en Monitoreo (Panel, Dispositivos, Histórico, Alertas),
Análisis (Reportes para ADMIN, SUPER y ANALISTA; Nico AI), Configuración (Umbrales; Usuarios para
ADMIN y SUPER) y Áreas (Empresa y áreas, ADMIN y SUPER). El administrador de plataforma solo ve
Plataforma › Organizaciones (`puedeVer` / `inicioDe`). Auditoría e Integraciones se mudaron a la
consola de administración. Histórico y Alertas tienen **Exportar CSV** con los filtros de la
pantalla. `/dispositivos/:num`, `/perfil`, `/notificaciones` y `/solicitudes/:num` (ADMIN y
ADMINPLAT, enlace del correo de una solicitud de acceso) no aparecen en el menú; perfil y
notificaciones se abren desde los menús del encabezado. `/solicitar-acceso` es pública, con el
marco del acceso.

## Pantallas de monitoreo

- **Panel:** franja negra de cifras y debajo las gráficas de temperatura, humedad y calidad del
  aire del dispositivo elegido en el encabezado (por defecto el primero en línea), con un único
  filtro de periodo Hoy / 7 días / 30 días para las tres. La franja muestra la última temperatura
  de ese dispositivo con su barra de rango de advertencia y de cuándo es la lectura, su humedad y
  su aire, y del alcance completo los dispositivos en línea y las alertas pendientes (con las
  críticas). Se actualiza cada 30 s y con el canal en vivo (`useMonitoreo`). En escritorio franja y
  gráficas se reparten el alto sin scroll; en `baja` humedad y aire ceden el subtítulo y las
  gráficas quedan compactas.
- **Histórico** (`/mediciones`): sin gráfica. La franja de cifras da máximo, mínimo y promedio del
  periodo; la tabla ocupa todo el ancho con el histórico real del periodo por páginas («Cargar
  más») y el CSV exporta dispositivo, variable y periodo elegidos.
- **Alertas:** atender o descartar exige una **nota** (5 a 500 caracteres, igual que la API:
  «¿Qué se hizo para atenderla?» o por qué se descarta); la nota se ve después en las resueltas.

## Campana y notificaciones

`AvisosContext` junta en una sola lista, de la más reciente a la más vieja, las notificaciones de
alertas de medición (`/notificaciones/`; lo leído se recuerda en `localStorage` porque el contrato
no lo guarda) y los **avisos** de dispositivos, usuarios, reportes y Nico AI (`/avisos/`, que sí
traen `leido` y se marcan con `/avisos/marcar-leidos/`). El canal en vivo trae `aviso.nuevo` solo a
su destinatario. Los avisos se piden de 50 en 50 (`page_size`); el contador sin leer sale de
`/avisos/conteo/` (cuenta también los no cargados) y `/notificaciones` trae más con «Cargar más».
La campana del encabezado muestra los últimos y `/notificaciones` los separa en pestañas, solo de
los tipos que la cuenta recibió. El administrador ve como notificación cada alerta de su organización.

## Foto de perfil

En Mi perfil (`features/perfil/FotoPerfil.jsx`) cada quien sube o quita la suya (`POST` / `DELETE
/auth/foto/`); el servidor la recorta a 256×256 WebP. `utils/foto.js` resuelve `foto_url` contra
la URL de la API y `Avatar` muestra las iniciales si no hay o no carga. La usan el encabezado, las
listas de usuarios y las consolas.

## Sistema fluido de estilos

`styles/fluido.css` (se importa antes que `global.css` y `movil.css`) redefine los tokens del design
system con `clamp()`: tipografía, espacios, radios, ancho del menú, márgenes, alto de controles y
filas, cifras de la franja negra y alto de las gráficas se interpolan entre 360 px (celular) y
1920 px (PC) de ancho, y entre 700 y 1100 px de alto para que el escritorio quepa sin scroll; lo
que depende de los dos ejes toma el menor. En una PC grande los valores son los originales. La
fórmula está al inicio del archivo.

Solo quedan **dos puntos de quiebre** por pantalla:

- `(max-width: 900px)`: el menú lateral pasa a cajón (☰) y la página hace scroll completo
  (`CONSULTA_MOVIL` de `hooks/useMenuMovil.js` debe coincidir).
- `(min-width: 901px) and (max-height: 820px)`: escritorio bajo (`baja`); se ocultan textos
  secundarios y Panel, Umbrales, detalle de dispositivo y panel de la consola de administración se
  compactan para caber sin scroll. El menú lateral se desliza si sus grupos no caben.

Lo demás responde al ancho de su contenedor: rejillas `repeat(auto-fit, minmax(min(100%, X), 1fr))`,
`@container cifras` (720 px: la cifra principal en su renglón; 520 px: de dos en dos) y
`@container contenido` (720 px: las acciones del encabezado bajan; 528 px: tablas como tarjetas con
`data-label` de `utils/tablasMovil.js`, filtros y formularios en una columna).

**Movimiento:** las salidas usan `useSalida` (menús y listas) y `useCierre` (modales) con la clase
`is-saliendo`; `Tabs` tiene indicador deslizante. Todo respeta `prefers-reduced-motion`.

Cada pantalla ocupa la altura de la ventana: las tarjetas que llenan el resto llevan
`nc-grow` y solo las listas y tablas largas hacen scroll dentro de `nc-scroll`, con el
encabezado de la tabla fijo.

Las gráficas toman el alto libre de su tarjeta con `components/GraficaAjustable.jsx`: por debajo de
170 px pasa `tooltipFijo={false}` a `TrendChart` (el tooltip solo aparece al pasar el mouse, en un
renglón). `TrendChart` coloca las etiquetas Máx/Mín del umbral por dentro si por fuera chocarían,
las quita si no hay alto para las dos y no dibuja eje negativo para variables que no bajan de 0.

## Consolas por dominio

`main.jsx` elige la aplicación por el host; las dos son de la misma web compilada, se descargan
aparte (lazy) y solo deja entrar al administrador de plataforma (superusuario):

- `nicoai.<dominio>` → `src/consola/` (consola de Nico AI): Agente (Panel, Chat), Conocimiento
  (Banco de respuestas, Registro de preguntas) y Configuración (Herramientas, Sugerencias,
  Documento, Notificaciones). El Chat usa cualquier dispositivo, aun sin ESP (modo de pruebas).
- `admin.<dominio>` → `src/admin/` (consola de administración): Seguridad (Panel, Alertas de
  seguridad con lista, detalle y **Exportar CSV** con los filtros de la lista, Auditoría, Políticas), Accesos (Usuarios, Sesiones
  abiertas) y Dispositivos (Dispositivos ESP32, Cargar firmware por USB, Integraciones); la bandeja
  de la campana (`/notificaciones`) va fuera del menú. Rutas de la API en `src/api/consola.js`,
  llamadas en `src/services/admin.js` y `src/services/seguridad.js`.

Las dos consolas declaran sus secciones en `secciones.js` (ruta, título, ícono, grupo y página
lazy) con los mismos nombres e íconos que la web (Panel `layout-dashboard`, Alertas `bell`,
Usuarios `users`, Dispositivos `cpu`), comparten el lenguaje visual de la web (menú lateral por
grupos, franja de cifras, listas con detalle) y cada una tiene su campana con desplegable a una
línea y página de notificaciones.

En esos hosts `services/api/client.js` usa la API de su propio dominio (Caddy la sirve igual),
así la cookie de sesión es del mismo origen. En desarrollo se abren en
`http://admin.localhost:5173` con `VITE_API_BASE_URL=http://admin.localhost:8000/api/v1` (la
cookie no viaja entre `admin.localhost` y `localhost`) y el backend con `admin.localhost` en
`DJANGO_ALLOWED_HOSTS` y CORS.

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
- Con la API real, `pedir()` agrega `page_size=1000` a cada `GET` y las pantallas
  desempaquetan `results` con `pagina()`.
- `services/reportes.js` convierte las cifras que guarda la API (variables y series por
  código, dispositivos por código MQTT) en la forma de la hoja del reporte: título,
  lecturas, nombres de dispositivos, una fila por variable y la serie principal.
- `services/tiempoReal.js` abre `/ws/panel/?token=` al entrar y reenvía cada evento como
  `nucleo:evento` en `window`. Con un evento de alerta se recargan la campana y el
  contador; Panel, Dispositivos y Detalle (`useDatos` con `enVivo`) vuelven a pedir sus
  datos. Además se actualizan cada 30 s; el mock varía las lecturas ±0.1.
- `?estado=cargando|vacio|error|sinConexion` fuerza un estado de pantalla y
  `?agente=caido` simula el 503 del agente.
- El contrato no guarda si una notificación se leyó; eso se recuerda en `localStorage`.

## Configuración de la API

`VITE_API_BASE_URL` se define en `FrontEnd/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_USE_MOCKS=false
VITE_MOCK_ROL=SUPER
VITE_DEMO_PASSWORD=Nucleo2026
```

Con `VITE_DEMO_PASSWORD`, la pantalla de acceso muestra las cuentas de `sembrar_demo`
para entrar con un clic; vacía, no aparecen.

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

- Añadir pruebas.

El build estático se compila en el equipo de compilación y Caddy lo sirve en el servidor
([`deploy/README.md`](../../deploy/README.md#despliegue-en-dos-equipos)).
