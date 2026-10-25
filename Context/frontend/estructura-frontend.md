# Estructura del frontend

## Tecnologías

- React 19.3.1 y React DOM 19.3.1.
- React Router (`react-router-dom` 7) para la navegación entre módulos.
- Vite 8.3.5.
- JavaScript con JSX.
- npm 11.16.0; `package-lock.json` fija el árbol instalado.
- Oxlint para análisis estático.

La aplicación se creó con el scaffolding oficial de Vite y se adaptó a la
estructura de Núcleo. No se añadieron librerías de UI. Es el cliente web; la app
móvil vive en `Mobile/` y comparte el contrato de `Context/api/contrato-api.md`.

## Organización

```text
FrontEnd/
├── public/favicon.svg
├── src/
│   ├── assets/           # recursos locales (vacío por ahora)
│   ├── components/
│   │   ├── HealthStatusCard.jsx
│   │   └── ModuloBase.jsx    # contenido provisional de cada módulo
│   ├── features/
│   │   ├── index.js          # registro de módulos (rutas y menú)
│   │   └── <modulo>/<Modulo>Page.jsx   # acceso, panel, dispositivos, mediciones,
│   │                         # alertas, reportes, usuarios, organizaciones
│   ├── hooks/
│   │   └── useHealthCheck.js
│   ├── layouts/
│   │   └── MainLayout.jsx    # encabezado, menú y zona de contenido
│   ├── pages/
│   │   └── HomePage.jsx
│   ├── services/
│   │   └── api/
│   │       ├── client.js # URL base, fetch y manejo de errores
│   │       └── health.js # llamada a /health/
│   ├── styles/global.css
│   ├── utils/formatDate.js
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

`src/features/index.js` exporta la lista `modulos` (`ruta`, `titulo`, `Pagina`).
`App.jsx` crea una `Route` por cada entrada y `MainLayout` genera el menú con la
misma lista; la ruta `/` muestra `HomePage` con el estado de la API. Cada página de
módulo usa `ModuloBase`, que muestra «Hola mundo, este es el módulo de…», su
descripción y su carpeta de trabajo. Para agregar un módulo: crear su carpeta y
página y añadir una línea al registro.

Los módulos todavía no tienen implementación: no hay sesión, llamadas de negocio
ni conexión en vivo. Cuando se implementen usarán `services/api/client.js` y el
contrato de la API.

## Configuración de la API

`VITE_API_BASE_URL` se define en `FrontEnd/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

`src/services/api/client.js` elimina la barra final, centraliza `fetch` y expone
errores claros. Si la variable no está definida, usa el mismo valor por defecto
de desarrollo.

`src/hooks/useHealthCheck.js` consulta `GET /api/v1/health/` al montar la página,
cancela peticiones anteriores con `AbortController` y ofrece una acción de
reintento. La pantalla inicial muestra el estado del backend sin impedir que el
frontend arranque si la API está detenida.

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

No se configuró un framework de pruebas porque todavía no existe lógica de
negocio. La compilación y el lint se verifican durante la preparación.

## Pendientes

- Implementar cada módulo (hoy muestran una pantalla provisional) y el dashboard.
- Conectar el canal en vivo `ws/panel/?token=` para alertas y cambios de estado
  (ver el contrato de la API).
- Implementar el inicio de sesión con `POST /auth/login/`, guardar el token y proteger las rutas según el rol.
- Añadir pruebas cuando se incorpore comportamiento propio.
- Definir estrategia de despliegue del build estático.
