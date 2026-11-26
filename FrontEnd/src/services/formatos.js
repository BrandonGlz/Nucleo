import {
  FORMATO_AREAS,
  FORMATO_DUPLICAR,
  FORMATO_PREDETERMINADO,
  FORMATO_REPORTE,
  FORMATO_VERSIONES,
  FORMATOS_REPORTE,
} from '../api'
import { pagina } from '../utils/convertir'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// La API devuelve la forma del contrato; la interfaz usa `id` como texto y nombres cortos.
export const preparar = (formato) => ({
  ...formato,
  id: String(formato.num),
  esPlantilla: Boolean(formato.es_plantilla),
  areasPredeterminado: formato.areas_predeterminado ?? [],
})

export async function lista({ archivados = false } = {}) {
  if (USAR_MOCKS) return pagina(await mock.formatos({ archivados })).map(preparar)
  const respuesta = await pedir(FORMATOS_REPORTE, {
    params: archivados ? { archivados: 1 } : undefined,
  })
  return pagina(respuesta).map(preparar)
}

export async function crear(datos) {
  if (USAR_MOCKS) return preparar(await mock.crearFormato(datos))
  return preparar(await pedir(FORMATOS_REPORTE, { metodo: 'POST', cuerpo: datos }))
}

export async function actualizar(num, datos) {
  if (USAR_MOCKS) return preparar(await mock.actualizarFormato(num, datos))
  return preparar(await pedir(FORMATO_REPORTE(num), { metodo: 'PATCH', cuerpo: datos }))
}

export async function archivar(num) {
  if (USAR_MOCKS) return mock.archivarFormato(num)
  return pedir(FORMATO_REPORTE(num), { metodo: 'DELETE' })
}

export async function duplicar(num, datos = {}) {
  if (USAR_MOCKS) return preparar(await mock.duplicarFormato(num, datos))
  return preparar(await pedir(FORMATO_DUPLICAR(num), { metodo: 'POST', cuerpo: datos }))
}

export async function predeterminado(num) {
  if (USAR_MOCKS) return preparar(await mock.predeterminadoFormato(num))
  return preparar(await pedir(FORMATO_PREDETERMINADO(num), { metodo: 'POST' }))
}

export async function areas(num, areasElegidas) {
  if (USAR_MOCKS) return preparar(await mock.areasFormato(num, areasElegidas))
  return preparar(
    await pedir(FORMATO_AREAS(num), {
      metodo: 'POST',
      cuerpo: { areas: areasElegidas },
    }),
  )
}

export async function versiones(num) {
  if (USAR_MOCKS) return mock.versionesFormato(num)
  return pedir(FORMATO_VERSIONES(num))
}
