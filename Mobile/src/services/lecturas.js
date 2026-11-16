import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { LECTURAS, LECTURAS_EXPORTAR, LECTURAS_SERIE } from '../api'
import { API_BASE_URL } from './api/client'
import { pagina } from '../utils/convertir'
import { USAR_MOCKS, leerToken, pedir } from './config'
import * as mock from './mock/handlers'

const DIA = 24 * 3600 * 1000

// Serie agregada de una variable. intervalo: 'hora' (últimas 24 h) o 'minuto' (alrededor de una alerta).
export async function serie(dispositivo, variable, { intervalo = 'hora', desde, hasta } = {}) {
  const params = { dispositivo, variable, intervalo, desde, hasta }
  if (USAR_MOCKS) return mock.serie(params)
  return pedir(LECTURAS_SERIE, { params })
}

// Las 24 h más recientes con datos, como en la web: si el dispositivo dejó de enviar lecturas hace más
// de un día, se muestran las 24 h que terminan en su última lectura guardada. Devuelve
// { puntos, ultima }; ultima solo viene cuando se recorrió el rango (para avisar de cuándo son).
export async function serieConDatos(dispositivo, variable) {
  const desde = new Date(Date.now() - DIA).toISOString()
  if (USAR_MOCKS) return { puntos: await serie(dispositivo, variable, { desde }), ultima: null }
  const [ultima] = pagina(await pedir(LECTURAS, { params: { dispositivo, variable, page_size: 1 } }))
  if (!ultima || new Date(ultima.fecha_hora) >= new Date(desde)) {
    return { puntos: await serie(dispositivo, variable, { desde }), ultima: null }
  }
  const fin = new Date(ultima.fecha_hora).getTime()
  const puntos = await serie(dispositivo, variable, {
    desde: new Date(fin - DIA).toISOString(),
    hasta: new Date(fin + 1000).toISOString(),
  })
  return { puntos, ultima: ultima.fecha_hora }
}

// CSV de lecturas (el mismo de la web): se descarga con el token de la sesión y se abre el menú
// del teléfono para guardarlo o compartirlo.
export async function compartirCsv(dispositivo, variable, desde) {
  if (USAR_MOCKS) throw new Error('Sin CSV en modo simulado.')
  const query = `?dispositivo=${dispositivo}&variable=${variable}&desde=${encodeURIComponent(desde)}`
  const destino = `${cacheDirectory}lecturas-${variable.toLowerCase()}-${dispositivo}.csv`
  const r = await downloadAsync(`${API_BASE_URL}${LECTURAS_EXPORTAR}${query}`, destino, {
    headers: { Authorization: `Token ${leerToken()}` },
  })
  if (r.status !== 200) throw new Error(`La API respondió con el estado ${r.status}.`)
  await Sharing.shareAsync(r.uri, { mimeType: 'text/csv', dialogTitle: 'Lecturas en CSV' })
}
