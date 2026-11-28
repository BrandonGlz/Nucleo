import { ANALITICA_CONSULTA, ANALITICA_HALLAZGOS, TABLEROS_ANALITICA } from '../api'
import { pagina } from '../utils/convertir'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/analitica'

// Tableros de Analítica de la organización y plantillas del sistema (solo consulta en la app).
export async function tableros() {
  if (USAR_MOCKS) return pagina(await mock.tableros())
  return pagina(await pedir(TABLEROS_ANALITICA))
}

// Calcula en vivo las tarjetas de una página con el alcance y los filtros elegidos.
export async function consultar({ tarjetas, filtros, cruzado = null }) {
  if (USAR_MOCKS) return mock.consulta({ tarjetas, filtros, cruzado })
  return pedir(ANALITICA_CONSULTA, { metodo: 'POST', cuerpo: { tarjetas, filtros, cruzado } })
}

// Hallazgos de Nico AI para la página actual (la tarjeta se pide bajo demanda).
export async function hallazgos({ tarjetas, filtros, cruzado = null }) {
  if (USAR_MOCKS) return mock.hallazgos({ tarjetas, filtros, cruzado })
  return pedir(ANALITICA_HALLAZGOS, { metodo: 'POST', cuerpo: { tarjetas, filtros, cruzado } })
}
