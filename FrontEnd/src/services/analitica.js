import { ANALITICA_CONSULTA, ANALITICA_CONSULTA_CSV, ANALITICA_HALLAZGOS, TABLEROS_ANALITICA, TABLERO_VERSIONES } from '../api'
import { API_BASE_URL, OPCIONES_SESION } from './api/client'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/analitica'
import { guardarArchivo } from './seguridad'

// Tableros de Analítica: plantillas del sistema y tableros activos de la organización.
export async function tableros() {
  if (USAR_MOCKS) return mock.tableros()
  return pedir(TABLEROS_ANALITICA)
}

export async function versionesTablero(num) {
  if (USAR_MOCKS) return mock.versionesTablero(num)
  return pedir(TABLERO_VERSIONES(num))
}

export async function crearTablero({ nombre, desde } = {}) {
  if (USAR_MOCKS) return mock.crearTablero({ nombre, desde })
  return pedir(TABLEROS_ANALITICA, { metodo: 'POST', cuerpo: { nombre, desde } })
}

// Calcula las tarjetas de una página en vivo. Recibe las tarjetas (no el tablero) para que el
// editor pueda consultar lo que aún no se guarda y para cancelar con AbortController.
export async function consultar({ tarjetas, filtros, cruzado = null, signal }) {
  const cuerpo = { tarjetas, filtros, cruzado }
  if (USAR_MOCKS) return mock.consulta(cuerpo, { signal })
  return pedir(ANALITICA_CONSULTA, { metodo: 'POST', cuerpo, signal })
}

// Descarga el CSV de una tarjeta; la API ya neutraliza fórmulas y pone el nombre del archivo.
export async function descargarCsvTarjeta({ tarjeta, filtros, cruzado = null }) {
  if (USAR_MOCKS) {
    const { contenido, nombre } = mock.csvTarjeta({ tarjeta, filtros, cruzado })
    guardarArchivo(new Blob([contenido], { type: 'text/csv;charset=utf-8' }), nombre)
    return
  }
  const respuesta = await fetch(`${API_BASE_URL}${ANALITICA_CONSULTA_CSV}`, {
    ...OPCIONES_SESION,
    method: 'POST',
    headers: { ...OPCIONES_SESION.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tarjeta, filtros, cruzado }),
  })
  if (!respuesta.ok) throw new Error(`La API respondió con el estado ${respuesta.status}.`)
  const nombre =
    /filename="([^"]+)"/.exec(respuesta.headers.get('Content-Disposition') || '')?.[1] ||
    'analitica.csv'
  guardarArchivo(await respuesta.blob(), nombre)
}

// Hallazgos de Nico AI para la página actual (la tarjeta se pide bajo demanda).
export async function hallazgos({ tarjetas, filtros, cruzado = null }) {
  if (USAR_MOCKS) return mock.hallazgos({ tarjetas, filtros, cruzado })
  return pedir(ANALITICA_HALLAZGOS, { metodo: 'POST', cuerpo: { tarjetas, filtros, cruzado } })
}
