# Mobile — Núcleo

> **En simple:** es la app del teléfono para el operador. Muestra en vivo el
> dispositivo que tiene asignado y sus alertas, y usa el mismo backend que la web.

Está hecha con Expo y React Native, con los componentes del sistema de diseño de
Núcleo reescritos para el teléfono (`src/components/ui/`). Tiene todas las pantallas
del diseño (`Docs/Mockups/nucleo-movil.html`) y funciona sin backend con datos
simulados.

## Qué hace

- **Acceso:** inicio de sesión con validación y mensaje de credenciales incorrectas, con Nico
  asomado sobre el formulario (imagen clara u oscura según el tema). «Solicita una cuenta» pide
  acceso a una organización y área sin tener cuenta; un administrador la aprueba desde la web.
- **Panel:** temperatura en vivo con su rango (el número cuenta hasta su valor y el punto «en
  vivo» late), humedad y aire con su tendencia, el estado del equipo (conexión, última lectura y
  batería), las barras de temperatura de 24 h o 7 días y las alertas recientes. La campana abre
  las notificaciones. Tiene variantes para cargando y sin conexión.
- **Detalle de variable:** medidor en vivo, mínimo, promedio y máximo, y la gráfica de
  24 h con el umbral (solo lectura). Se abre al tocar cualquier variable del Panel.
- **Alertas:** cuántas hay pendientes (críticas y advertencias), buscador, filtros y la lista
  agrupada por día. El administrador y el supervisor atienden una alerta deslizándola a la
  izquierda o la descartan deslizándola a la derecha (también desde su detalle); el operador
  solo las consulta.
- **Detalle de alerta:** valor que la disparó, cuánto superó el límite, la curva
  alrededor del evento, su línea de tiempo y, para quien puede, «Atender» y «Descartar».
- **Histórico:** una variable del dispositivo en 24 h, 7 o 30 días con su umbral, mínimo,
  promedio, máximo y el tiempo en rango; el botón CSV comparte las lecturas.
- **Nico AI:** preguntas sobre un dispositivo, un área o toda la organización (ADMIN y SUPER),
  elegidos en una hoja inferior; inicio con resumen del equipo y sugerencias reales; cada
  respuesta dice en qué se basa, se puede copiar, regenerar, calificar y abrir en Histórico;
  las alertas pendientes se atienden desde el chat y «Conversaciones» guarda las 50 últimas en
  el teléfono (buscador, renombrar y borrar). Supervisores, analistas y
  administradores también le piden reportes: el resumen aparece en el chat, con el PDF
  (se abre con el menú de compartir del teléfono) y el enlace al reporte en la web.
- **Reportes** (ADMIN, SUPER y ANALISTA, desde Mi perfil o un aviso): tarjetas con periodo,
  origen y cifras, filtros por origen y periodo, el PDF con el menú de compartir y «Envíos» con
  el historial de correos del reporte (destinatarios, resultado y error).
- **Notificaciones:** cada alerta nueva y cada alerta atendida o descartada, con «sin leer» y
  «Marcar todo como leído» (lo leído se guarda en el teléfono).
- **Mi perfil:** cuenta y supervisor; preferencias guardadas en el teléfono (reducir
  animaciones, push, sonido en alertas de peligro y tema claro, oscuro o del sistema);
  seguridad (sesiones abiertas, que se pueden cerrar, y cambio de contraseña); diagnóstico de
  la API y cierre de sesión.
- **Avisos:** con la app al frente, cada alerta nueva llega por el canal en vivo y se
  muestra como notificación (las de peligro con sonido y vibración si el perfil lo
  permite); al tocarla se abre su detalle. Con la app cerrada llegan por push.
- **Movimiento:** pantallas y bloques que entran escalonados, pestañas y filtros con pastilla
  que se desliza, barras que crecen, números que cuentan y «jalar para actualizar». Todo respeta
  «Reducir animaciones» y el ajuste del teléfono.

## Cómo funciona

1. Sin sesión, la app abre en Acceso. Al entrar, `SesionContext` guarda el token y el
   usuario mientras la app está abierta.
2. `AppNavigator` crea las pantallas a partir de `src/modules/index.js`: las que tienen
   `pestana` van en la barra inferior flotante (Panel, Alertas, Histórico, Nico AI y Mi perfil)
   y las demás se apilan encima (detalles, notificaciones, sesiones, contraseña y diagnóstico).
3. `OperadorProvider` (`hooks/useOperador.js`) pide el dispositivo a la vista, sus
   últimas lecturas, sus umbrales y las alertas; todas las pestañas leen de ahí. Con la
   app al frente abre el canal en vivo (`services/tiempoReal.js`) y consulta cada 30 s de
   respaldo. En segundo plano cierra el canal y deja de consultar.
   Los push (`services/notificaciones.js`) necesitan `EXPO_PUBLIC_EAS_PROJECT_ID` en
   `eas.json` y `google-services.json` en `Mobile/` (ver `deploy/README.md`); sin ellos la
   app no registra el teléfono y solo avisa con el canal en vivo.
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
│   ├── context/                SesionContext (sesión), TemaContext (tema claro u oscuro) y
│   │                           PreferenciasContext (preferencias y useAnimaciones)
│   ├── hooks/                  useDatos, useOperador, useAvisos y useHealthCheck
│   ├── modules/                acceso (con la solicitud de cuenta), panel, historico,
│   │                           mediciones, alertas, agente, notificaciones, perfil y estado;
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
