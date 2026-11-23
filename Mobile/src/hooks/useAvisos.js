import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import * as avisosApi from '../services/avisos'
import { avisosActuales, cambiarAvisos, escucharAvisos, recargarAvisos } from '../services/avisosEnVivo'
import { useOperador } from './useOperador'

// Centro de avisos de la app (campana del Panel), como la campana de la web:
// - Alertas: cada alerta nueva y cada cambio de estado (atendida o descartada) de las alertas a la
//   vista. Lo leído se guarda en el teléfono: la fecha de la última vez que se marcó todo (lo
//   posterior cuenta como «sin leer») y las que se abrieron una por una.
// - Avisos del sistema (GET /avisos/): dispositivos, usuarios, reportes y Nico AI. Traen `leido`
//   de la API y viven en services/avisosEnVivo (los nuevos llegan por el canal en vivo).
const CLAVE = 'nucleo.avisosVistos'
const CLAVE_LEIDOS = 'nucleo.avisosLeidos'
const MAX_LEIDOS = 300
let vistos = null
let leidos = new Set()
const oyentes = new Set()
const avisar = () => oyentes.forEach((f) => f({ vistos, leidos }))
AsyncStorage.multiGet([CLAVE, CLAVE_LEIDOS])
  .then(([[, v], [, l]]) => {
    // La primera vez solo cuenta lo que llegue desde ahora (no todo el historial como «sin leer»).
    vistos = v ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    if (!v) AsyncStorage.setItem(CLAVE, vistos).catch(() => {})
    try {
      leidos = new Set(JSON.parse(l) || [])
    } catch {
      leidos = new Set()
    }
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

const guardarLeidos = () => {
  if (leidos.size > MAX_LEIDOS) leidos = new Set([...leidos].slice(-MAX_LEIDOS))
  AsyncStorage.setItem(CLAVE_LEIDOS, JSON.stringify([...leidos])).catch(() => {})
}

export function useAvisos() {
  const { datos } = useOperador()
  const [estado, setEstado] = useState({ vistos, leidos })
  const [avisos, setAvisos] = useState(avisosActuales)
  useEffect(() => {
    oyentes.add(setEstado)
    const dejar = escucharAvisos(setAvisos)
    recargarAvisos()
    return () => {
      oyentes.delete(setEstado)
      dejar()
    }
  }, [])
  const deAlertas = avisosDe(datos?.alertas).map((x) => ({
    ...x,
    nuevo: !!estado.vistos && x.fecha > estado.vistos && !estado.leidos.has(x.id),
  }))
  const deSistema = avisos.map((v) => ({ id: `v-${v.num}`, tipo: 'aviso', fecha: v.fecha_hora, aviso: v, nuevo: !v.leido }))
  const lista = [...deAlertas, ...deSistema].sort((x, y) => (x.fecha < y.fecha ? 1 : -1))

  // Se marca de inmediato en pantalla; si la API falla, la siguiente consulta lo corrige.
  const marcarLeido = (x) => {
    if (!x?.nuevo) return
    if (x.aviso) {
      cambiarAvisos(avisosActuales().map((v) => (v.num === x.aviso.num ? { ...v, leido: true } : v)))
      avisosApi.marcarLeidos([x.aviso.num]).catch(() => {})
    } else {
      leidos = new Set(leidos).add(x.id)
      guardarLeidos()
      avisar()
    }
  }
  const marcarTodo = () => {
    vistos = new Date().toISOString()
    AsyncStorage.setItem(CLAVE, vistos).catch(() => {})
    leidos = new Set()
    guardarLeidos()
    if (avisosActuales().some((v) => !v.leido)) {
      cambiarAvisos(avisosActuales().map((v) => ({ ...v, leido: true })))
      avisosApi.marcarLeidos().catch(() => {})
    }
    avisar()
  }
  return { avisos: lista, sinLeer: lista.filter((x) => x.nuevo).length, marcarLeido, marcarTodo }
}
