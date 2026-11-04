// Rutas de la API de Núcleo (Context/api/contrato-api.md), un archivo por módulo.
// Son relativas a la URL base (EXPO_PUBLIC_API_BASE_URL), que ya incluye /api/v1, y se usan con
// apiRequest de services/api/client.js. Las rutas de un registro concreto son funciones
// que reciben su número: DISPOSITIVO(num).
// Esta carpeta es igual en FrontEnd/src/api y Mobile/src/api: si cambia una, cambia la otra.
//
// import { DISPOSITIVOS, DISPOSITIVO } from '../api'
// import { ALERTA_ATENDER } from '../api/alertas'
export * from './salud'
export * from './catalogos'
export * from './acceso'
export * from './organizaciones'
export * from './usuarios'
export * from './dispositivos'
export * from './umbrales'
export * from './mediciones'
export * from './alertas'
export * from './reportes'
export * from './tiempoReal'
