import { useCallback, useEffect, useState } from 'react'

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
const CLAVE = 'nucleo.reportes.formatos'
const CLAVE_ANTERIOR = 'nucleo.reportes.widgets'
export const ESTANDAR = 'estandar'

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
    ...(g.base === false && { base: false }),
  }
}

// Formatos guardados (diseños con nombre) y el formato que usa cada reporte. Se recuerdan en
// este navegador; sin almacenamiento solo existe el formato estándar.
function leer() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE))
    if (g?.formatos?.length) {
      return {
        formatos: g.formatos.map((f) => ({ ...f, conf: normalizar(f.conf) })),
        porReporte: g.porReporte ?? {},
      }
    }
    const anterior = JSON.parse(localStorage.getItem(CLAVE_ANTERIOR))
    return { formatos: [{ id: ESTANDAR, nombre: 'Estándar', conf: normalizar(anterior) }], porReporte: {} }
  } catch {
    return { formatos: [{ id: ESTANDAR, nombre: 'Estándar', conf: BASE }], porReporte: {} }
  }
}
// Sin almacenamiento los formatos duran lo que dure la página: se guardan también en memoria.
let enMemoria = null
const EVENTO = 'nucleo:formatos'
function guardar(estado) {
  enMemoria = estado
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado))
  } catch {
    // Sin almacenamiento queda solo la copia en memoria.
  }
  // Avisa a las demás vistas (Reportes, visor y chat de Nico AI) para que se actualicen.
  window.dispatchEvent(new Event(EVENTO))
}

// Formatos y asignaciones fuera de React: los usa Nico AI para elegir y editar plantillas.
export const leerFormatos = () => enMemoria ?? leer()
export const guardarFormatos = (estado) => guardar(estado)
export const formatoDeReporte = (estado, num) =>
  estado.formatos.find((f) => f.id === estado.porReporte[num]) ?? estado.formatos[0]
export function asignarFormato(num, id) {
  const estado = leerFormatos()
  if (estado.porReporte[num] === id || !estado.formatos.some((f) => f.id === id)) return
  guardar({ ...estado, porReporte: { ...estado.porReporte, [num]: id } })
}

// Mueve `id` antes o después de `destino` dentro del orden.
function reordenar(orden, id, destino, despues) {
  if (id === destino) return orden
  const sin = orden.filter((x) => x !== id)
  const i = sin.indexOf(destino) + (despues ? 1 : 0)
  return [...sin.slice(0, i), id, ...sin.slice(i)]
}

// Estado de la personalización del reporte. Mientras se edita, la columna de la lista muestra
// las tarjetas (ListaTarjetas) y la hoja de la vista previa deja arrastrarlas.
// Se trabaja sobre un borrador: «Guardar» lo aplica y «Cancelar» o Escape lo descartan.
// `reporte` es el número del reporte en pantalla; la personalización edita su formato.
export function useEdicion(reporte) {
  const [estado, setEstado] = useState(leerFormatos)
  // Cambios hechos desde otra vista (o en otra pestaña) se reflejan aquí.
  useEffect(() => {
    const releer = (e) => {
      if (e.type === 'storage') enMemoria = null // lo cambió otra pestaña: se lee del almacenamiento
      setEstado(leerFormatos())
    }
    window.addEventListener(EVENTO, releer)
    window.addEventListener('storage', releer)
    return () => {
      window.removeEventListener(EVENTO, releer)
      window.removeEventListener('storage', releer)
    }
  }, [])
  const [borrador, setBorrador] = useState(null)
  // «formato»: se edita el formato del reporte en pantalla; «nuevo»: se crea uno desde el modal.
  const [modo, setModo] = useState('formato')
  const [abierta, setAbierta] = useState(null)
  const [arrastrando, setArrastrando] = useState(null)
  const [destino, setDestino] = useState(null)
  const editando = borrador != null
  const { formatos, porReporte } = estado
  const formatoDe = (num) => formatos.find((f) => f.id === porReporte[num]) ?? formatos[0]
  const formato = formatoDe(reporte)
  const conf = formato.conf
  const cambiar = (nuevo) => {
    setEstado(nuevo)
    guardar(nuevo)
  }
  // Asigna un formato a uno o varios reportes (num o lista de num).
  const asignar = (nums, id) =>
    cambiar({ ...estado, porReporte: { ...porReporte, ...Object.fromEntries([nums].flat().map((n) => [n, id])) } })

  const cancelar = useCallback(() => {
    setBorrador(null)
    setAbierta(null)
  }, [])
  useEffect(() => {
    if (!editando) return undefined
    const tecla = (e) => e.key === 'Escape' && cancelar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [editando, cancelar])

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
    formatos,
    formato,
    formatoDe,
    asignar,
    modo,
    abrir: () => {
      setModo('formato')
      setBorrador(conf)
    },
    cancelar,
    restablecer: () => setBorrador(modo === 'nuevo' ? VACIO : BASE),
    // Guarda los cambios en el formato del reporte en pantalla.
    guardar: () => {
      cambiar({ ...estado, formatos: formatos.map((f) => (f.id === formato.id ? { ...f, conf: borrador } : f)) })
      cancelar()
    },
    // Crea un formato desde cero (modal «Generar reporte»), lo guarda y devuelve su id.
    nuevo: () => {
      setModo('nuevo')
      setBorrador(VACIO)
    },
    crearFormato: (nombre) => {
      const id = `f${Date.now().toString(36)}`
      cambiar({ ...estado, formatos: [...formatos, { id, nombre, conf: borrador }] })
      cancelar()
      return id
    },
    // Elimina un formato; los reportes que lo usaban vuelven al estándar.
    eliminar: (id) => {
      if (id === ESTANDAR) return
      cambiar({
        formatos: formatos.filter((f) => f.id !== id),
        porReporte: Object.fromEntries(Object.entries(porReporte).filter(([, f]) => f !== id)),
      })
      cancelar()
    },
  }
}
