import { guardarArchivo } from '../../services/seguridad'
import fuente400 from '../../design-system/fuentes/PlusJakartaSans-400.woff2?url'
import fuente500 from '../../design-system/fuentes/PlusJakartaSans-500.woff2?url'
import fuente600 from '../../design-system/fuentes/PlusJakartaSans-600.woff2?url'
import fuente700 from '../../design-system/fuentes/PlusJakartaSans-700.woff2?url'
import fuente800 from '../../design-system/fuentes/PlusJakartaSans-800.woff2?url'

const FUENTES = [
  [400, fuente400],
  [500, fuente500],
  [600, fuente600],
  [700, fuente700],
  [800, fuente800],
]

function base64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  const trozo = 0x8000
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo))
  }
  return btoa(binario)
}

async function fuentesEnLinea() {
  const partes = await Promise.all(
    FUENTES.map(async ([peso, url]) => {
      const respuesta = await fetch(url)
      const datos = await respuesta.arrayBuffer()
      return `@font-face{font-family:"Plus Jakarta Sans";font-style:normal;font-weight:${peso};src:url(data:font/woff2;base64,${base64(datos)}) format("woff2")}`
    }),
  )
  return partes.join('')
}

// Copia los estilos calculados a cada nodo clonado. Es la forma de que el SVG con foreignObject
// no dependa de las hojas de estilo externas al serializarse.
function estilosEnLinea(origen, destino) {
  if (origen.nodeType !== 1 || destino.nodeType !== 1) return
  const calculado = getComputedStyle(origen)
  for (let i = 0; i < calculado.length; i += 1) {
    const propiedad = calculado[i]
    if (propiedad === 'animation' || propiedad === 'transition' || propiedad.startsWith('animation-') || propiedad.startsWith('transition-')) continue
    if (['background-image', 'mask-image', 'border-image-source', 'list-style-image', 'filter', '-webkit-filter'].includes(propiedad)) continue
    const valor = calculado.getPropertyValue(propiedad)
    if (valor.includes('url(') && !valor.includes('data:')) continue
    destino.style.setProperty(propiedad, valor)
  }
  destino.style.animation = 'none'
  destino.style.transition = 'none'
  const hijosOrigen = origen.children
  const hijosDestino = destino.children
  for (let i = 0; i < hijosOrigen.length; i += 1) {
    estilosEnLinea(hijosOrigen[i], hijosDestino[i])
  }
}

export async function exportarPng(nodo, nombre = 'analitica.png') {
  if (!nodo) throw new Error('No hay un lienzo para exportar.')
  await document.fonts?.ready
  const ancho = Math.round(nodo.getBoundingClientRect().width)
  const alto = Math.round(nodo.getBoundingClientRect().height)
  if (!ancho || !alto) throw new Error('El lienzo todavía no está listo para exportar.')
  const clon = nodo.cloneNode(true)
  estilosEnLinea(nodo, clon)
  clon.querySelectorAll('.nc-tooltip, .ui-menu-acciones, .nc-skel').forEach((el) => el.remove())
  clon.style.width = `${ancho}px`
  clon.style.height = `${alto}px`
  clon.style.margin = '0'
  clon.style.background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || 'var(--background)'
  const estilos = await fuentesEnLinea()
  const envoltorio = document.createElement('div')
  envoltorio.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  envoltorio.style.width = `${ancho}px`
  envoltorio.style.height = `${alto}px`
  envoltorio.style.overflow = 'hidden'
  envoltorio.appendChild(clon)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}"><style>${estilos}</style><foreignObject x="0" y="0" width="${ancho}" height="${alto}">${new XMLSerializer().serializeToString(envoltorio)}</foreignObject></svg>`
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  try {
    const imagen = new Image()
    imagen.decoding = 'async'
    await new Promise((resolver, rechazar) => {
      imagen.onload = resolver
      imagen.onerror = () => rechazar(new Error('No se pudo dibujar el lienzo para PNG.'))
      imagen.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = ancho * 2
    canvas.height = alto * 2
    const contexto = canvas.getContext('2d')
    contexto.scale(2, 2)
    contexto.drawImage(imagen, 0, 0, ancho, alto)
    const salida = await new Promise((resolver, rechazar) => {
      canvas.toBlob((resultado) => (resultado ? resolver(resultado) : rechazar(new Error('El navegador no pudo generar el PNG.'))), 'image/png')
    })
    guardarArchivo(salida, nombre)
    return salida
  } finally {
    // La URL es un data URL: no hay objeto que revocar.
  }
}

export function nombrePng(tablero, pagina) {
  const limpiar = (texto) => String(texto || 'analitica').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `analitica_${limpiar(tablero)}_${limpiar(pagina)}.png`
}
