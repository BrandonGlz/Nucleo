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
// Caché de respuestas (5 min) por dispositivo y pregunta: repetir una pregunta o tocar una
// sugerencia ya precargada responde sin volver al servidor. Los reportes no se guardan (cada
// uno genera un archivo nuevo) ni los errores.
const VIGENCIA = 5 * 60 * 1000
const cache = new Map()
const claveDe = (agente, pregunta) =>
  `${agente}|${pregunta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()}`
function deCache(agente, pregunta) {
  const e = cache.get(claveDe(agente, pregunta))
  if (!e) return null
  if (Date.now() - e.t > VIGENCIA) {
    cache.delete(claveDe(agente, pregunta))
    return null
  }
  return e.r
}
function guardarCache(agente, pregunta, r) {
  if (r?.reporte || /\b(reporte|informe)/i.test(pregunta)) return
  cache.set(claveDe(agente, pregunta), { r, t: Date.now() })
  if (cache.size > 80) cache.delete(cache.keys().next().value)
}
// La misma pregunta en vuelo se pide una sola vez (precarga y clic al mismo tiempo).
const enVuelo = new Map()
function consultar(pregunta, agente) {
  const hit = deCache(agente, pregunta)
  if (hit) return Promise.resolve({ r: hit, cache: true })
  const k = claveDe(agente, pregunta)
  if (!enVuelo.has(k)) {
    enVuelo.set(
      k,
      agenteApi
        .preguntar(pregunta, agente)
        .then((r) => {
          guardarCache(agente, pregunta, r)
          return { r, cache: false }
        })
        .finally(() => enVuelo.delete(k)),
    )
  }
  return enVuelo.get(k)
}

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
    // `minimo`: milisegundos que se muestra el proceso aunque la respuesta llegue antes.
    // `mostrar`: texto de la burbuja del usuario si es distinto de lo que se envía (p. ej. al
    // elegir plantilla); `extra`: datos que se guardan en la respuesta (la plantilla elegida).
    async (pregunta, base, minimo = 0, { mostrar, extra } = {}) => {
      if (!pregunta.trim() || estado === 'pensando' || !agenteValido) return
      let id = actual
      if (!id) {
        id = nuevoId('c')
        const conv = { id, titulo: pregunta.slice(0, 60), creada: new Date().toISOString(), agente: agenteValido, mensajes: [] }
        cambiar((lista) => [conv, ...lista])
        setActual(id)
      }
      const delAgente = conversaciones.find((c) => c.id === id)?.agente ?? agenteValido
      editar(id, (ms) => [...(base ?? ms), ...(base && !mostrar ? [] : [{ de: 'yo', texto: mostrar ?? pregunta }])])
      setEstado('pensando')
      const mio = ++turno.current
      // De caché, el proceso se muestra solo 1 s como máximo.
      const yaEsta = Boolean(deCache(delAgente, pregunta))
      const pausa = new Promise((listo) => setTimeout(listo, yaEsta ? Math.min(minimo, 1000) : minimo))
      try {
        const { r } = await consultar(pregunta, delAgente)
        await pausa
        if (mio !== turno.current) return
        const clave = nuevoId('r')
        setAnimada(clave)
        editar(id, (ms) => [...ms, { de: 'agente', hora: hora(new Date().toISOString()), ...r, ...extra, clave }])
      } catch (e) {
        await pausa
        if (mio !== turno.current) return
        editar(id, (ms) => [...ms, { de: 'error', caido: e.status === 503, pregunta }])
      }
      setEstado('listo')
    },
    [actual, agenteValido, cambiar, conversaciones, editar, estado],
  )

  // Respuestas que se arman en el navegador sin ir al servidor (ediciones de plantilla, elegir
  // plantilla): se agregan al instante a la conversación, con la misma animación de escritura.
  const responderLocal = useCallback(
    (pregunta, respuesta) => {
      if (!agenteValido) return
      let id = actual
      if (!id) {
        id = nuevoId('c')
        const conv = { id, titulo: pregunta.slice(0, 60), creada: new Date().toISOString(), agente: agenteValido, mensajes: [] }
        cambiar((lista) => [conv, ...lista])
        setActual(id)
      }
      const clave = nuevoId('r')
      setAnimada(clave)
      editar(id, (ms) => [
        ...ms,
        { de: 'yo', texto: pregunta },
        { de: 'agente', hora: hora(new Date().toISOString()), ...respuesta, clave },
      ])
    },
    [actual, agenteValido, cambiar, editar],
  )

  // Precarga en segundo plano las preguntas sugeridas (sin reportes), de una en una.
  const precargar = useCallback(
    async (preguntas) => {
      if (!agenteValido) return
      for (const p of preguntas) {
        if (/\b(reporte|informe)/i.test(p) || deCache(agenteValido, p)) continue
        try {
          await consultar(p, agenteValido)
        } catch {
          // Si falla, se pedirá de nuevo al tocarla.
        }
      }
    },
    [agenteValido],
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
      nombreAgente: (num) => dispositivos.find((d) => d.num === num)?.nombre ?? 'Nico AI',
      preguntar,
      responderLocal,
      precargar,
      detener,
      nueva,
      abrir,
      borrar,
      editar,
      setAgente,
    }
  }, [conversaciones, actual, estado, animada, dispositivos, agenteValido, dispositivoAgente, preguntar, responderLocal, precargar, detener, nueva, abrir, borrar, editar, setAgente])

  return <AgenteContext.Provider value={valor}>{children}</AgenteContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAgente = () => useContext(AgenteContext)
