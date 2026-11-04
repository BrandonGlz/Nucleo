import * as alertasApi from '../services/alertas'
import * as dispositivosApi from '../services/dispositivos'
import * as organizacionesApi from '../services/organizaciones'
import * as umbralesApi from '../services/umbrales'
import { pagina } from '../utils/convertir'
import { useDatos } from './useDatos'

// Todo lo que necesitan Panel y Dispositivos: dispositivos con sus últimas lecturas, umbrales,
// áreas y alertas. Se vuelve a pedir cada 30 s para mostrar las lecturas «en vivo».
export async function cargarMonitoreo() {
  const [disp, umb, areas, alertas] = await Promise.all([
    dispositivosApi.lista(),
    umbralesApi.lista(),
    organizacionesApi.areas(),
    alertasApi.lista(),
  ])
  const dispositivos = pagina(disp)
  const lecturas = await Promise.all(dispositivos.map((d) => dispositivosApi.ultimasLecturas(d.num)))
  return {
    dispositivos: dispositivos.map((d, i) => ({ ...d, lecturas: lecturas[i] })),
    umbrales: pagina(umb),
    areas: pagina(areas),
    alertas: pagina(alertas),
  }
}

export const useMonitoreo = (opciones = {}) =>
  useDatos(cargarMonitoreo, [], { cadaMs: 30000, ...opciones })
