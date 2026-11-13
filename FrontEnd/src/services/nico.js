import {
  NICO_ARBOL,
  NICO_BANCO,
  NICO_DOCUMENTO,
  NICO_DOCUMENTO_GENERAR,
  NICO_SUGERENCIAS,
  NICO_DOCUMENTOS,
  NICO_HERRAMIENTA,
  NICO_HERRAMIENTAS,
  NICO_INCLUIDAS,
  NICO_REGISTRO,
  NICO_RESPUESTA,
  NICO_RESUMEN,
} from '../api'
import { pedir } from './config'

// Consola de Nico AI: solo con sesión de superusuario.
const limpio = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))

export const arbol = () => pedir(NICO_ARBOL)
export const resumen = () => pedir(NICO_RESUMEN)
export const incluidas = () => pedir(NICO_INCLUIDAS)

export const banco = (params = {}) => pedir(NICO_BANCO, { params: { page_size: 200, ...limpio(params) } })
export const crearRespuesta = (datos) => pedir(NICO_BANCO, { metodo: 'POST', cuerpo: datos })
export const editarRespuesta = (num, datos) => pedir(NICO_RESPUESTA(num), { metodo: 'PATCH', cuerpo: datos })
export const borrarRespuesta = (num) => pedir(NICO_RESPUESTA(num), { metodo: 'DELETE' })

export const registro = (params = {}) => pedir(NICO_REGISTRO, { params: limpio(params) })

export const herramientas = () => pedir(NICO_HERRAMIENTAS)
export const ajustarHerramienta = (nombre, datos) => pedir(NICO_HERRAMIENTA(nombre), { metodo: 'PATCH', cuerpo: datos })

export const documentos = () => pedir(NICO_DOCUMENTOS)
export const editarDocumento = (num, datos) => pedir(NICO_DOCUMENTO(num), { metodo: 'PATCH', cuerpo: datos })
export const generarRespuestas = (num, seccion) => pedir(NICO_DOCUMENTO_GENERAR(num), { metodo: 'POST', cuerpo: { seccion } })
export const estadoGenerar = (num, seccion) => pedir(`${NICO_DOCUMENTO_GENERAR(num)}?seccion=${encodeURIComponent(seccion)}`)
export const ajusteSugerencias = (dispositivo) => pedir(NICO_SUGERENCIAS, { params: dispositivo ? { dispositivo } : {} })
export const guardarSugerencias = (datos) => pedir(NICO_SUGERENCIAS, { metodo: 'PATCH', cuerpo: datos })
