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
│   │                               # HealthStatusCard, ModuloBase
│   ├── context/SesionContext.js    # token y usuario mientras la app está abierta
│   ├── context/TemaContext.js      # tema del sistema o elegido; TemaFijo para zonas fijas
│   ├── hooks/useDatos.js           # { estado, datos, error, reintentar }
│   ├── hooks/useOperador.js        # OperadorProvider: dispositivo, lecturas, umbrales, alertas
│   ├── hooks/useHealthCheck.js
│   ├── modules/index.js            # registro de pantallas
│   ├── modules/<modulo>/           # acceso, panel, mediciones, alertas (lista y detalle),
│   │                               # perfil, estado; dispositivos fuera de la navegación
│   ├── navigation/AppNavigator.js
│   ├── services/api/client.js
│   ├── services/api/health.js
│   ├── services/config.js          # USAR_MOCKS, token y pedir() con Authorization
│   ├── services/mock/              # datos.js y handlers.js
│   ├── services/<dominio>.js       # auth, dispositivos, lecturas, alertas, umbrales,
│   │                               # usuarios, organizaciones
│   ├── utils/                      # convertir.js, formato.js, formatDate.js
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
- `AppNavigator` usa `native-stack` en la raíz: `Acceso` sin sesión, y con sesión
  `Principal` (pestañas de `bottom-tabs` con el `TabBar` propio) más las pantallas
  apiladas `Variable`, `DetalleAlerta` y `Estado`.
- Cada entrada de `modules/index.js` lleva `nombre`, `titulo`, `Pantalla` y, si va en la
  barra inferior, `pestana` con el ícono.
- `OperadorProvider` hace una sola consulta para todas las pestañas y la repite cada 30 s.
- `theme.js` tiene los tokens de `Docs/Mockups/fuente/estilos` en camelCase; el tema sigue
  al sistema (`userInterfaceStyle: "automatic"`) y el Perfil lo puede fijar.
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

## Autenticación

La pantalla de salud es pública. El resto de la API exige el token de DRF
(`Authorization: Token <token>`): `services/config.js` lo agrega a cada petición
después de iniciar sesión. El token vive en memoria y se pierde al cerrar la app. No
se guardan contraseñas en el dispositivo. En producción la API debe servirse por HTTPS.

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
- No se probó en un teléfono ni emulador real.

`npm audit` reporta vulnerabilidades en dependencias transitivas de Expo CLI. No se
aplicó `npm audit fix --force` porque puede romper la compatibilidad del SDK; conviene
revisarlas al actualizar Expo.

## Pendientes

- Probar con la API real en teléfonos físicos.
- Guardar el token de forma segura para no pedir sesión cada vez.
- Conexión en vivo (`/ws/panel/`), registro del teléfono (`token_expo`) y
  notificaciones push con `expo-notifications`.
- Aplicar al dispositivo las preferencias del Perfil (bajo consumo, push y sonido).
- Compilación firmada y publicación en tiendas.
