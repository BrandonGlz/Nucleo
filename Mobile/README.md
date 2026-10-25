# Mobile — Núcleo

> **En simple:** es la app del teléfono. Muestra la misma información que la web
> y usa el mismo backend; no guarda datos ni se conecta directo a la base.

Está hecha con Expo y React Native. Es un esqueleto: cada módulo ya tiene su
carpeta, su pantalla y su acceso desde el inicio, y muestra «Hola mundo, este es
el módulo de…» hasta que se implemente.

## Qué hace

- **Hoy:** muestra si la API está disponible, una lista de módulos y una pantalla
  provisional por módulo (acceso, panel, dispositivos, mediciones y alertas) con
  navegación entre ellas (React Navigation).
- **Después:** cada equipo reemplaza la pantalla provisional de su módulo (inicio
  de sesión con el token de la API, datos en tiempo real del dispositivo asignado,
  historial de las últimas 24 horas, alertas y modo de bajo consumo).
- **Todavía no:** no tiene sesión, datos de negocio, notificaciones push ni
  compilación firmada para tiendas.

## Cómo funciona

1. La app abre en `HomeScreen` y consulta `GET /api/v1/health/`.
2. Si el backend responde, muestra **API disponible**; si no, el error y la opción
   de volver a comprobar.
3. Debajo aparece un botón por cada módulo de `src/modules/index.js`;
   `AppNavigator` registra una pantalla por cada uno.
4. La URL de la API se configura en `Mobile/.env`.

Para agregar un módulo: crear `src/modules/<modulo>/<Modulo>Screen.js` y una línea
en `src/modules/index.js`; la pantalla y el botón aparecen solos.

La web y la app móvil comparten el mismo backend. El contrato está en
[`Context/api/contrato-api.md`](../Context/api/contrato-api.md).

## Carpetas

```text
Mobile/
├── src/
│   ├── components/             Piezas visuales reutilizables (ModuloBase, tarjeta de salud)
│   ├── hooks/                  Lógica de React con estado
│   ├── modules/                Un módulo por carpeta: acceso, panel, dispositivos,
│   │                           mediciones y alertas; index.js es el registro
│   ├── navigation/             AppNavigator: pantallas y navegación
│   ├── screens/                Pantalla de inicio
│   ├── services/api/           Comunicación con el backend
│   ├── utils/                  Funciones pequeñas
│   └── theme.js                Colores y radios
├── App.js                      Punto de entrada visual
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

- `cp Mobile/.env.example Mobile/.env` — "crea la configuración local; ajusta la URL de la API."
- `cd Mobile && npm ci` — "instala Expo, React Native y las herramientas."
- `cd Mobile && npm start` — "abre Expo; muestra un código QR para el teléfono."
- `cd Mobile && npm run android` — "abre la app en un emulador Android."
- `cd Mobile && npm run ios` — "abre la app en un simulador iOS."
- `cd Mobile && npm run lint` — "revisa el código; no muestra avisos si todo está bien."
- `cd Mobile && npm run export:android` — "genera el paquete JavaScript de Android; no crea un APK."

## URL de la API

- Emulador Android: `http://10.0.2.2:8000/api/v1`.
- Simulador iOS: `http://localhost:8000/api/v1`.
- Teléfono físico: `http://IP_LOCAL_DE_LA_COMPUTADORA:8000/api/v1`.

Para un teléfono físico, inicia Django con
`cd BackEnd && .venv/bin/python manage.py runserver 0.0.0.0:8000` y agrega la IP
local a `DJANGO_ALLOWED_HOSTS` en `BackEnd/.env`.

## Para profundizar

- [Contrato de la API](../Context/api/contrato-api.md)
- [Estructura de la app móvil](../Context/mobile/estructura-mobile.md)
- [Guía de desarrollo local](../Context/instalacion/guia-desarrollo-local.md)
- [Decisiones tecnológicas](../Context/decisiones-tecnicas/stack-tecnologico.md)
