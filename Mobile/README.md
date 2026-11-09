# Mobile — Núcleo

> **En simple:** es la app del teléfono para el operador. Muestra en vivo el
> dispositivo que tiene asignado y sus alertas, y usa el mismo backend que la web.

Está hecha con Expo y React Native, con los componentes del sistema de diseño de
Núcleo reescritos para el teléfono (`src/components/ui/`). Tiene todas las pantallas
del diseño (`Docs/Mockups/nucleo-movil.html`) y funciona sin backend con datos
simulados.

## Qué hace

- **Acceso:** inicio de sesión con validación y mensaje de credenciales incorrectas.
- **Inicio:** temperatura en vivo con su rango, humedad y aire con su tendencia, las
  barras de las últimas 24 h y el estado y batería del dispositivo. Tiene variantes
  para cargando y sin conexión.
- **Detalle de variable:** medidor en vivo, mínimo, promedio y máximo, y la gráfica de
  24 h con el umbral (solo lectura). Se abre al tocar cualquier variable del Inicio.
- **Alertas:** pendientes, atendidas y descartadas del dispositivo, con filtros. El
  operador solo las consulta; las atiende su supervisor.
- **Detalle de alerta:** valor que la disparó, cuánto superó el límite, la curva
  alrededor del evento y su línea de tiempo.
- **Perfil:** datos de la cuenta y del supervisor, preferencias, tema claro u oscuro,
  diagnóstico de la API y cierre de sesión.

## Cómo funciona

1. Sin sesión, la app abre en Acceso. Al entrar, `SesionContext` guarda el token y el
   usuario mientras la app está abierta.
2. `AppNavigator` crea las pantallas a partir de `src/modules/index.js`: las que tienen
   `pestana` van en la barra inferior flotante (Inicio, Alertas, Perfil) y las demás
   se apilan encima (detalles y diagnóstico).
3. `OperadorProvider` (`hooks/useOperador.js`) pide una sola vez, y luego cada 30 s, el
   dispositivo asignado, sus últimas lecturas, sus umbrales y sus alertas; todas las
   pestañas leen de ahí.
4. Cada pantalla usa `Pantalla`: una zona oscura arriba con el dato principal y una
   hoja clara que sube sobre ella con el resto.
5. Cada servicio de `src/services/` decide: con `EXPO_PUBLIC_USE_MOCKS=true` responde
   `src/services/mock/`, que imita cada endpoint con la forma exacta del contrato; si
   no, llama a la API con el token. Las rutas salen siempre de `src/api/`.
6. `src/utils/convertir.js` traduce la forma del contrato a lo que muestran las
   pantallas (por ejemplo `PELIGRO` → «Crítico»).

Datos simulados:

- La sesión es la del operador Luis Ortega, con Núcleo T-01 asignado en Moldeo.
- Cualquier correo y contraseña inician sesión; `error@nucleo.mx` muestra el error de
  credenciales.
- Las lecturas varían ±0.1 cada 30 s para simular el «en vivo».
- `EXPO_PUBLIC_MOCK_ESTADO` en `Mobile/.env` fuerza un estado para revisar el diseño:
  `cargando`, `vacio` (sin alertas), `error` o `sinConexion` (el dispositivo deja de
  reportar). Vacío, la app funciona normal.

Los íconos salen únicamente de [Lucide](https://lucide.dev/icons/), con
`<Icon name="bell" />` de `src/components/ui`. La tipografía es Plus Jakarta Sans.

La web y la app móvil comparten el mismo backend. El contrato está en
[`Context/api/contrato-api.md`](../Context/api/contrato-api.md).

## Carpetas

```text
Mobile/
├── src/
│   ├── api/                    Rutas del backend como constantes, un archivo por módulo
│   ├── components/
│   │   ├── ui/                 Sistema de diseño en React Native: Icon, Logo, Button,
│   │   │                       Input, Chip, Tabs, Toggle, Badge, StatusBadge, Battery,
│   │   │                       Avatar, Card, Skeleton, ActivityFeed, Sparkline,
│   │   │                       TrendChart, TabBar
│   │   ├── Pantalla.js         Zona oscura + hoja clara de cada pantalla
│   │   └── …                   Medidor, BarraRango, Cabecera, Alerta, EstadoError,
│   │                           HealthStatusCard y ModuloBase
│   ├── context/                SesionContext (sesión) y TemaContext (tema claro u oscuro)
│   ├── hooks/                  useDatos, useOperador y useHealthCheck
│   ├── modules/                acceso, panel, mediciones, alertas, perfil y estado;
│   │                           index.js es el registro. dispositivos queda fuera de la
│   │                           navegación porque el operador ve su dispositivo en Inicio
│   ├── navigation/             AppNavigator: acceso, pestañas y pantallas apiladas
│   ├── services/               Un servicio por dominio y config.js (bandera de mocks y token)
│   │   ├── api/                Cliente HTTP (client.js) y salud
│   │   └── mock/               datos.js (datos de ejemplo) y handlers.js (endpoints simulados)
│   ├── utils/                  convertir.js, formato.js y formatDate.js
│   └── theme.js                Tokens de color, espacio, radios y tipografía
├── App.js                      Carga las fuentes y monta tema, sesión y navegación
├── index.js                    Registro de la app en Expo
├── app.json                    Nombre, identificadores y configuración
├── package.json                Comandos y dependencias
├── package-lock.json           Versiones exactas
├── .oxlintrc.json              Reglas de revisión
├── .env.example                Plantilla de configuración
└── README.md                   Este documento
```

## Comandos

Todos se ejecutan desde la carpeta principal del proyecto:

- `cp Mobile/.env.example Mobile/.env` — "crea la configuración local con los datos simulados activos."
- `cd Mobile && npm ci` — "instala Expo, React Native y las herramientas."
- `cd Mobile && npm start` — "abre Expo; muestra un código QR para abrir la app en el teléfono con Expo Go."
- `cd Mobile && npm run web` — "abre la app en el navegador, útil para revisar el diseño."
- `cd Mobile && npm run android` — "abre la app en un emulador Android."
- `cd Mobile && npm run ios` — "abre la app en un simulador iOS."
- `cd Mobile && npm run lint` — "revisa el código; no muestra avisos si todo está bien."
- `cd Mobile && npm run export:android` — "genera el paquete JavaScript de Android; no crea un APK."
- `cd Mobile && npm run export:web` — "genera la versión web estática en `dist/`."

Si cambias el `.env`, reinicia Expo con `npx expo start -c` para que lo vuelva a leer.

## URL de la API

- Emulador Android: `http://10.0.2.2:8000/api/v1`.
- Simulador iOS: `http://localhost:8000/api/v1`.
- Teléfono físico: `http://IP_LOCAL_DE_LA_COMPUTADORA:8000/api/v1`.

Para un teléfono físico, inicia Django con
`cd BackEnd && .venv/bin/python manage.py runserver 0.0.0.0:8000` y agrega la IP
local a `DJANGO_ALLOWED_HOSTS` en `BackEnd/.env`. El teléfono y la computadora deben
estar en la misma red y el firewall debe dejar pasar el puerto 8000.

Con `EXPO_PUBLIC_USE_MOCKS=false` se entra con las cuentas de `manage.py sembrar_demo`;
con `EXPO_PUBLIC_DEMO_PASSWORD=Nucleo2026` la pantalla de acceso las muestra para entrar
con un toque.

## Para profundizar

- [Contrato de la API](../Context/api/contrato-api.md)
- [Estructura de la app móvil](../Context/mobile/estructura-mobile.md)
- [Guía de desarrollo local](../Context/instalacion/guia-desarrollo-local.md)
- [Decisiones tecnológicas](../Context/decisiones-tecnicas/stack-tecnologico.md)
