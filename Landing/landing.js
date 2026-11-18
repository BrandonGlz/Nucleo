// Landing de Núcleo. Sin dependencias: navegación, apariciones al hacer scroll, saludo de Nico,
// pestañas de la plataforma, puntos del dispositivo, Nico guía y planes.

// Planes: cambia aquí precios y límites; las tarjetas y la tabla se generan con estos datos.
// Precios mensuales en MXN sin IVA; el anual aplica DESCUENTO_ANUAL.
const CORREO_CONTACTO = 'contacto@bynucleo.com'
const DESCUENTO_ANUAL = 0.2
const PRECIO_EQUIPO = 1450
const PLANES = [
  {
    nombre: 'Semilla', desc: 'Para probar Núcleo en un espacio.', precio: 0, cta: 'Empezar gratis', url: 'https://bynucleo.com',
    limites: { dispositivos: 1, almacenamiento: '1 GB', historial: '30 días', nicoDia: 20, nicoHora: 5 },
    incluye: ['Plataforma web y app móvil', 'Alertas por correo y en pantalla', '1 área y 2 usuarios'],
  },
  {
    nombre: 'Brote', desc: 'Para negocios con varias áreas que vigilar.', precio: 590, cta: 'Elegir Brote',
    limites: { dispositivos: 5, almacenamiento: '10 GB', historial: '1 año', nicoDia: 150, nicoHora: 25 },
    incluye: ['Todo lo de Semilla', 'Notificaciones push', 'Reportes PDF programados', 'Hasta 5 áreas y 15 usuarios'],
  },
  {
    nombre: 'Bosque', desc: 'Para operaciones que no pueden parar.', precio: 1690, cta: 'Elegir Bosque', destacado: true,
    limites: { dispositivos: 25, almacenamiento: '60 GB', historial: '3 años', nicoDia: 800, nicoHora: 100 },
    incluye: ['Todo lo de Brote', 'Áreas y usuarios ilimitados', 'API, tokens y webhooks', 'Bitácora de auditoría', 'Equipos en comodato'],
  },
]
// Filas de la tabla comparativa: [etiqueta, función que da el valor por plan, valor de Empresa]
const COMPARAR = [
  ['Dispositivos Núcleo', (p) => p.limites.dispositivos, 'Ilimitados'],
  ['Almacenamiento', (p) => p.limites.almacenamiento, 'A medida'],
  ['Historial de lecturas', (p) => p.limites.historial, 'A medida'],
  ['Peticiones a Nico AI por día', (p) => p.limites.nicoDia, 'Acordadas'],
  ['Peticiones a Nico AI por hora', (p) => p.limites.nicoHora, 'Acordadas'],
  ['Notificaciones push', (p) => p.precio > 0, true],
  ['Reportes PDF programados', (p) => p.precio > 0, true],
  ['API y webhooks', (p) => p.precio >= 1000, true],
  ['Auditoría', (p) => p.precio >= 1000, true],
  ['Acompañamiento en la instalación', () => false, true],
]

const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const pesos = (n) => '$' + Math.round(n).toLocaleString('es-MX')

// ---------- Navegación ----------
const nav = $('#nav')
const menuBtn = $('#menuBtn')
const menu = $('#menuMovil')
const alScroll = () => nav.classList.toggle('con-fondo', window.scrollY > 20 || !menu.hidden)
window.addEventListener('scroll', alScroll, { passive: true })
alScroll()
const cerrarMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.setAttribute('aria-label', 'Abrir menú'); alScroll() }
menuBtn.addEventListener('click', () => {
  const abrir = menu.hidden
  menu.hidden = !abrir
  menuBtn.setAttribute('aria-expanded', String(abrir))
  menuBtn.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú')
  alScroll()
})
$$('a', menu).forEach((a) => a.addEventListener('click', cerrarMenu))
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) cerrarMenu() })

// Enlace activo del menú según la sección visible
const enlaces = $$('.nav__links a')
const activos = new IntersectionObserver((entradas) => {
  entradas.forEach((en) => {
    if (!en.isIntersecting) return
    enlaces.forEach((a) => a.classList.toggle('activo', a.getAttribute('href') === '#' + en.target.id))
  })
}, { rootMargin: '-45% 0px -50% 0px' })
$$('main section[id]').forEach((s) => activos.observe(s))

// ---------- Apariciones al hacer scroll ----------
const revelar = new IntersectionObserver((entradas) => {
  entradas.forEach((en) => {
    if (!en.isIntersecting) return
    en.target.classList.add('visible')
    revelar.unobserve(en.target)
  })
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
$$('.revelar').forEach((el) => revelar.observe(el))

// ---------- Saludo de Nico en el hero (se escribe solo) ----------
const SALUDOS = [
  '¡Hola! Soy Nico, el guía de Núcleo.',
  'Mido la temperatura, la humedad y el aire de tus espacios.',
  'Si algo se sale de rango, te aviso al momento.',
  'Y si tienes dudas, pregúntame: te respondo con tus datos.',
]
const saludo = $('#saludo')
if (reducido) {
  saludo.textContent = SALUDOS.join(' ')
  saludo.classList.add('listo')
} else {
  let i = 0
  const escribir = (texto, n = 0) => {
    saludo.textContent = texto.slice(0, n)
    if (n < texto.length) return setTimeout(() => escribir(texto, n + 1), 32)
    setTimeout(() => { i = (i + 1) % SALUDOS.length; escribir(SALUDOS[i]) }, 2600)
  }
  setTimeout(() => escribir(SALUDOS[0]), 500)
}

// ---------- Pestañas de la plataforma ----------
const VISTAS = [
  ['web-panel', 'bynucleo.com/panel', 'Panel de Núcleo con temperatura en vivo, tendencia y alertas recientes', 'Temperatura en vivo, tendencia del día, alertas recientes y los dispositivos que requieren atención.'],
  ['web-dispositivos', 'bynucleo.com/dispositivos', 'Lista de dispositivos con su estado, batería y señal', 'Cada Núcleo con su área, estado, batería, señal y última lectura. Filtra por estado o búscalo por código.'],
  ['web-mediciones', 'bynucleo.com/mediciones', 'Histórico de humedad del día con gráfica y tabla de lecturas', 'Histórico por dispositivo y variable: gráfica con el rango permitido y cada lectura con su hora. Se exporta a CSV.'],
  ['web-alertas', 'bynucleo.com/alertas', 'Alertas pendientes con su línea de tiempo', 'Alertas pendientes, atendidas y descartadas, con su línea de tiempo y la nota de quien las atendió.'],
  ['web-agente-chat', 'bynucleo.com/agente', 'Chat de Nico AI respondiendo sobre la humedad del día', 'Nico AI responde con las cifras del sistema y muestra cómo llegó a ellas.'],
  ['web-reportes', 'bynucleo.com/reportes', 'Reporte de calidad del aire listo para descargar en PDF', 'Reportes por área y periodo, listos en PDF y programables para llegar por correo.'],
]
const pestanas = $$('.pestanas [role="tab"]')
const vistaImg = $('#vistaImg')
let vistaActual = 0
let autoVistas = null
const mostrarVista = (n) => {
  if (n === vistaActual) return
  vistaActual = n
  const [archivo, url, alt, nota] = VISTAS[n]
  pestanas.forEach((b, k) => { b.setAttribute('aria-selected', String(k === n)); b.tabIndex = k === n ? 0 : -1 })
  pestanas[n].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducido ? 'auto' : 'smooth' })
  $('#vistaUrl').textContent = url
  $('#vistaNota').textContent = nota
  vistaImg.classList.add('cambiando')
  const nueva = new Image()
  nueva.onload = () => { vistaImg.src = nueva.src; vistaImg.alt = alt; vistaImg.classList.remove('cambiando') }
  nueva.src = `medios/capturas/${archivo}.webp`
}
pestanas.forEach((b, k) => {
  b.tabIndex = k === 0 ? 0 : -1
  b.addEventListener('click', () => { clearInterval(autoVistas); autoVistas = null; mostrarVista(k) })
  b.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (k + d + pestanas.length) % pestanas.length
    clearInterval(autoVistas); autoVistas = null
    mostrarVista(n); pestanas[n].focus()
  })
})
// Avanza solo mientras la sección está a la vista y nadie ha tocado las pestañas
if (!reducido) {
  let tocada = false
  pestanas.forEach((b) => b.addEventListener('click', () => { tocada = true }))
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !tocada && !autoVistas) {
      autoVistas = setInterval(() => mostrarVista((vistaActual + 1) % VISTAS.length), 5500)
    } else if (!en.isIntersecting && autoVistas) {
      clearInterval(autoVistas); autoVistas = null
    }
  }, { threshold: 0.35 }).observe($('#vista'))
}

// ---------- Puntos del dispositivo ----------
const puntos = $$('.punto')
const info = $('#puntoInfo')
puntos.forEach((p) => p.addEventListener('click', () => {
  puntos.forEach((q) => q.setAttribute('aria-pressed', String(q === p)))
  info.textContent = p.dataset.punto
}))
puntos.forEach((p) => p.setAttribute('aria-pressed', 'false'))

// ---------- Videos: solo se reproducen a la vista ----------
$$('video').forEach((v) => {
  if (reducido) { v.removeAttribute('autoplay'); v.pause(); return }
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting) v.play().catch(() => {})
    else v.pause()
  }, { threshold: 0.2 }).observe(v)
})

// ---------- Nico guía: una frase por sección ----------
const guia = $('#guia')
const guiaTexto = $('#guiaTexto')
const movil = window.matchMedia('(max-width: 560px)')
let guiaCerrada = false
try { guiaCerrada = sessionStorage.getItem('guiaCerrada') === '1' } catch { /* sin almacenamiento */ }
let plegar = null
const decir = (texto) => {
  if (guiaCerrada || guiaTexto.textContent === texto) return
  guiaTexto.classList.add('cambiando')
  setTimeout(() => { guiaTexto.textContent = texto; guiaTexto.classList.remove('cambiando') }, 200)
  guia.classList.remove('mini')
  clearTimeout(plegar)
  if (movil.matches) plegar = setTimeout(() => guia.classList.add('mini'), 4500)
}
const observarGuia = new IntersectionObserver((entradas) => {
  entradas.forEach((en) => {
    if (!en.isIntersecting) return
    const inicio = en.target.id === 'inicio'
    guia.hidden = guiaCerrada || inicio
    if (!inicio) decir(en.target.dataset.guia)
  })
}, { rootMargin: '-50% 0px -50% 0px' })
$$('[data-guia]').forEach((s) => observarGuia.observe(s))
guia.addEventListener('click', (e) => { if (e.target !== $('#guiaCerrar')) guia.classList.remove('mini') })
$('#guiaCerrar').addEventListener('click', () => {
  guiaCerrada = true
  guia.hidden = true
  try { sessionStorage.setItem('guiaCerrada', '1') } catch { /* sin almacenamiento */ }
})

// ---------- Planes ----------
let periodo = 'mes'
const precioDe = (p) => (periodo === 'anio' ? p.precio * (1 - DESCUENTO_ANUAL) : p.precio)
const enlaceContacto = (asunto) => `mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent('Núcleo · ' + asunto)}`
const pintarPlanes = () => {
  $('#planesLista').innerHTML = PLANES.map((p) => {
    const precio = precioDe(p)
    const ahorro = periodo === 'anio' && p.precio > 0 ? `Ahorras ${pesos(p.precio * DESCUENTO_ANUAL * 12)} al año` : ''
    const href = p.url || enlaceContacto('Plan ' + p.nombre)
    return `
      <article class="plan${p.destacado ? ' plan--destacado' : ''} revelar visible">
        <div class="plan__cab">
          <div class="plan__nombre">Plan ${p.nombre}${p.destacado ? ' <span class="chip chip--lima">Más elegido</span>' : ''}</div>
          <p class="plan__desc">${p.desc}</p>
          <div class="plan__precio"><strong>${precio === 0 ? '$0' : pesos(precio)}</strong><span>MXN / mes${periodo === 'anio' && p.precio > 0 ? ', pago anual' : ''}</span></div>
          <p class="plan__ahorro">${ahorro}</p>
          <a class="btn ${p.destacado ? 'btn--lima' : 'btn--blanco'}" href="${href}">${p.cta}</a>
        </div>
        <div class="plan__limites">
          <div class="limite"><b>${p.limites.dispositivos}</b><span>${p.limites.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}</span></div>
          <div class="limite"><b>${p.limites.almacenamiento}</b><span>almacenamiento</span></div>
          <div class="limite"><b>${p.limites.nicoDia}</b><span>peticiones a Nico / día</span></div>
          <div class="limite"><b>${p.limites.nicoHora}</b><span>peticiones a Nico / hora</span></div>
        </div>
        <div class="plan__incluye">
          <ul class="lista-check">
            <li>Historial de ${p.limites.historial}</li>
            ${p.incluye.map((t) => `<li>${t}</li>`).join('')}
          </ul>
        </div>
      </article>`
  }).join('')
}
const celda = (v) => (v === true ? '<td class="si">Sí</td>' : v === false ? '<td class="no">—</td>' : `<td>${v}</td>`)
$('#tablaPlanes').innerHTML = `
  <thead><tr><th scope="col">Incluye</th>${PLANES.map((p) => `<th scope="col">${p.nombre}</th>`).join('')}<th scope="col">Empresa</th></tr></thead>
  <tbody>${COMPARAR.map(([etq, fn, emp]) => `<tr><th scope="row">${etq}</th>${PLANES.map((p) => celda(fn(p))).join('')}${celda(emp)}</tr>`).join('')}</tbody>`
$('#precioEquipo').textContent = pesos(PRECIO_EQUIPO) + ' MXN'
$$('.periodo__op').forEach((b) => b.addEventListener('click', () => {
  periodo = b.dataset.periodo
  $$('.periodo__op').forEach((o) => o.setAttribute('aria-pressed', String(o === b)))
  pintarPlanes()
}))
pintarPlanes()
$$('[data-contacto]').forEach((a) => { a.href = enlaceContacto(a.dataset.contacto) })

$('#anio').textContent = new Date().getFullYear()
