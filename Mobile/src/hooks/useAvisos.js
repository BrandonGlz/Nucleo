import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { useOperador } from './useOperador'

// Centro de avisos de la app (campana del Panel): cada alerta nueva y cada cambio de estado
// (atendida o descartada) de las alertas a la vista. Lo leído se guarda en el teléfono como la
// fecha de la última vez que se marcó todo; lo posterior cuenta como «sin leer».
const CLAVE = 'nucleo.avisosVistos'
let vistos = null
const oyentes = new Set()
const avisar = () => oyentes.forEach((f) => f(vistos))
AsyncStorage.getItem(CLAVE)
  .then((v) => {
    // La primera vez solo cuenta lo que llegue desde ahora (no todo el historial como «sin leer»).
    vistos = v ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    if (!v) AsyncStorage.setItem(CLAVE, vistos).catch(() => {})
    avisar()
  })
  .catch(() => {})

export function avisosDe(alertas = []) {
  const lista = []
  for (const a of alertas) {
    lista.push({ id: `n-${a.num}`, tipo: 'nueva', fecha: a.fecha_hora, alerta: a })
    if (a.estado !== 'PENDIENTE' && a.fecha_atencion) {
      lista.push({ id: `e-${a.num}`, tipo: a.estado === 'ATENDIDA' ? 'atendida' : 'descartada', fecha: a.fecha_atencion, alerta: a })
    }
  }
  return lista.sort((x, y) => (x.fecha < y.fecha ? 1 : -1)).slice(0, 60)
}

export function useAvisos() {
  const { datos } = useOperador()
  const [marca, setMarca] = useState(vistos)
  useEffect(() => {
    oyentes.add(setMarca)
    return () => oyentes.delete(setMarca)
  }, [])
  const avisos = avisosDe(datos?.alertas).map((x) => ({ ...x, nuevo: !!marca && x.fecha > marca }))
  const marcarTodo = () => {
    vistos = new Date().toISOString()
    AsyncStorage.setItem(CLAVE, vistos).catch(() => {})
    avisar()
  }
  return { avisos, sinLeer: avisos.filter((x) => x.nuevo).length, marcarTodo }
}
