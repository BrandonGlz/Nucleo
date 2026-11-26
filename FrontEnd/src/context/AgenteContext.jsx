import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from './SesionContext'
import * as agenteApi from '../services/agente'
import * as dispositivosApi from '../services/dispositivos'
import * as organizacionesApi from '../services/organizaciones'
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
const claveDe = (agente, pregunta, alcance = 'DISPOSITIVO', area = null) =>
  `${agente}|${alcance}|${area ?? ''}|${pregunta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()}`
function deCache(agente, pregunta, alcance = 'DISPOSITIVO', area = null) {
  const e = cache.get(claveDe(agente, pregunta, alcance, area))
  if (!e) return null
  if (Date.now() - e.t > VIGENCIA) {
    cache.delete(claveDe(agente, pregunta, alcance, area))
    return null
  }
  return e.r
}
function guardarCache(agente, pregunta, r, alcance = 'DISPOSITIVO', area = null) {
  if (r?.reporte || /\b(reporte|informe)/i.test(pregunta)) return
  cache.set(claveDe(agente, pregunta, alcance, area), { r, t: Date.now() })
  if (cache.size > 80) cache.delete(cache.keys().next().value)
}
// La misma pregunta en vuelo se pide una sola vez (precarga y clic al mismo tiempo).
const enVuelo = new Map()
// Mismas palabras de tema que el agente del backend (agente.TEMAS).
const TEMA = /(conex|bateri|senal|linea|desconect|apag|alerta|aviso|incidente|temperatura|calor|frio|grados|humed|aire|co2|calidad|ppm|ventila)/
const sinTema = (t) => !TEMA.test(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
function consultar(pregunta, agente, anterior = '', { precarga = false, sinCache = false, alcance = 'DISPOSITIVO', area = null } = {}) {
  // Un seguimiento depende de la pregunta anterior: entra a la caché junto con ella.
  const llave = anterior ? `${anterior} ${pregunta}` : pregunta
  // Una petición repetida va al servidor: él lleva la cuenta y responde «repetiste…» u «omito…».
  const hit = sinCache ? null : deCache(agente, llave, alcance, area)
  if (hit) return Promise.resolve({ r: hit, cache: true })
  const k = claveDe(agente, llave, alcance, area)
  if (!enVuelo.has(k)) {
    enVuelo.set(
      k,
      agenteApi
        .preguntar(pregunta, agente, anterior, precarga, alcance, area)
        .then((r) => {
          guardarCache(agente, llave, r, alcance, area)
          return { r, cache: false }
        })
        .finally(() => enVuelo.delete(k)),
    )
  }
  return enVuelo.get(k)
}

// `dispositivos`: lista dada desde fuera (la consola de Nico AI la arma con empresa y área); sin
// ella se usan los dispositivos de la organización del usuario.
export function AgenteProvider({ children, dispositivos: externos, agenteInicial }) {
  const [conversaciones, setConversaciones] = useState(() => leer(CLAVE, []))
  const [actual, setActual] = useState(null)
  const [estado, setEstado] = useState('listo')
  const [animada, setAnimada] = useState(null)
  const [propios, setDispositivos] = useState([])
  const dispositivos = externos ?? propios
  // `agenteInicial`: con qué agente abre (la consola siempre empieza con el del ESP físico).
  const [agente, setAgenteEstado] = useState(() => agenteInicial ?? leer(CLAVE_AGENTE, null))
  const turno = useRef(0)
  const { usuario } = useSesion()
  const conOrganizacion = Boolean(usuario?.organizacion)
  const conExternos = Boolean(externos)
  const [areas, setAreas] = useState([])
  const [alcance, setAlcanceEstado] = useState('DISPOSITIVO')
  const [areaAlcance, setAreaAlcanceEstado] = useState(() => usuario?.area ?? null)
  const [puente, setPuente] = useState({ puente: false, activos: [], disponibles: [] })

  useEffect(() => {
    if (!conOrganizacion || conExternos) return undefined
    let vivo = true
    organizacionesApi
      .areas()
      .then((r) => vivo && setAreas(pagina(r)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [conOrganizacion, conExternos])

  // Si el área elegida no está en la lista, se usa la del usuario o la primera visible.
  useEffect(() => {
    if (!areas.length) return
    const valida = areas.some((a) => a.num === areaAlcance)
    if (!valida) setAreaAlcanceEstado(usuario?.area ?? areas[0].num)
  }, [areas, areaAlcance, usuario?.area])

  useEffect(() => {
    if (!conOrganizacion || conExternos) return undefined
    let vivo = true
    dispositivosApi
      .lista()
      .then((r) => vivo && setDispositivos(pagina(r)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [conOrganizacion, conExternos])

  // Si no hay agente elegido (o ya no existe), se usa el del primer dispositivo.
  // Estado del puente: con él, solo los dispositivos con su ESP32 conectado tienen agente.
  useEffect(() => {
    if (!conOrganizacion && !conExternos) return undefined
    let vivo = true
    const leer = () =>
      agenteApi
        .estado({ alcance, area: areaAlcance })
        .then((r) => vivo && setPuente(r))
        .catch(() => {})
    leer()
    const t = setInterval(leer, 15000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [conOrganizacion, conExternos, alcance, areaAlcance])
  const agenteValido = dispositivos.some((d) => d.num === agente) ? agente : (dispositivos[0]?.num ?? null)
  const dispositivoAgente = dispositivos.find((d) => d.num === agenteValido) ?? null
  const porDispositivo = alcance === 'DISPOSITIVO'
  const agenteActivo = porDispositivo
    ? !puente.puente || puente.activos.includes(agenteValido)
    : puente.disponible === true
  // Lo decide el servidor: el administrador usa a Nico aunque el ESP32 esté sin conexión (modo
  // de pruebas); supervisores, analistas y operadores necesitan el ESP32 activo.
  const agenteDisponible = porDispositivo
    ? agenteActivo || (puente.disponibles ?? []).includes(agenteValido)
    : puente.disponible !== false
  const modoPruebas = porDispositivo && agenteDisponible && !agenteActivo
  const motivo = puente.motivo || ''

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
        const conv = { id, titulo: pregunta.slice(0, 40), creada: new Date().toISOString(), agente: agenteValido, etiqueta: etiquetaAlcance(), mensajes: [] }
        cambiar((lista) => [conv, ...lista])
        setActual(id)
      }
      const delAgente = conversaciones.find((c) => c.id === id)?.agente ?? agenteValido
      const previos = base ?? conversaciones.find((c) => c.id === id)?.mensajes ?? []
      // Sin tema propio («¿y el dashboard?», «te pedí la última medición») va con la pregunta
      // anterior; el servidor decide si la usa (seguimiento o corrección) o no (comentario).
      const ultimaMia = previos.filter((m) => m.de === 'yo' && m.texto !== pregunta).at(-1)?.texto ?? ''
      const anterior = sinTema(pregunta) ? ultimaMia : ''
      const igual = (t) => t.trim().toLowerCase().replace(/[¿?¡!.,]/g, '')
      const ultimaPropia = previos.filter((m) => m.de === 'yo').at(-1)?.texto ?? ''
      const repetida = Boolean(ultimaPropia) && igual(ultimaPropia) === igual(pregunta)
      editar(id, (ms) => [...(base ?? ms), ...(base && !mostrar ? [] : [{ de: 'yo', texto: mostrar ?? pregunta }])])
      setEstado('pensando')
      const mio = ++turno.current
      // De caché, el proceso se muestra solo 1 s como máximo.
      const yaEsta = Boolean(deCache(delAgente, pregunta, alcance, areaAlcance)) && !anterior && !repetida
      const pausa = new Promise((listo) => setTimeout(listo, yaEsta ? Math.min(minimo, 1000) : minimo))
      try {
        const { r } = await consultar(pregunta, delAgente, anterior, { sinCache: repetida, alcance, area: areaAlcance })
        await pausa
        if (mio !== turno.current) return
        const clave = nuevoId('r')
        setAnimada(clave)
        editar(id, (ms) => [...ms, { de: 'agente', hora: hora(new Date().toISOString()), ...r, ...extra, clave }])
      } catch (e) {
        await pausa
        if (mio !== turno.current) return
        editar(id, (ms) => [...ms, { de: 'error', caido: e.status === 503, inactivo: Boolean(e.datos?.inactivo), motivo: e.datos?.motivo || e.datos?.detail || '', pregunta }])
        if (e.datos?.inactivo)
          setPuente((p) => ({
            ...p,
            activos: p.activos.filter((n) => n !== delAgente),
            disponibles: (p.disponibles ?? []).filter((n) => n !== delAgente),
          }))
      }
      setEstado('listo')
    },
    [actual, agenteValido, cambiar, conversaciones, editar, estado, alcance, areaAlcance],
  )

  // Respuestas que se arman en el navegador sin ir al servidor (ediciones de plantilla, elegir
  // plantilla): se agregan al instante a la conversación, con la misma animación de escritura.
  const responderLocal = useCallback(
    (pregunta, respuesta) => {
      if (!agenteValido) return
      let id = actual
      if (!id) {
        id = nuevoId('c')
        const conv = { id, titulo: pregunta.slice(0, 40), creada: new Date().toISOString(), agente: agenteValido, etiqueta: etiquetaAlcance(), mensajes: [] }
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
      if (!agenteValido || alcance !== 'DISPOSITIVO') return
      for (const p of preguntas) {
        if (/\b(reporte|informe)/i.test(p) || deCache(agenteValido, p)) continue
        try {
          await consultar(p, agenteValido, '', { precarga: true })
        } catch {
          // Si falla, se pedirá de nuevo al tocarla.
        }
      }
    },
    [agenteValido, alcance],
  )

  const nueva = useCallback(() => {
    detener()
    setActual(null)
  }, [detener])

  // Respuesta del agente que no viene de una pregunta (p. ej. confirmar una alerta atendida).
  const agregarRespuesta = useCallback(
    (respuesta) => {
      if (!actual) return
      const clave = nuevoId('r')
      setAnimada(clave)
      editar(actual, (ms) => [
        ...ms,
        { de: 'agente', hora: hora(new Date().toISOString()), clave, ...respuesta },
      ])
    },
    [actual, editar],
  )

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

  // Nombre que se guarda con la conversación cuando el alcance no es un dispositivo.
  const etiquetaAlcance = () =>
    alcance === 'AREA'
      ? areas.find((a) => a.num === areaAlcance)?.nombre ?? null
      : alcance === 'ORGANIZACION'
        ? 'Toda la organización'
        : null

  const setAlcance = useCallback((valor) => {
    setAlcanceEstado(valor)
  }, [])
  const setAreaAlcance = useCallback((valor) => {
    setAreaAlcanceEstado(valor ? Number(valor) : null)
  }, [])

  const renombrar = useCallback(
    (id, titulo) => {
      const limpio = String(titulo ?? '').trim().slice(0, 80)
      if (!limpio) return
      cambiar((lista) => lista.map((c) => (c.id === id ? { ...c, titulo: limpio } : c)))
    },
    [cambiar],
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
      areas,
      alcance,
      setAlcance,
      areaAlcance,
      setAreaAlcance,
      motivo,
      agente: agenteValido,
      dispositivoAgente,
      nombreAgente: (num) => dispositivos.find((d) => d.num === num)?.nombre ?? 'Nico AI',
      preguntar,
      responderLocal,
      precargar,
      agenteActivo,
      agenteDisponible,
      modoPruebas,
      detener,
      nueva,
      abrir,
      borrar,
      renombrar,
      editar,
      agregarRespuesta,
      setAgente,
    }
  }, [conversaciones, actual, estado, animada, dispositivos, areas, alcance, setAlcance, areaAlcance, setAreaAlcance, motivo, agenteValido, dispositivoAgente, preguntar, responderLocal, precargar, agenteActivo, agenteDisponible, modoPruebas, detener, nueva, abrir, borrar, renombrar, editar, agregarRespuesta, setAgente])

  return <AgenteContext.Provider value={valor}>{children}</AgenteContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAgente = () => useContext(AgenteContext)
