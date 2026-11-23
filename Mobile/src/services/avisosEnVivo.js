import * as avisosApi from './avisos'
import { pagina } from '../utils/convertir'

// Avisos del sistema de la campana (dispositivos, usuarios, reportes, Nico AI) en memoria, para
// todas las pantallas. Se piden al entrar y al volver la app al frente (useOperador) y cada vez
// que se abre el Panel o la campana (useAvisos); los nuevos llegan por el canal en vivo
// (`aviso.nuevo`). Una consulta a la vez.
let avisos = []
const oyentes = new Set()
const avisar = () => oyentes.forEach((f) => f(avisos))

export const avisosActuales = () => avisos
export function escucharAvisos(f) {
  oyentes.add(f)
  return () => oyentes.delete(f)
}
export function cambiarAvisos(nuevos) {
  avisos = nuevos
  avisar()
}

let pidiendo = null
// Cambia al olvidar los avisos: una consulta que salió con la cuenta anterior no los repone.
let generacion = 0
export function recargarAvisos() {
  if (pidiendo) return pidiendo
  const deEsta = generacion
  const consulta = avisosApi
    .lista()
    .then((r) => deEsta === generacion && cambiarAvisos(pagina(r)))
    .catch(() => {})
    .finally(() => {
      if (pidiendo === consulta) pidiendo = null
    })
  pidiendo = consulta
  return consulta
}
// Aviso que llega por el canal en vivo: se agrega arriba (si ya estaba, se reemplaza).
export function agregarAviso(aviso) {
  if (!aviso?.num) return
  cambiarAvisos([aviso, ...avisos.filter((v) => v.num !== aviso.num)])
}
// Al cerrar la sesión (o cambiar de cuenta) los avisos de esa cuenta se olvidan.
export const olvidarAvisos = () => {
  generacion++
  pidiendo = null
  cambiarAvisos([])
}
