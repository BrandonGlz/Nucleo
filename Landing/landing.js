// Descubre Núcleo. Sin dependencias: navegación, animaciones de entrada y salida con el scroll,
// títulos por palabra, parallax, Nico en soft 3D (inclinación con el puntero), contadores, pestañas
// de la plataforma, puntos y vistas del dispositivo, Nico guía, planes y contacto.

// Planes: cambia aquí precios y límites; las tarjetas y la tabla se generan con estos datos.
// Precios mensuales en MXN sin IVA; el anual aplica DESCUENTO_ANUAL.
const CORREO_CONTACTO = 'nucleo.avisos@gmail.com'
const DESCUENTO_ANUAL = 0.2
const PRECIO_EQUIPO = 1600
const PLANES = [
  {
    nombre: 'Semilla', desc: 'Para probar Núcleo en un espacio.', precio: 0, cta: 'Pedir acceso gratis',
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
// Filas de la tabla comparativa: [etiqueta, valor por plan, valor de Empresa]
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
const punteroFino = window.matchMedia('(pointer: fine)').matches

/* ---------- Tema claro / oscuro ---------- */
const raiz = document.documentElement
const carpetaTema = () => (raiz.dataset.tema === 'claro' ? 'claro' : 'oscuro')
const temaBtn = document.getElementById('temaBtn')
function aplicarTema (tema, guardar) {
  raiz.dataset.tema = tema
  if (guardar) { try { localStorage.setItem('tema', tema) } catch { /* sin almacenamiento */ } }
  const carpeta = carpetaTema()
  document.querySelectorAll('img[src*="medios/capturas/"]').forEach((img) => {
    img.src = img.getAttribute('src').replace(/capturas\/(claro|oscuro)\//, `capturas/${carpeta}/`)
  })
  const meta = document.getElementById('colorTema')
  if (meta) meta.content = tema === 'claro' ? '#EAECE6' : '#0E0F0F'
  if (temaBtn) temaBtn.setAttribute('aria-label', tema === 'claro' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro')
}
aplicarTema(carpetaTema(), false)
temaBtn?.addEventListener('click', () => {
  raiz.classList.add('cambiando-tema')
  aplicarTema(carpetaTema() === 'claro' ? 'oscuro' : 'claro', true)
  setTimeout(() => raiz.classList.remove('cambiando-tema'), 450)
})
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  let guardado = null
  try { guardado = localStorage.getItem('tema') } catch { /* sin almacenamiento */ }
  if (!guardado) aplicarTema(e.matches ? 'claro' : 'oscuro', false)
})
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const pesos = (n) => '$' + Math.round(n).toLocaleString('es-MX')

// ---------- Planes (se pintan primero para que entren en las animaciones) ----------
let periodo = 'mes'
const precioDe = (p) => (periodo === 'anio' ? p.precio * (1 - DESCUENTO_ANUAL) : p.precio)
const asuntoPlan = (p) => `Plan ${p.nombre} (${periodo === 'anio' ? 'anual' : 'mensual'})`
const pintarPlanes = (animar) => {
  $('#planesLista').innerHTML = PLANES.map((p, k) => {
    const precio = precioDe(p)
    const ahorro = periodo === 'anio' && p.precio > 0 ? `Ahorras ${pesos(p.precio * DESCUENTO_ANUAL * 12)} al año` : ''
    return `
      <article class="plan${p.destacado ? ' plan--destacado' : ''}${animar ? ' anim' : ''}" data-anim="subir" style="--d:${k * 0.1}s">
        <div class="plan__nombre">Plan ${p.nombre}${p.destacado ? ' <span class="chip chip--lima">Más elegido</span>' : ''}</div>
        <p class="plan__desc">${p.desc}</p>
        <div class="plan__precio"><strong>${precio === 0 ? '$0' : pesos(precio)}</strong><span>MXN / mes${periodo === 'anio' && p.precio > 0 ? ', pago anual' : ''}</span></div>
        <p class="plan__ahorro">${ahorro}</p>
        <a class="btn ${p.destacado ? 'btn--lima' : 'btn--contorno'}" href="#" data-contacto="${asuntoPlan(p)}">${p.cta}</a>
        <div class="plan__limites">
          <div class="limite"><b>${p.limites.dispositivos}</b><span>${p.limites.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}</span></div>
          <div class="limite"><b>${p.limites.almacenamiento}</b><span>almacenamiento</span></div>
          <div class="limite"><b>${p.limites.nicoDia}</b><span>peticiones a Nico / día</span></div>
          <div class="limite"><b>${p.limites.nicoHora}</b><span>peticiones a Nico / hora</span></div>
        </div>
        <ul class="lista-check">
          <li>Historial de ${p.limites.historial}</li>
          ${p.incluye.map((t) => `<li>${t}</li>`).join('')}
        </ul>
      </article>`
  }).join('')
}
pintarPlanes(true)
const celda = (v) => (v === true ? '<td class="si">Sí</td>' : v === false ? '<td class="no">—</td>' : `<td>${v}</td>`)
$('#tablaPlanes').innerHTML = `
  <thead><tr><th scope="col">Incluye</th>${PLANES.map((p) => `<th scope="col">${p.nombre}</th>`).join('')}<th scope="col">Empresa</th></tr></thead>
  <tbody>${COMPARAR.map(([etq, fn, emp]) => `<tr><th scope="row">${etq}</th>${PLANES.map((p) => celda(fn(p))).join('')}${celda(emp)}</tr>`).join('')}</tbody>`
$('#precioEquipo').textContent = pesos(PRECIO_EQUIPO) + ' MXN'
$('#precioNucleoValor').textContent = pesos(PRECIO_EQUIPO)
$('#precioBtn').addEventListener('click', (e) => {
  const abierto = e.currentTarget.getAttribute('aria-expanded') === 'true'
  e.currentTarget.setAttribute('aria-expanded', String(!abierto))
  $('#precioNucleo').hidden = abierto
})
$$('.periodo__op').forEach((b) => b.addEventListener('click', () => {
  periodo = b.dataset.periodo
  $$('.periodo__op').forEach((o) => o.setAttribute('aria-pressed', String(o === b)))
  pintarPlanes(false)
}))

// ---------- Contacto: abre el correo y además copia la dirección ----------
const aviso = $('#aviso')
let avisoTiempo = null
const mostrarAviso = (html) => {
  aviso.innerHTML = html
  aviso.hidden = false
  clearTimeout(avisoTiempo)
  avisoTiempo = setTimeout(() => { aviso.hidden = true }, 4200)
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-contacto]')
  if (!a) return
  e.preventDefault()
  const asunto = 'Núcleo · ' + a.dataset.contacto
  window.location.href = `mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent(asunto)}`
  const copiado = navigator.clipboard?.writeText(CORREO_CONTACTO)
  const texto = `Te abrimos tu correo para escribir a <b>${CORREO_CONTACTO}</b>`
  if (copiado) copiado.then(() => mostrarAviso(texto + ' (dirección copiada).'), () => mostrarAviso(texto + '.'))
  else mostrarAviso(texto + '.')
})

// ---------- Navegación ----------
const nav = $('#nav')
const menuBtn = $('#menuBtn')
const menu = $('#menuMovil')
const barra = $('#progreso')
const alScroll = () => {
  nav.classList.toggle('con-fondo', window.scrollY > 20 || !menu.hidden)
  const total = document.documentElement.scrollHeight - window.innerHeight
  barra.style.transform = `scaleX(${total > 0 ? Math.min(1, window.scrollY / total) : 0})`
}
window.addEventListener('scroll', alScroll, { passive: true })
alScroll()
const cerrarMenu = () => {
  menu.hidden = true
  menuBtn.setAttribute('aria-expanded', 'false')
  menuBtn.setAttribute('aria-label', 'Abrir menú')
  alScroll()
}
menuBtn.addEventListener('click', () => {
  const abrir = menu.hidden
  menu.hidden = !abrir
  menuBtn.setAttribute('aria-expanded', String(abrir))
  menuBtn.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú')
  alScroll()
})
$$('a', menu).forEach((a) => a.addEventListener('click', cerrarMenu))
document.addEventListener('click', (e) => { if (!menu.hidden && !nav.contains(e.target)) cerrarMenu() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) cerrarMenu() })

// Enlace activo del menú según la sección visible
const enlaces = $$('.nav__links a')
const observarSecciones = new IntersectionObserver((entradas) => {
  entradas.forEach((en) => {
    if (!en.isIntersecting) return
    enlaces.forEach((a) => a.classList.toggle('activo', a.getAttribute('href') === '#' + en.target.id))
  })
}, { rootMargin: '-45% 0px -50% 0px' })
$$('main section[id]').forEach((s) => observarSecciones.observe(s))

// ---------- Títulos partidos por palabra ----------
$$('.titulo-partido').forEach((t) => {
  let i = 0
  const partir = (nodo) => {
    ;[...nodo.childNodes].forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment()
        n.textContent.split(/(\s+)/).forEach((trozo) => {
          if (!trozo) return
          if (/^\s+$/.test(trozo)) { frag.append(' '); return }
          const p = document.createElement('span')
          p.className = 'palabra'
          const dentro = document.createElement('span')
          dentro.style.setProperty('--i', i++)
          dentro.textContent = trozo
          p.append(dentro)
          frag.append(p)
        })
        n.replaceWith(frag)
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        partir(n)
      }
    })
  }
  partir(t)
})

// ---------- Entrada y salida con el scroll ----------
// Al entrar al viewport se marca .dentro; al salir por arriba, .salio (se desvanece hacia arriba);
// al salir por abajo vuelve al estado inicial para entrar de nuevo al bajar.
const animables = () => $$('.anim, .titulo-partido')
if (reducido) {
  animables().forEach((el) => el.classList.add('dentro'))
} else {
  const observarAnim = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => {
      const el = en.target
      if (en.isIntersecting) {
        el.classList.add('dentro')
        el.classList.remove('salio')
      } else {
        el.classList.remove('dentro')
        el.classList.toggle('salio', en.boundingClientRect.top < 0)
      }
    })
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' })
  animables().forEach((el) => observarAnim.observe(el))
}

// ---------- Contadores ----------
const contar = (el) => {
  const fin = Number(el.dataset.contar)
  if (reducido || !fin) return
  const inicio = performance.now()
  const paso = (t) => {
    const k = Math.min(1, (t - inicio) / 1200)
    el.textContent = Math.round(fin * (1 - Math.pow(1 - k, 3)))
    if (k < 1) requestAnimationFrame(paso)
  }
  requestAnimationFrame(paso)
}
const observarCifras = new IntersectionObserver((entradas) => {
  entradas.forEach((en) => { if (en.isIntersecting) { contar(en.target); observarCifras.unobserve(en.target) } })
}, { threshold: 0.6 })
$$('[data-contar]').forEach((el) => observarCifras.observe(el))

// ---------- Parallax suave ----------
const capas = $$('[data-parallax]')
if (!reducido && capas.length) {
  let pendiente = false
  const mover = () => {
    pendiente = false
    const alto = window.innerHeight
    capas.forEach((el) => {
      const r = el.parentElement.getBoundingClientRect()
      const centro = r.top + r.height / 2 - alto / 2
      el.style.transform = `translateY(${(centro * Number(el.dataset.parallax)).toFixed(1)}px)`
    })
  }
  window.addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(mover) } }, { passive: true })
  mover()
}

// ---------- Soft 3D: Nico se inclina siguiendo el puntero ----------
if (punteroFino && !reducido) {
  $$('[data-inclinar]').forEach((caja) => {
    const img = $('.soft3d__img', caja)
    caja.addEventListener('pointermove', (e) => {
      const r = caja.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      img.style.setProperty('--ry', `${(x * 18).toFixed(1)}deg`)
      img.style.setProperty('--rx', `${(-y * 14).toFixed(1)}deg`)
    })
    caja.addEventListener('pointerleave', () => { img.style.setProperty('--ry', '0deg'); img.style.setProperty('--rx', '0deg') })
  })
  // Luz que sigue al puntero dentro de las celdas del bento
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest?.('.celda')
    if (!c) return
    const r = c.getBoundingClientRect()
    c.style.setProperty('--mx', `${e.clientX - r.left}px`)
    c.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, { passive: true })
}

// ---------- Saludo de Nico en el hero ----------
const SALUDOS = [
  '¡Hola! Soy Nico, el guía de Núcleo.',
  'Mido la temperatura, la humedad y el aire de tus espacios.',
  'Si algo se sale de rango, te aviso al momento.',
  'Y si tienes dudas, pregúntame: te respondo con tus datos.',
]
const saludo = $('#saludo')
if (reducido) {
  saludo.textContent = SALUDOS[0]
  saludo.classList.add('listo')
} else {
  let i = 0
  const escribir = (texto, n = 0) => {
    saludo.textContent = texto.slice(0, n)
    if (n < texto.length) return setTimeout(() => escribir(texto, n + 1), 32)
    setTimeout(() => { i = (i + 1) % SALUDOS.length; escribir(SALUDOS[i]) }, 2600)
  }
  setTimeout(() => escribir(SALUDOS[0]), 700)
}

// ---------- Pestañas de la plataforma ----------
const VISTAS = [
  ['web-panel', 'bynucleo.com/panel', 'Panel de Núcleo con temperatura en vivo, tendencia y alertas recientes', 'Temperatura en vivo, tendencia del día, alertas recientes y los dispositivos que requieren atención.'],
  ['web-dispositivos', 'bynucleo.com/dispositivos', 'Lista de dispositivos con su estado, batería y señal', 'Cada Núcleo con su área, estado, batería, señal y última lectura. Filtra por estado o búscalo por código.'],
  ['web-mediciones', 'bynucleo.com/mediciones', 'Histórico de humedad del día con gráfica y tabla de lecturas', 'Histórico por dispositivo y variable: gráfica con el rango permitido y cada lectura con su hora.'],
  ['web-alertas', 'bynucleo.com/alertas', 'Alertas pendientes con su línea de tiempo', 'Alertas pendientes, atendidas y descartadas, con su línea de tiempo y la nota de quien las atendió.'],
  ['web-agente-chat', 'bynucleo.com/agente', 'Chat de Nico AI respondiendo sobre la humedad del día', 'Nico AI responde con las cifras del sistema y muestra cómo llegó a ellas.'],
  ['web-reportes', 'bynucleo.com/reportes', 'Reporte de calidad del aire listo para descargar en PDF', 'Reportes por área y periodo, listos en PDF y programables para llegar por correo.'],
]
const DURACION_VISTA = 6000
const pestanas = $$('.pestanas [role="tab"]')
const vistaImg = $('#vistaImg')
const avance = $('#vistaAvance')
const escaneo = $('.escaneo')
let vistaActual = 0
let autoVistas = null
let tocada = false
const reiniciarAvance = () => {
  if (reducido || tocada) { avance.style.width = '0'; return }
  avance.style.transition = 'none'
  avance.style.width = '0'
  void avance.offsetWidth
  avance.style.transition = `width ${DURACION_VISTA}ms linear`
  avance.style.width = '100%'
}
const mostrarVista = (n) => {
  if (n === vistaActual) return
  vistaActual = n
  const [archivo, url, alt, nota] = VISTAS[n]
  pestanas.forEach((b, k) => { b.setAttribute('aria-selected', String(k === n)); b.tabIndex = k === n ? 0 : -1 })
  const barraPestanas = pestanas[n].parentElement
  barraPestanas.scrollTo({ left: pestanas[n].offsetLeft - barraPestanas.clientWidth / 2 + pestanas[n].clientWidth / 2, behavior: reducido ? 'auto' : 'smooth' })
  $('#vistaUrl').textContent = url
  $('#vistaNota').textContent = nota
  vistaImg.classList.add('cambiando')
  const nueva = new Image()
  nueva.onload = () => {
    vistaImg.src = nueva.src
    vistaImg.alt = alt
    vistaImg.classList.remove('cambiando')
    escaneo.classList.remove('activo'); void escaneo.offsetWidth; escaneo.classList.add('activo')
  }
  nueva.src = `medios/capturas/${carpetaTema()}/${archivo}.webp`
  reiniciarAvance()
}
const detenerAuto = () => { tocada = true; clearInterval(autoVistas); autoVistas = null; avance.style.transition = 'none'; avance.style.width = '0' }
pestanas.forEach((b, k) => {
  b.tabIndex = k === 0 ? 0 : -1
  b.addEventListener('click', () => { detenerAuto(); mostrarVista(k) })
  b.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (k + d + pestanas.length) % pestanas.length
    detenerAuto(); mostrarVista(n); pestanas[n].focus()
  })
})
// Avanza solo mientras la vista está en pantalla y nadie ha tocado las pestañas
if (!reducido) {
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !tocada && !autoVistas) {
      reiniciarAvance()
      autoVistas = setInterval(() => mostrarVista((vistaActual + 1) % VISTAS.length), DURACION_VISTA)
    } else if (!en.isIntersecting && autoVistas) {
      clearInterval(autoVistas); autoVistas = null
    }
  }, { threshold: 0.35 }).observe($('#vista'))
}

// ---------- Partes del dispositivo: tocar el dibujo o la etiqueta explica su función ----------
const zonas = $$('.zona')
const elegirParte = (clave) => {
  const z = zonas.find((q) => q.dataset.parte === clave)
  $$('.zona, .parte').forEach((q) => q.setAttribute('aria-pressed', String(q.dataset.parte === clave)))
  const info = $('#parteInfo')
  info.innerHTML = ''
  const b = document.createElement('b'); b.textContent = z.dataset.titulo
  info.append(b, ' ' + z.dataset.info)
}
$$('.zona, .parte').forEach((q) => {
  q.setAttribute('aria-pressed', 'false')
  q.addEventListener('click', () => elegirParte(q.dataset.parte))
})

// ---------- Visor de las cuatro vistas ----------
const VISTAS_EQUIPO = ['Frente y lado derecho', 'Frente y lado izquierdo', 'Parte trasera', 'Por debajo']
const visor = $('#visor')
let vistaEquipo = 0
const verEquipo = (n) => {
  vistaEquipo = (n + VISTAS_EQUIPO.length) % VISTAS_EQUIPO.length
  $('#visorImg').src = `medios/dispositivo/vista-${vistaEquipo + 1}.webp`
  $('#visorImg').alt = `Dispositivo Núcleo: ${VISTAS_EQUIPO[vistaEquipo].toLowerCase()}, con medidas`
  $('#visorTitulo').textContent = VISTAS_EQUIPO[vistaEquipo]
  $('#visorCuenta').textContent = `${vistaEquipo + 1} / ${VISTAS_EQUIPO.length}`
}
$$('[data-vista-equipo]').forEach((b) => b.addEventListener('click', () => {
  verEquipo(Number(b.dataset.vistaEquipo))
  if (typeof visor.showModal === 'function') visor.showModal()
  else window.open($('#visorImg').src, '_blank', 'noopener')
}))
$('#visorCerrar').addEventListener('click', () => visor.close())
$('#visorAnt').addEventListener('click', () => verEquipo(vistaEquipo - 1))
$('#visorSig').addEventListener('click', () => verEquipo(vistaEquipo + 1))
visor.addEventListener('click', (e) => { if (e.target === visor) visor.close() })
visor.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') verEquipo(vistaEquipo - 1)
  if (e.key === 'ArrowRight') verEquipo(vistaEquipo + 1)
})

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
  setTimeout(() => { guiaTexto.textContent = texto; guiaTexto.classList.remove('cambiando') }, 220)
  guia.classList.remove('mini')
  clearTimeout(plegar)
  plegar = setTimeout(() => guia.classList.add('mini'), movil.matches ? 4500 : 5000)
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
guia.addEventListener('click', (e) => { if (!e.target.closest('#guiaCerrar')) guia.classList.remove('mini') })
$('#guiaCerrar').addEventListener('click', () => {
  guiaCerrada = true
  guia.hidden = true
  try { sessionStorage.setItem('guiaCerrada', '1') } catch { /* sin almacenamiento */ }
})

$('#anio').textContent = new Date().getFullYear()
