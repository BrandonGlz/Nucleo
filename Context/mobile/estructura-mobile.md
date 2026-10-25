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
│   ├── components/HealthStatusCard.js
│   ├── components/ModuloBase.js
│   ├── hooks/useHealthCheck.js
│   ├── modules/index.js            # registro de módulos
│   ├── modules/<modulo>/<Modulo>Screen.js   # acceso, panel, dispositivos, mediciones, alertas
│   ├── navigation/AppNavigator.js
│   ├── screens/HomeScreen.js
│   ├── services/api/client.js
│   ├── services/api/health.js
│   ├── utils/formatDate.js
│   └── theme.js
├── App.js
├── index.js
├── app.json
├── package.json
├── package-lock.json
├── .oxlintrc.json
└── .env.example
```

- `App.js` envuelve la app en `SafeAreaProvider` y monta `AppNavigator`.
- `AppNavigator` usa `@react-navigation/native-stack`: la pantalla `Inicio` y una
  pantalla por cada entrada de `modules/index.js`.
- `HomeScreen` muestra el estado de la API y un botón por módulo.
- `ModuloBase` es el contenido provisional de cada módulo («Hola mundo, este es el
  módulo de…»); al implementar un módulo se reemplaza por su pantalla real.
- `HealthStatusCard` presenta el estado de la API.
- `useHealthCheck` consulta el backend y permite reintentar.
- `client.js` centraliza la URL, el manejo de errores y `fetch`.
- `theme.js` concentra colores y radios para no repetirlos.

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
(`Authorization: Token <token>`, ver el contrato de la API); la sesión del
módulo `acceso` todavía no está implementada. No se deben guardar contraseñas en
el dispositivo. En producción la API debe servirse por HTTPS.

## Comandos

```bash
cp Mobile/.env.example Mobile/.env
cd Mobile && npm ci
cd Mobile && npm start
cd Mobile && npm run android
cd Mobile && npm run ios
cd Mobile && npm run lint
cd Mobile && npm run export:android
```

`npm start` abre Expo y muestra un código QR. `npm run android` e
`npm run ios` requieren el emulador o simulador correspondiente.

## Verificación realizada

- `npm run lint`: sin avisos.
- `npx expo install --check`: dependencias alineadas con SDK 58 (expo 58.0.19).
- `npx expo-doctor`: 20 de 20 comprobaciones correctas.
- `npx expo export --platform android`: bundle de 872 módulos generado.
- No se probó en un teléfono ni emulador real.

`npm audit` reporta 5 vulnerabilidades altas en dependencias transitivas de
Expo CLI (`node-forge` y `zod`). No se aplicó `npm audit fix --force` porque
puede romper la compatibilidad del SDK; conviene revisarlas al actualizar Expo.

## Pendientes

- Implementar cada módulo (hoy muestran una pantalla provisional): inicio de sesión
  con almacenamiento seguro del token, panel, dispositivos, mediciones y alertas.
- Conexión en vivo (`/ws/panel/`) y registro del teléfono para push.
- Notificaciones, modo sin conexión y pruebas en dispositivos reales.
- Compilación firmada y publicación en tiendas.
