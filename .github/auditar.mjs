// npm audit de dependencias de producción: falla con vulnerabilidades altas o críticas, salvo las que
// aún no tienen versión corregida y están en .github/audit-ignorados.json (con motivo y fecha de revisión).
// Al pasar la fecha, el ignorado deja de valer y el chequeo vuelve a fallar para revisarlo.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ignorados = JSON.parse(readFileSync(new URL('./audit-ignorados.json', import.meta.url)))
const hoy = new Date().toISOString().slice(0, 10)
let salida
try {
  salida = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
} catch (e) {
  salida = e.stdout // npm audit sale con código 1 cuando encuentra algo
}
const vulns = JSON.parse(salida).vulnerabilities || {}
const fallas = []
for (const [paquete, v] of Object.entries(vulns)) {
  for (const a of v.via) {
    if (typeof a !== 'object' || !['high', 'critical'].includes(a.severity)) continue
    const id = (a.url || '').split('/').pop()
    const ig = ignorados[id]
    if (ig && ig.revisar >= hoy) {
      console.log(`ignorado ${id} (${paquete}): ${ig.motivo} · revisar el ${ig.revisar}`)
      continue
    }
    fallas.push(`${a.severity} ${id} ${paquete} ${a.range}: ${a.title}`)
  }
}
if (fallas.length) {
  console.error('Vulnerabilidades altas o críticas:\n' + [...new Set(fallas)].join('\n'))
  process.exit(1)
}
console.log('Sin vulnerabilidades altas o críticas pendientes.')
