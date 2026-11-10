import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from './SesionContext'
import * as agenteApi from '../services/agente'
import * as dispositivosApi from '../services/dispositivos'
import { pagina } from '../utils/convertir'
import { hora } from '../utils/formato'

const AgenteContext = createContext(null)
const CLAVE = 'nucleo.agente.conversaciones'
const CLAVE_AGENTE = 'nucleo.agente.elegido'

// Identificador único para conversaciones y respuestas.
const nuevoId = (prefijo) => `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// Conversaciones guardadas en este navegador (comodidad de quien las usa; no se comparten).
function leer(clave, defecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? defecto
  } catch {
    return defecto
  }
}
function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento dura lo que dure la página.
  }
}

// Conversaciones con el agente IA. Hay un agente por dispositivo (cada ESP32) y cada conversación
// guarda el suyo. Vive en el marco de la app para que la respuesta llegue aunque se cambie de pantalla.
export function AgenteProvider({ children }) {
  const [conversaciones, setConversaciones] = useState(() => leer(CLAVE, []))
  const [actual, setActual] = useState(null)
  const [estado, setEstado] = useState('listo')
  const [animada, setAnimada] = useState(null)
  const [dispositivos, setDispositivos] = useState([])
  const [agente, setAgenteEstado] = useState(() => leer(CLAVE_AGENTE, null))
  const turno = useRef(0)
  const { usuario } = useSesion()
  const conOrganizacion = Boolean(usuario?.organizacion)

  useEffect(() => {
    if (!conOrganizacion) return undefined
    let vivo = true
    dispositivosApi
      .lista()
      .then((r) => vivo && setDispositivos(pagina(r)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  },[conOrganizacion])

  // Si no hay agente elegido (o ya no existe), se usa el del primer dispositivo.
  const agenteValido = dispositivos.some((d) => d.num === agente) ? agente : (dispositivos[0]?.num ?? null)
  const dispositivoAgente = dispositivos.find((d) => d.num === agenteValido) ?? null

  const cambiar = useCallback((fn) => {
    setConversaciones((lista) => {
      const nueva = fn(lista).slice(0, 30)
      escribir(CLAVE, nueva)
      return nueva
    })
  }, [])
  const editar = useCallback(
    (id, fn) => cambiar((lista) => lista.map((c) => (c.id === id ? { ...c, mensajes: fn(c.mensajes) } : c))),
    [cambiar],
  )

  const detener = useCallback(() => {
    turno.current++
    setEstado('listo')
  }, [])

  const preguntar = useCallback(
    async (pregunta, base) => {
      if (!pregunta.trim() || estado === 'pensando' || !agenteValido) return
      let id = actual
      if (!id) {
        id = nuevoId('c')
        const conv = { id, titulo: pregunta.slice(0, 60), creada: new Date().toISOString(), agente: agenteValido, mensajes: [] }
        cambiar((lista) => [conv, ...lista])
        setActual(id)
      }
      const delAgente = conversaciones.find((c) => c.id === id)?.agente ?? agenteValido
      editar(id, (ms) => [...(base ?? ms), ...(base ? [] : [{ de: 'yo', texto: pregunta }])])
      setEstado('pensando')
      const mio = ++turno.current
      try {
        const r = await agenteApi.preguntar(pregunta, delAgente)
        if (mio !== turno.current) return
        const clave = nuevoId('r')
        setAnimada(clave)
        editar(id, (ms) => [...ms, { de: 'agente', hora: hora(new Date().toISOString()), ...r, clave }])
      } catch (e) {
        if (mio !== turno.current) return
        editar(id, (ms) => [...ms, { de: 'error', caido: e.status === 503, pregunta }])
      }
      setEstado('listo')
    },
    [actual, agenteValido, cambiar, conversaciones, editar, estado],
  )

  const nueva = useCallback(() => {
    detener()
    setActual(null)
  }, [detener])

  // Elegir otro agente abre una conversación nueva con él.
  const setAgente = useCallback(
    (num) => {
      const n = Number(num)
      setAgenteEstado(n)
      escribir(CLAVE_AGENTE, n)
      const conv = conversaciones.find((c) => c.id === actual)
      if (conv && conv.agente !== n) nueva()
    },
    [actual, conversaciones, nueva],
  )

  const abrir = useCallback(
    (id) => {
      const conv = conversaciones.find((c) => c.id === id)
      if (!conv) return
      if (id !== actual) detener()
      setActual(id)
      if (conv.agente) {
        setAgenteEstado(conv.agente)
        escribir(CLAVE_AGENTE, conv.agente)
      }
    },
    [actual, conversaciones, detener],
  )

  const borrar = useCallback(
    (id) => {
      cambiar((lista) => lista.filter((c) => c.id !== id))
      if (id === actual) nueva()
    },
    [actual, cambiar, nueva],
  )

  const valor = useMemo(() => {
    const conv = conversaciones.find((c) => c.id === actual) ?? null
    return {
      conversaciones,
      actual,
      conv,
      estado,
      pensando: estado === 'pensando',
      animada,
      dispositivos,
      agente: agenteValido,
      dispositivoAgente,
      nombreAgente: (num) => dispositivos.find((d) => d.num === num)?.nombre ?? 'Núcleo AI',
      preguntar,
      detener,
      nueva,
      abrir,
      borrar,
      editar,
      setAgente,
    }
  }, [conversaciones, actual, estado, animada, dispositivos, agenteValido, dispositivoAgente, preguntar, detener, nueva, abrir, borrar, editar, setAgente])

  return <AgenteContext.Provider value={valor}>{children}</AgenteContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAgente = () => useContext(AgenteContext)
