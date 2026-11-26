import { useCallback, useEffect, useState } from 'react'
import { aviso } from '../../components/confirmacion'
import * as formatosApi from '../../services/formatos'
import * as reportesApi from '../../services/reportes'

// Tarjetas del dashboard: id, nombre en el panel de personalización y columnas que ocupa (de 12).
export const WIDGETS = [
  { id: 'cifras', nombre: 'Cifras clave', ancho: 12 },
  { id: 'var:TEMP', nombre: 'Temperatura', ancho: 4 },
  { id: 'var:HUM', nombre: 'Humedad', ancho: 4 },
  { id: 'var:AIRE', nombre: 'Calidad del aire', ancho: 4 },
  { id: 'serie', nombre: 'Gráfica del periodo', ancho: 6 },
  { id: 'alertas', nombre: 'Alertas por variable', ancho: 6 },
  { id: 'analisis', nombre: 'Análisis', ancho: 12 },
]
// Opciones de cada tarjeta: «uno» elige una sola (tipo de gráfica) y «varios» marca la
// información que se muestra. Las tres variables comparten las mismas opciones.
export const OPCIONES = {
  cifras: [
    {
      clave: 'datos',
      tipo: 'varios',
      etiqueta: 'Cifras a mostrar',
      valores: [
        ['lecturas', 'Lecturas'],
        ['dispositivos', 'Dispositivos'],
        ['alertas', 'Alertas'],
        ['dias', 'Días'],
      ],
    },
  ],
  var: [
    {
      clave: 'grafica',
      tipo: 'uno',
      etiqueta: 'Tipo de gráfica',
      valores: [
        ['rango', 'Rango'],
        ['barras', 'Barras'],
        ['cifra', 'Solo cifra'],
      ],
    },
    {
      clave: 'datos',
      tipo: 'varios',
      etiqueta: 'Información',
      valores: [
        ['minmax', 'Mínimo y máximo'],
        ['alertas', 'Alertas'],
      ],
    },
  ],
  serie: [
    {
      clave: 'grafica',
      tipo: 'uno',
      etiqueta: 'Tipo de gráfica',
      valores: [
        ['horizontal', 'Barras'],
        ['columnas', 'Columnas'],
        ['linea', 'Línea'],
      ],
    },
    {
      clave: 'datos',
      tipo: 'varios',
      etiqueta: 'Información',
      valores: [
        ['valores', 'Valor de cada periodo'],
        ['maximo', 'Resaltar el más alto'],
      ],
    },
  ],
  alertas: [
    {
      clave: 'grafica',
      tipo: 'uno',
      etiqueta: 'Tipo de gráfica',
      valores: [
        ['barras', 'Barras'],
        ['dona', 'Dona'],
        ['lista', 'Lista'],
      ],
    },
    {
      clave: 'datos',
      tipo: 'varios',
      etiqueta: 'Información',
      valores: [
        ['total', 'Total del periodo'],
        ['porcentaje', 'Porcentaje'],
      ],
    },
  ],
  analisis: [
    {
      clave: 'datos',
      tipo: 'varios',
      etiqueta: 'Información',
      valores: [
        ['texto', 'Texto del análisis'],
        ['pie', 'Nota de origen'],
      ],
    },
  ],
}
export const grupo = (id) => (id.startsWith('var:') ? 'var' : id)

// Ancho de una tarjeta en columnas de 12; vale para todas.
export const ANCHO = {
  clave: 'ancho',
  tipo: 'uno',
  etiqueta: 'Ancho',
  valores: [
    ['4', 'Un tercio'],
    ['6', 'Mitad'],
    ['8', 'Dos tercios'],
    ['12', 'Completa'],
  ],
}
// Opciones comunes a todas las tarjetas; el editor las dibuja aparte de las gráficas.
export const OPCIONES_COMUNES = [
  { clave: 'titulo', tipo: 'texto', etiqueta: 'Título', max: 60 },
  {
    clave: 'filtro',
    tipo: 'filtro',
    etiqueta: 'Filtro por área o dispositivo',
    fuentes: ['dispositivos', 'disponibilidad', 'incidentes', 'observaciones'],
  },
  {
    clave: 'decimales',
    tipo: 'uno',
    etiqueta: 'Decimales',
    valores: [
      [0, '0'],
      [1, '1'],
      [2, '2'],
    ],
  },
  { clave: 'nota', tipo: 'texto', etiqueta: 'Nota al pie', max: 200 },
]
export const TITULO_MAX = OPCIONES_COMUNES.find((o) => o.clave === 'titulo').max
export const NOTA_MAX = OPCIONES_COMUNES.find((o) => o.clave === 'nota').max
// Fuentes cuyos datos se pueden restringir por área o dispositivo.
export const FUENTES_CON_FILTRO = new Set(OPCIONES_COMUNES.find((o) => o.clave === 'filtro').fuentes)
const CAMPOS = {
  clave: 'datos',
  tipo: 'varios',
  etiqueta: 'Información',
  valores: [
    ['minimo', 'Mínimo'],
    ['promedio', 'Promedio'],
    ['maximo', 'Máximo'],
    ['alertas', 'Alertas'],
  ],
}
const variableFuente = (nombre) => ({
  nombre,
  opciones: [
    {
      clave: 'grafica',
      tipo: 'uno',
      etiqueta: 'Tipo de gráfica',
      valores: [
        ['barras', 'Barras'],
        ['columnas', 'Columnas'],
        ['tabla', 'Tabla'],
        ['cifra', 'Cifras'],
      ],
    },
    CAMPOS,
  ],
})
// Datos que puede mostrar una tarjeta nueva, con sus gráficas e información posibles.
export const FUENTES = {
  cifras: { nombre: 'Cifras clave', opciones: OPCIONES.cifras },
  'var:TEMP': variableFuente('Temperatura'),
  'var:HUM': variableFuente('Humedad'),
  'var:AIRE': variableFuente('Calidad del aire'),
  serie: {
    nombre: 'Evolución del periodo',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['linea', 'Línea'],
          ['columnas', 'Columnas'],
          ['barras', 'Barras'],
          ['tabla', 'Tabla'],
        ],
      },
    ],
  },
  alertas: {
    nombre: 'Alertas por variable',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['dona', 'Dona'],
          ['barras', 'Barras'],
          ['columnas', 'Columnas'],
          ['tabla', 'Tabla'],
        ],
      },
    ],
  },
  analisis: { nombre: 'Análisis', opciones: OPCIONES.analisis },
  resumen: {
    nombre: 'Resumen por variable',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [['tabla', 'Tabla']],
      },
      CAMPOS,
    ],
  },
  cumplimiento: {
    nombre: 'Cumplimiento',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['barras', 'Barras'],
          ['tabla', 'Tabla'],
          ['cifra', 'Cifras'],
        ],
      },
      {
        clave: 'datos',
        tipo: 'varios',
        etiqueta: 'Información',
        valores: [
          ['pct', 'Porcentaje'],
          ['fuera', 'Tiempo fuera'],
        ],
      },
    ],
  },
  comparativo: {
    nombre: 'Comparativo',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['tabla', 'Tabla'],
          ['cifra', 'Cifras'],
        ],
      },
      {
        clave: 'datos',
        tipo: 'varios',
        etiqueta: 'Información',
        valores: [
          ['promedio', 'Promedio'],
          ['extremos', 'Mínimo y máximo'],
          ['alertas', 'Alertas'],
        ],
      },
    ],
  },
  dispositivos: {
    nombre: 'Dispositivos',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [['tabla', 'Tabla']],
      },
      {
        clave: 'datos',
        tipo: 'varios',
        etiqueta: 'Información',
        valores: [
          ['minimo', 'Mínimo'],
          ['promedio', 'Promedio'],
          ['maximo', 'Máximo'],
          ['area', 'Área'],
        ],
      },
    ],
  },
  gestion_alertas: {
    nombre: 'Gestión de alertas',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['dona', 'Dona'],
          ['barras', 'Barras'],
          ['tabla', 'Tabla'],
        ],
      },
      {
        clave: 'datos',
        tipo: 'varios',
        etiqueta: 'Información',
        valores: [
          ['estados', 'Estados'],
          ['tiempo', 'Tiempo medio'],
          ['responsables', 'Responsables'],
        ],
      },
    ],
  },
  disponibilidad: {
    nombre: 'Disponibilidad',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['barras', 'Barras'],
          ['tabla', 'Tabla'],
        ],
      },
      {
        clave: 'datos',
        tipo: 'varios',
        etiqueta: 'Información',
        valores: [
          ['pct', 'Porcentaje'],
          ['huecos', 'Huecos'],
        ],
      },
    ],
  },
  incidentes: {
    nombre: 'Incidentes',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['tabla', 'Tabla'],
          ['lista', 'Lista'],
        ],
      },
    ],
  },
  observaciones: {
    nombre: 'Observaciones',
    opciones: [
      {
        clave: 'grafica',
        tipo: 'uno',
        etiqueta: 'Tipo de gráfica',
        valores: [
          ['lista', 'Lista'],
          ['tabla', 'Tabla'],
        ],
      },
    ],
  },
}

// Tarjetas de la configuración: las de siempre más las que añadió la persona.
// Un formato creado desde cero (base: false) no trae las tarjetas de siempre, solo las que se añaden.
export const tarjetas = (conf) => [...(conf.base === false ? [] : WIDGETS), ...(conf.personalizadas ?? [])]
export const tarjeta = (conf, id) => tarjetas(conf).find((w) => w.id === id)
// Opciones que admite una tarjeta: las de su grupo, o las de su fuente si es nueva.
export function esquema(conf, id) {
  const w = tarjeta(conf, id)
  return [...(w?.fuente ? FUENTES[w.fuente].opciones : (OPCIONES[grupo(id)] ?? [])), ANCHO]
}
// Por omisión cada tarjeta usa la primera gráfica y muestra toda la información.
const valoresBase = (lista) =>
  Object.fromEntries(lista.map((o) => [o.clave, o.tipo === 'uno' ? o.valores[0][0] : o.valores.map(([v]) => v)]))
export const opcionesDe = (conf, id) => ({
  ...valoresBase(esquema(conf, id)),
  ancho: String(tarjeta(conf, id)?.ancho ?? 6),
  ...conf.opciones?.[id],
})
// Cifras clave y Análisis ocupan todo el ancho; lo demás empieza a la mitad.
export const opcionesNuevas = (fuente) => ({
  ...valoresBase(FUENTES[fuente].opciones),
  ancho: fuente === 'cifras' || fuente === 'analisis' ? '12' : '6',
})

const BASE = { orden: WIDGETS.map((w) => w.id), ocultos: [], opciones: {}, personalizadas: [] }
// Un formato nuevo empieza vacío: solo la cabecera y ninguna tarjeta en la lista.
const VACIO = { orden: [], ocultos: [], opciones: {}, personalizadas: [], base: false }
// Se conserva para que el chat de Nico AI compile hasta la tarea 1.5.
export const ESTANDAR = 'estandar'
// Nombre de un formato en los selectores: marca el predeterminado y las plantillas.
export const etiquetaFormato = (f) =>
  `${f.nombre}${f.predeterminado ? ' (predeterminado)' : ''}${f.esPlantilla ? ' · Plantilla' : ''}`

// Completa una configuración guardada: quita tarjetas que ya no existen y añade las nuevas.
function normalizar(g) {
  if (!g?.orden) return BASE
  const personalizadas = (g.personalizadas ?? []).filter((w) => FUENTES[w.fuente])
  const ids = tarjetas({ base: g.base, personalizadas }).map((w) => w.id)
  const orden = g.orden.filter((id) => ids.includes(id))
  return {
    orden: [...orden, ...ids.filter((id) => !orden.includes(id))],
    ocultos: g.ocultos ?? [],
    opciones: g.opciones ?? {},
    personalizadas,
    ...(g.hoja && { hoja: g.hoja }),
    ...(g.version_esquema && { version_esquema: g.version_esquema }),
    ...(g.base === false && { base: false }),
  }
}

const EVENTO = 'nucleo:formatos'
const prepararFormato = (f) => ({ ...f, conf: normalizar(f.conf) })
const FORMATO_VACIO = {
  id: '',
  num: null,
  nombre: '',
  conf: BASE,
  esPlantilla: false,
  predeterminado: false,
  areasPredeterminado: [],
}

// Caché compartida por las vistas: los formatos viven en el servidor y se piden por la API.
let cache = []
let cacheLista = false

// Carga (o recarga) los formatos desde la API y actualiza la caché compartida.
export async function cargarFormatos() {
  const lista = (await formatosApi.lista()).map(prepararFormato)
  cache = lista
  cacheLista = true
  return lista
}

// Formatos en caché fuera de React. El chat de Nico AI los consulta así.
export const leerFormatos = () => ({ formatos: cache, porReporte: {} })
export const guardarFormatos = (estado) => {
  cache = (estado.formatos ?? []).map(prepararFormato)
  cacheLista = true
  window.dispatchEvent(new Event(EVENTO))
}
export const formatoDeReporte = (estado, num) =>
  estado.formatos.find((f) => f.num === Number(num)) ??
  estado.formatos.find((f) => f.predeterminado) ??
  estado.formatos[0]

// Cambia el formato de un reporte desde el chat. La tarea 1.5 lo integrará con la conversación.
export function asignarFormato(num, id) {
  reportesApi
    .cambiarFormato(num, Number(id))
    .then(() => window.dispatchEvent(new Event('nucleo:reporte')))
    .catch(() => {})
}

// Mueve `id` antes o después de `destino` dentro del orden.
function reordenar(orden, id, destino, despues) {
  if (id === destino) return orden
  const sin = orden.filter((x) => x !== id)
  const i = sin.indexOf(destino) + (despues ? 1 : 0)
  return [...sin.slice(0, i), id, ...sin.slice(i)]
}

// Estado de la personalización del reporte. Los formatos se cargan de la API; el borrador
// sigue siendo local hasta «Guardar». `reporte` puede ser el objeto o solo su número.
export function useEdicion(reporte) {
  const informe = reporte && typeof reporte === 'object' ? reporte : null
  const numReporte = informe?.num ?? (typeof reporte === 'number' ? reporte : null)
  const [formatos, setFormatos] = useState(cache)
  const [cargando, setCargando] = useState(!cacheLista)
  const [error, setError] = useState(null)
  const [activo, setActivo] = useState(null)
  const [borrador, setBorrador] = useState(null)
  const [modo, setModo] = useState('formato')
  const [abierta, setAbierta] = useState(null)
  const [arrastrando, setArrastrando] = useState(null)
  const [destino, setDestino] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const lista = await cargarFormatos()
      setFormatos(lista)
      setError(null)
      return lista
    } catch (e) {
      setError(e)
      return []
    } finally {
      setCargando(false)
    }
  }, [])

  const recargar = useCallback(async () => {
    const lista = await cargar()
    window.dispatchEvent(new Event(EVENTO))
    return lista
  }, [cargar])

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    cargar()
    const alCambiar = () => cargar()
    window.addEventListener(EVENTO, alCambiar)
    return () => window.removeEventListener(EVENTO, alCambiar)
  }, [cargar])

  // Al cambiar de reporte se vuelve a su formato, no al que se estaba editando.
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    setActivo(null)
  }, [numReporte])

  const editando = borrador != null
  const formatoReporte = formatos.find((f) => f.num === Number(informe?.formato))
  const predeterminado = formatos.find((f) => f.predeterminado)
  const formato =
    (activo && formatos.find((f) => f.id === activo)) ??
    formatoReporte ??
    predeterminado ??
    formatos[0] ??
    FORMATO_VACIO
  const conf = activo
    ? formato.conf
    : informe?.formato_conf
      ? normalizar(informe.formato_conf)
      : formato.conf
  const formatoDe = (num) =>
    formatos.find((f) => f.num === Number(num)) ?? predeterminado ?? formatos[0] ?? FORMATO_VACIO

  const cancelar = useCallback(() => {
    setBorrador(null)
    setAbierta(null)
  }, [])
  useEffect(() => {
    if (!editando) return undefined
    const tecla = (e) => {
      if (e.key !== 'Escape') return
      // Con una tarjeta elegida, Escape solo quita la selección; el editor sigue abierto.
      if (abierta) return
      cancelar()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [editando, cancelar, abierta])

  const alternar = (id) =>
    setBorrador((b) => ({
      ...b,
      ocultos: b.ocultos.includes(id) ? b.ocultos.filter((x) => x !== id) : [...b.ocultos, id],
    }))
  const opcion = (id, clave, valor) =>
    setBorrador((b) => ({
      ...b,
      opciones: { ...b.opciones, [id]: { ...opcionesDe(b, id), [clave]: valor } },
    }))
  // Opciones generales de la hoja (hoy: adjuntar el CSV al correo).
  const cambiarHoja = (cambios) =>
    setBorrador((b) => ({ ...b, hoja: { ...(b.hoja ?? {}), ...cambios } }))
  // Añade una tarjeta nueva al final y deja abiertas sus opciones; quitar la elimina.
  const agregar = (fuente, nombre, opciones) => {
    const id = `p${Date.now().toString(36)}`
    setBorrador((b) => ({
      ...b,
      personalizadas: [...(b.personalizadas ?? []), { id, fuente, nombre }],
      orden: [...b.orden, id],
      opciones: { ...b.opciones, [id]: opciones },
    }))
    setAbierta(id)
  }
  const quitar = (id) =>
    setBorrador((b) => {
      const { [id]: _fuera, ...opciones } = b.opciones
      return {
        ...b,
        personalizadas: b.personalizadas.filter((w) => w.id !== id),
        orden: b.orden.filter((x) => x !== id),
        ocultos: b.ocultos.filter((x) => x !== id),
        opciones,
      }
    })
  const mover = (id, paso) =>
    setBorrador((b) => {
      const i = b.orden.indexOf(id)
      const j = i + paso
      if (j < 0 || j >= b.orden.length) return b
      const orden = [...b.orden]
      ;[orden[i], orden[j]] = [orden[j], orden[i]]
      return { ...b, orden }
    })

  // Propiedades de arrastre para una tarjeta o una fila de la lista. `eje` decide si la
  // mitad que cuenta es la horizontal (tarjetas) o la vertical (lista).
  const arrastre = (id, eje) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
      setArrastrando(id)
    },
    onDragEnd: () => {
      setArrastrando(null)
      setDestino(null)
    },
    onDragOver: (e) => {
      e.preventDefault()
      const caja = e.currentTarget.getBoundingClientRect()
      const despues = eje === 'x' ? e.clientX > caja.left + caja.width / 2 : e.clientY > caja.top + caja.height / 2
      if (destino?.id !== id || destino?.despues !== despues) setDestino({ id, despues })
    },
    onDrop: (e) => {
      e.preventDefault()
      const origen = e.dataTransfer.getData('text/plain') || arrastrando
      if (origen && destino)
        setBorrador((b) => ({
          ...b,
          orden: reordenar(b.orden, origen, destino.id, destino.despues),
        }))
      setArrastrando(null)
      setDestino(null)
    },
    className: [
      arrastrando === id && 'is-arrastrando',
      destino?.id === id && arrastrando !== id && (destino.despues ? `is-destino-${eje}-despues` : `is-destino-${eje}-antes`),
    ]
      .filter(Boolean)
      .join(' '),
  })

  // Guarda el borrador como una versión nueva del formato (PATCH) o crea el formato (POST).
  const guardar = async () => {
    if (!formato.num) return
    try {
      await formatosApi.actualizar(formato.num, { conf: borrador })
      if (informe?.num) await reportesApi.cambiarFormato(informe.num, formato.num)
      await recargar()
      setActivo(String(formato.num))
      cancelar()
      if (informe?.num) window.dispatchEvent(new Event('nucleo:reporte'))
    } catch {
      aviso('No se pudo guardar el formato. Intenta de nuevo.', { tipo: 'error' })
    }
  }

  const asignar = async (nums, id) => {
    try {
      await Promise.all([nums].flat().map((num) => reportesApi.cambiarFormato(num, Number(id))))
      setActivo(String(id))
      window.dispatchEvent(new Event('nucleo:reporte'))
    } catch {
      aviso('No se pudo cambiar el formato del reporte.', { tipo: 'error' })
    }
  }

  // Duplica una plantilla (o un formato) y abre la copia en edición para este reporte.
  const duplicar = async () => {
    if (!formato.num) return null
    try {
      const copia = await formatosApi.duplicar(formato.num)
      const lista = await recargar()
      const nueva = lista.find((f) => f.num === copia.num) ?? prepararFormato(copia)
      if (informe?.num) {
        await reportesApi.cambiarFormato(informe.num, copia.num)
        window.dispatchEvent(new Event('nucleo:reporte'))
      }
      setActivo(nueva.id)
      setModo('formato')
      setBorrador(nueva.conf)
      return nueva
    } catch {
      aviso('No se pudo duplicar el formato. Intenta de nuevo.', { tipo: 'error' })
      return null
    }
  }

  return {
    conf,
    borrador,
    editando,
    abierta,
    setAbierta,
    arrastre,
    mover,
    alternar,
    opcion,
    agregar,
    quitar,
    cambiarHoja,
    formatos,
    formato,
    formatoDe,
    asignar,
    duplicar,
    recargar,
    modo,
    cargando,
    error,
    abrir: () => {
      setModo('formato')
      setActivo(formato.id)
      setBorrador(conf)
    },
    cancelar,
    restablecer: () => setBorrador(modo === 'nuevo' ? VACIO : BASE),
    guardar,
    // Crea un formato desde cero (modal «Generar reporte»), lo guarda y devuelve su id.
    nuevo: () => {
      setModo('nuevo')
      setBorrador(VACIO)
    },
    crearFormato: async (nombre) => {
      try {
        const creado = await formatosApi.crear({ nombre, conf: borrador })
        if (informe?.num) await reportesApi.cambiarFormato(informe.num, creado.num)
        await recargar()
        setActivo(creado.id)
        cancelar()
        if (informe?.num) window.dispatchEvent(new Event('nucleo:reporte'))
        return creado.id
      } catch {
        aviso('No se pudo crear el formato. Intenta de nuevo.', { tipo: 'error' })
        return null
      }
    },
  }
}
