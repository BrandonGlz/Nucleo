# Estructura de la app móvil

## Decisión

La app móvil usa Expo SDK 58 con React Native 0.88, React 19.3 y JavaScript/JSX.
Se eligió Expo para compartir el lenguaje con la web y evitar configurar Android
Studio o Xcode en esta etapa. No hay carpetas nativas `android/` ni `ios/`
versionadas; Expo las genera cuando haga falta una compilación nativa. Los
identificadores `com.nucleo.mobile` son provisionales.

## Estructura

```text
Mobile/
├── src/
│   ├── api/<modulo>.js             # rutas del backend como constantes, un archivo por módulo
│   ├── api/index.js                # punto único de importación
│   ├── components/ui/              # sistema de diseño en React Native; index.js reexporta
│   │   ├── Texto.js                # T: texto con Plus Jakarta Sans por peso
│   │   ├── Icon.js, icons.js       # íconos de lucide-react-native por nombre
│   │   ├── Logo.js                 # Logo y LogoMark (react-native-svg)
│   │   ├── Basicos.js              # Badge, StatusBadge, IconCircle, Avatar, Battery, Card,
│   │   │                           # Button, IconButton, Input, Chip, Tabs, Toggle,
│   │   │                           # Skeleton, ActivityFeed
│   │   ├── Graficas.js             # Sparkline y TrendChart (react-native-svg)
│   │   └── TabBar.js               # barra inferior flotante
│   ├── components/Pantalla.js      # zona oscura + hoja clara, con scroll y recarga
│   ├── components/                 # Medidor, BarraRango, Cabecera, Alerta, EstadoError,
│   │                               # HealthStatusCard, ModuloBase, Movimiento,
│   │                               # ReporteChat, SelectorDispositivo
│   ├── context/SesionContext.js    # sesión: restaura la guardada y la valida con /auth/yo/
│   ├── context/TemaContext.js      # tema del sistema o elegido; TemaFijo para zonas fijas
│   ├── context/PreferenciasContext.js  # preferencias del perfil; useAnimaciones()
│   ├── hooks/useDatos.js           # { estado, datos, error, reintentar }
│   ├── hooks/useOperador.js        # OperadorProvider: dispositivo, lecturas, umbrales, alertas
│   ├── hooks/useAvisos.js          # campana: alertas (lo visto, en el teléfono) + avisos de la API
│   ├── hooks/useHealthCheck.js
│   ├── modules/index.js            # registro: acceso, publicas (sin sesión) y modulos
│   ├── modules/<modulo>/           # acceso (MarcoAcceso, AccesoScreen, SolicitarAccesoScreen),
│   │                               # panel, historico, mediciones (detalle de variable),
│   │                               # alertas (lista, detalle y HojaResolver), agente (Nico AI
│   │                               # con voz y ConversacionesScreen), notificaciones, perfil (foto, sesiones y
│   │                               # contraseña), reportes, estado;
│   │                               # dispositivos fuera de la navegación
│   ├── modules/reportes/tableros/  # pestaña «Tableros» de Reportes (lista, vista y tarjetas)
│   ├── navigation/AppNavigator.js
│   ├── services/api/client.js
│   ├── services/api/health.js
│   ├── services/config.js          # USAR_MOCKS, token y pedir() con Authorization
│   ├── services/sesionGuardada.js  # token, usuario e inicio en expo-secure-store
│   ├── services/avisosEnVivo.js    # avisos de la campana en memoria, compartidos
│   ├── services/mock/              # datos.js, handlers.js y analitica.js
│   ├── services/<dominio>.js       # auth, dispositivos, lecturas, alertas, umbrales, usuarios,
│   │                               # organizaciones, agente, reportes, analitica, solicitudes,
│   │                               # notificaciones (push) y tiempoReal (canal en vivo)
│   ├── utils/                      # convertir.js, formato.js (diaRelativo), formatDate.js
│   └── theme.js                    # colors.light/dark, marca, space, radius, font
├── App.js
├── index.js
├── app.json
├── package.json
├── package-lock.json
├── .oxlintrc.json
└── .env.example
```

- `App.js` carga las cinco variantes de Plus Jakarta Sans (`@expo-google-fonts`) y monta
  `SafeAreaProvider`, `TemaProvider`, `SesionProvider` y `AppNavigator`.
- `AppNavigator` usa `native-stack` en la raíz: sin sesión, `Acceso` y las `publicas`
  (`SolicitarAcceso`); con sesión, `Principal` (pestañas de `bottom-tabs` con el `TabBar` propio:
  Panel, Alertas, Histórico, Nico AI y Mi perfil) más las pantallas apiladas `Variable`,
  `DetalleAlerta`, `Notificaciones`, `Reportes`, `TableroAnalitica`, `Sesiones`, `Contrasena` y
  `Estado`. Alertas, Histórico, Notificaciones y Nico AI solo aparecen para cuentas con
  organización (`permiso`); Reportes y sus tableros, para ADMIN, SUPER y ANALISTA.
- Cada entrada de `modules/index.js` lleva `nombre`, `titulo`, `Pantalla` y, si va en la
  barra inferior, `pestana` con el ícono.
- `OperadorProvider` hace una sola consulta para todas las pestañas y la repite cada 30 s.
- `theme.js` tiene los tokens de `Docs/Mockups/fuente/estilos` en camelCase; el tema sigue
  al sistema (`userInterfaceStyle: "automatic"`) y el Perfil lo puede fijar.
- `utils/formato.js` → `diaRelativo(iso, {largo})` es el único que decide «Hoy» / «Ayer» / fecha
  según el día local de la fecha; `cuando`, `diaCorto` y `haceCuanto` lo usan.
- `react-native-web` y `react-dom` permiten abrir la app en el navegador con `npm run web`.

## Datos simulados

Con `EXPO_PUBLIC_USE_MOCKS=true` cada servicio responde con `services/mock/handlers.js`,
con la forma del contrato (listas paginadas, campos del modelo relacional, fechas
ISO 8601, unidades `°C`, `%HR` y `ppm`). La sesión simulada es siempre la del operador
(`OPER`) Luis Ortega, con Núcleo T-01 asignado; `error@nucleo.mx` devuelve el error de
credenciales. `EXPO_PUBLIC_MOCK_ESTADO` fuerza `cargando`, `vacio`, `error` o
`sinConexion`. Al poner la bandera en `false` las pantallas llaman a la API sin cambios.

## Comunicación con el backend

La app consume el mismo contrato que la web:
`Context/api/contrato-api.md`. La URL se toma de
`EXPO_PUBLIC_API_BASE_URL`; Expo solo expone al cliente las variables con ese
prefijo.

- Emulador Android: `http://10.0.2.2:8000/api/v1`.
- Simulador iOS: `http://localhost:8000/api/v1`.
- Teléfono físico: `http://IP_LOCAL:8000/api/v1`.

Para un teléfono físico, Django debe escuchar en `0.0.0.0:8000` y la IP local
debe estar en `DJANGO_ALLOWED_HOSTS`. La app nativa no necesita configurar CORS,
pero el backend sí valida el encabezado `Host`.

## Acceso y solicitud de cuenta

`MarcoAcceso` es el marco de las pantallas sin sesión, como `.acceso` en la web: zona superior con
el logo y Nico asomado sobre la hoja del formulario (`assets/nico-acceso-claro.webp` y
`nico-acceso-oscuro.webp`, según el tema; fuentes en `Docs/Nico/`, fuera de git). Con el teclado
abierto la hoja sube y se recorre hasta los campos; respeta «Reducir animaciones».

«Solicita una cuenta» abre `SolicitarAccesoScreen`: elige organización y área
(`GET /auth/solicitar-acceso/`) y manda nombre, apellidos y correo (`POST`, 204). Nico avisa a los
administradores, que la aprueban desde la web (`/solicitudes/<num>`); la persona recibe por correo
una contraseña temporal que cambia al entrar. Contrato en
[`api/contrato-api.md`](../api/contrato-api.md#solicitud-de-acceso).

## Autenticación

La pantalla de salud es pública. El resto de la API exige el token de DRF
(`Authorization: Token <token>`): `services/config.js` lo agrega a cada petición
después de iniciar sesión. Token, usuario y fecha de inicio se guardan cifrados con
`expo-secure-store` (`services/sesionGuardada.js`; en la web no se guardan). Al abrir la app la
sesión guardada se valida con `/auth/yo/` (sin red se entra con el usuario guardado). Vale 30 días
desde el último inicio de sesión; aparte, el servidor la cierra tras `NUCLEO_TOKEN_DIAS_SIN_USO`
(7) días sin uso, y cualquier 401 la borra y vuelve al acceso. No se guardan contraseñas en el
dispositivo. En producción la API debe servirse por HTTPS.

Si la cuenta tiene la verificación en dos pasos, el acceso pide el código de la app de
autenticación (o uno de recuperación) después de la contraseña. Se configura solo en la web: si
el rol la exige y aún no la tiene, la app cierra esa sesión y avisa que se configure en Mi
perfil de la web. «¿Olvidaste tu contraseña?» pide el enlace por correo
(`POST /auth/recuperar/`); la contraseña nueva se elige en la web.

## Alertas, campana, perfil y reportes

- **Atender o descartar** (botón o gesto) abre `alertas/HojaResolver.js`, que pide la nota
  obligatoria (5 a 500 caracteres, como la API y la web).
- **Campana:** junta las alertas de medición con los avisos de `/avisos/` (`services/avisosEnVivo.js`,
  se piden al entrar, al volver al frente y al abrir el Panel o la campana; los nuevos llegan en
  vivo como `aviso.nuevo`). Un aviso REPORTE abre Reportes con ese reporte resaltado; uno USUARIO,
  Mi perfil.
- **Mi perfil:** foto desde la galería con `expo-image-picker` (sin permiso de cámara; `POST` /
  `DELETE /auth/foto/`) y datos según el rol: área (o «Área a cargo» del supervisor), dispositivo y,
  solo para SUPER, los operadores de su área (`/usuarios/` responde 403 a OPER y ANALISTA).
- **Reportes** (`modules/reportes/ReportesScreen.js`, ADMIN, SUPER y ANALISTA; se abre desde Mi
  perfil y los avisos): tarjetas con periodo, origen, cifras y extracto; el PDF se descarga y se
  abre con el menú de compartir. Chips de origen y de periodo (Todos, Este mes, Mes pasado,
  Últimos 7 días → `?desde=&hasta=`) y «Envíos» abre una hoja con el historial de correos del
  reporte (`envios`: fecha, origen, quién, destinatarios, resultado y error). Arriba tiene las
  pestañas **Reportes | Tableros**; un aviso de reporte siempre entra por «Reportes».
- **Tableros de Analítica** (pestaña «Tableros» y pantalla `TableroAnalitica`, solo consulta):
  - La lista muestra primero los tableros de la organización (★ en el predeterminado) y después
    las plantillas del sistema, con nombre y descripción; el buscador filtra por ambos.
  - La vista de un tablero (`modules/reportes/tableros/TableroScreen.js`) tiene periodo (los mismos
    de la web, incluido personalizado de hasta 366 días), «Filtros» con áreas, dispositivos y
    variable (contador de activos), pestañas deslizables de páginas y las tarjetas apiladas en
    orden `y`, luego `x`. Los KPI de ancho ≤ 3 van dos por renglón.
  - Las gráficas son SVG propio con `react-native-svg`: tendencia, medidor, barras horizontales,
    barras apiladas, dona, histograma, mapa de calor y dispersión. Ranking, matriz, tiempo de
    atención y disponibilidad se muestran como listas con barra fina, nunca como tablas densas.
  - Tocar una barra, un sector, una fila, una celda o un área de la leyenda aplica un solo filtro
    cruzado con su chip y ×; la tarjeta de origen resalta lo elegido y atenúa el resto. Cambiar de
    página lo quita.
  - Los datos son en vivo: WebSocket de la app con espera de 5 s, consulta cada 60 s si el periodo
    incluye «ahora», jalar para refrescar y «Actualizado hace…». Hay estados de carga, sin datos,
    error con «Reintentar» y sin conexión. No hay CSV, PNG, PDF ni editor.
  - Los íconos y textos de los tipos son los mismos de la web (`ICONOS_TIPO`); las consultas usan
    `services/analitica.js` (`tableros-analitica/`, `analitica/consulta/` y `analitica/hallazgos/`).
    En mocks, `services/mock/analitica.js` genera las cinco plantillas/tablero de ejemplo y los
    datos de las 15 tarjetas; con `EXPO_PUBLIC_MOCK_ESTADO=vacio` todas quedan sin datos y con
    `sinConexion` la consulta del tablero falla como una API sin red.

## Nico AI en la app

`modules/agente/AgenteScreen.js` es el chat (con dictado y voz). Igual que la web:

- Un solo selector de alcance en hoja inferior (`components/SelectorAlcance.js`): dispositivos,
  áreas y «Toda la organización» (ADMIN y SUPER); el OPER no lo ve. Si el alcance no puede usar a
  Nico (`GET /agente/estado/?area=` u `?organizacion=1` → `motivo`), muestra el aviso y deshabilita
  el campo.
- Inicio con saludo, resumen del dispositivo (últimas lecturas, pendientes y conexión; solo en
  alcance de dispositivo) y las sugerencias reales de `GET /agente/sugerencias/` (`inicio`).
- Cada respuesta: fila «Basado en» (`fuente`), copiar (`expo-clipboard`), regenerar, 👍/👎 y «Ver en
  Histórico», que abre Histórico con el dispositivo y el «Rango de Nico» (`route.params` desde/hasta).
- Las alertas pendientes que trae una respuesta se atienden o descartan ahí con `HojaResolver`.
- `ConversacionesScreen.js`: las 50 últimas conversaciones de la cuenta (AsyncStorage, un hilo por
  alcance), buscador, grupos Hoy/Ayer/Esta semana/Antes y renombrar o borrar con pulsación larga.

## Comandos

```bash
cp Mobile/.env.example Mobile/.env
cd Mobile && npm ci
cd Mobile && npm start
cd Mobile && npm run web
cd Mobile && npm run android
cd Mobile && npm run ios
cd Mobile && npm run lint
cd Mobile && npm run export:android
cd Mobile && npm run export:web
```

`npm start` abre Expo y muestra un código QR para Expo Go. `npm run web` abre la app en
el navegador. `npm run android` e `npm run ios` requieren el emulador o simulador
correspondiente.

## Verificación realizada

- `npm run lint`: sin avisos.
- `npx expo install --check`: dependencias alineadas con SDK 58 (expo 58.0.23).
- `npx expo export --platform android` y `--platform web`: bundles generados.
- Recorrido de todas las pantallas en el navegador a 390 × 844, en claro y oscuro, y de
  los estados `cargando`, `vacio` y `sinConexion`.
- Pestaña **Tableros** de Reportes probada con mocks en 390 × 844 y 360 × 740, claro y oscuro,
  con ADMIN, SUPER y ANALISTA: lista con predeterminado y plantillas, las 15 tarjetas (gráficas,
  listas y hallazgos), filtros, periodo personalizado, filtro cruzado, estados `vacio` y
  `sinConexion`, y la pestaña Reportes (lista, PDF, envíos y aviso) sin cambios.
- No se probó en un teléfono ni emulador real.

`npm audit` reporta vulnerabilidades en dependencias transitivas de Expo CLI. No se
aplicó `npm audit fix --force` porque puede romper la compatibilidad del SDK; conviene
revisarlas al actualizar Expo.

## Compilación y publicación

El APK firmado se compila en el equipo de compilación con `compilar-apk-nucleo` (solo cuando se
pide; nunca dos a la vez) y se publica en https://app.bynucleo.com. Cada cambio de `Mobile/` sube
`version` y `android.versionCode` de `app.json` en el mismo commit. Detalle en
[`deploy/README.md`](../../deploy/README.md#app-móvil-apk).

Ya funcionan con la API real: canal en vivo (`/ws/panel/`), registro del teléfono (`token_expo`),
push con `expo-notifications` (Expo + Firebase) y las preferencias del perfil (reducir animaciones,
push y sonido).

## Pendientes

- Publicación en tiendas.
