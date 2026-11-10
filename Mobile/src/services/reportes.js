import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { Linking } from 'react-native'
import { REPORTE_PDF } from '../api'
import { API_BASE_URL } from './api/client'
import { USAR_MOCKS, leerToken } from './config'

// PDF del reporte (el mismo que va en los correos): se descarga con el token de la sesión y se
// abre el menú del teléfono para verlo, guardarlo o compartirlo.
export async function abrirPdf(num) {
  if (USAR_MOCKS) throw new Error('Sin PDF en modo simulado.')
  const destino = `${cacheDirectory}reporte-${num}.pdf`
  const r = await downloadAsync(`${API_BASE_URL}${REPORTE_PDF(num)}`, destino, {
    headers: { Authorization: `Token ${leerToken()}` },
  })
  if (r.status !== 200) throw new Error(`La API respondió con el estado ${r.status}.`)
  await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Reporte R-${num}` })
}

// El reporte completo (con sus formatos) vive en la web: se abre en el navegador.
export const verEnWeb = (num) => Linking.openURL(`${API_BASE_URL.replace(/\/api\/v\d+$/, '')}/reportes?reporte=${num}`)
