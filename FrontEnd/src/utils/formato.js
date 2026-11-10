// Fechas y números para mostrar. Las fechas llegan en ISO 8601 con zona horaria.
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const dos = (n) => String(n).padStart(2, '0')
export const hora = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`
}
export const horaSeg = (iso) => {
  const d = new Date(iso)
  return `${hora(iso)}:${dos(d.getSeconds())}`
}
export const fechaCorta = (iso) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}
export const fechaLarga = (iso) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}
export const mesAnio = (iso) => {
  const d = new Date(iso)
  return `${MESES_LARGOS[d.getMonth()]} ${d.getFullYear()}`
}
export const hoyTexto = () => {
  const d = new Date()
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`
}
export const esHoy = (iso) => new Date(iso).toDateString() === new Date().toDateString()
export const esAyer = (iso) => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return new Date(iso).toDateString() === d.toDateString()
}

// «hace 4 s», «hace 6 min», «hace 2 h», «Ayer, 17:42», «12 ago, 08:10».
export function haceCuanto(iso) {
  if (!iso) return 'Nunca'
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seg < 1) return 'Ahora'
  if (seg < 60) return `hace ${seg} s`
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`
  if (esHoy(iso)) return `hace ${Math.round(seg / 3600)} h`
  if (esAyer(iso)) return `Ayer, ${hora(iso)}`
  return `${fechaCorta(iso)}, ${hora(iso)}`
}

// Versión corta para la tarjeta de cifras: «Ahora», «5 min», «2 h».
export const accesoCorto = (iso) => {
  const t = haceCuanto(iso)
  return t.endsWith(' s') ? 'Ahora' : t.replace('hace ', '')
}

export const periodo = (inicio, fin) => {
  const a = new Date(inicio)
  const b = new Date(new Date(fin).getTime() - 1)
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`
  return `${fechaCorta(inicio)} – ${fechaLarga(b.toISOString())}`
}

// Número con decimales fijos; el contrato manda los decimales como texto ("71.00").
export const num = (v, decimales = 1) => (v == null || v === '' ? '—' : Number(v).toFixed(decimales))
export const miles = (n) => Number(n).toLocaleString('es-MX').replace(/,/g, ' ')

// Aviso cuando la gráfica muestra las últimas lecturas guardadas en lugar del periodo actual.
export const avisoUltima = (ultima) => (ultima ? `Sin lecturas recientes · se muestran hasta el ${fechaCorta(ultima)}, ${hora(ultima)}` : '')

// Punto de una serie de lecturas para las gráficas: en «hoy» el eje muestra la hora; en 7 y 30 días, la fecha.
export const puntoSerie = (p, periodo = 'hoy') => ({
  label: periodo === 'hoy' ? hora(p.periodo) : fechaCorta(p.periodo),
  time: periodo === '30' ? fechaCorta(p.periodo) : `${fechaCorta(p.periodo)} · ${hora(p.periodo)}`,
  value: Number(p.promedio),
})
