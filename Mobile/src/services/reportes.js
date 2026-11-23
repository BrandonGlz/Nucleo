import { Linking, Platform } from 'react-native'
import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { AREAS, REPORTE_PDF, REPORTES } from '../api'
import { API_BASE_URL } from './api/client'
import { pagina } from '../utils/convertir'
import { USAR_MOCKS, leerToken, pedir } from './config'

// Roles que ven reportes (como la ruta /reportes de la web y ReporteViewSet en la API).
export const ROLES_REPORTES = ['ADMIN', 'SUPER', 'ANALISTA']
export const puedeVerReportes = (u) => !!u?.organizacion && ROLES_REPORTES.includes(u.rol)

// Reportes a la vista de la cuenta (la API ya filtra: el administrador, los de su organización;
// supervisor y analista, los de su área), del más reciente al más antiguo, con el nombre del área.
export async function lista() {
  if (USAR_MOCKS) return []
  const [reportes, areas] = await Promise.all([pedir(REPORTES), pedir(AREAS).then(pagina).catch(() => [])])
  const nombres = Object.fromEntries(areas.map((a) => [a.num, a.nombre]))
  return pagina(reportes)
    .map((r) => ({ ...r, area_nombre: r.area ? (nombres[r.area] ?? `Área ${r.area}`) : 'Todas las áreas' }))
    .sort((a, b) => (a.fecha_generacion < b.fecha_generacion ? 1 : -1))
}

// PDF del reporte (el mismo que va en los correos) con el token de la sesión. En el teléfono se guarda
// en la caché y se abre el menú para verlo, guardarlo o compartirlo; en la web se abre en otra pestaña.
export async function abrirPdf(num) {
  if (USAR_MOCKS) throw new Error('Sin PDF en modo simulado.')
  const url = `${API_BASE_URL}${REPORTE_PDF(num)}`
  const headers = { Authorization: `Token ${leerToken()}` }
  if (Platform.OS === 'web') {
    const r = await fetch(url, { headers })
    if (!r.ok) throw new Error(`La API respondió con el estado ${r.status}.`)
    const enlace = URL.createObjectURL(await r.blob())
    window.open(enlace, '_blank')
    setTimeout(() => URL.revokeObjectURL(enlace), 60000)
    return
  }
  const r = await downloadAsync(url, `${cacheDirectory}reporte-${num}.pdf`, { headers })
  if (r.status !== 200) throw new Error(`La API respondió con el estado ${r.status}.`)
  await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Reporte R-${num}` })
}

// El reporte completo (con sus formatos) vive en la web: se abre en el navegador.
export const verEnWeb = (num) => Linking.openURL(`${API_BASE_URL.replace(/\/api\/v\d+$/, '')}/reportes?reporte=${num}`)
