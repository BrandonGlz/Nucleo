// Detección y grabado de un ESP32 desde el navegador (Web Serial).
//
// - detectar(): si la placa tiene MicroPython entra a su REPL y lee qué tiene (chip, versión de
//   MicroPython y de Núcleo, código del dispositivo). Si no responde, pregunta el chip al
//   cargador de arranque con esptool.
// - grabarMicropython(): borra la memoria y graba MicroPython con esptool-js.
// - copiarArchivos(): copia el firmware de Núcleo y el secrets.py por el REPL, verificando el
//   SHA-256 de cada archivo.
import { Repl, ErrorPlaca } from './repl'

export const ESPRESSIF = 0x303a
// Puentes USB-serie comunes en placas ESP32 (CP210x, CH34x, FTDI) y el USB nativo de Espressif.
export const FILTROS = [0x10c4, 0x1a86, 0x0403, ESPRESSIF].map((usbVendorId) => ({ usbVendorId }))

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

export const soportado = () => typeof navigator !== 'undefined' && 'serial' in navigator
export const datosPuerto = (port) => port.getInfo?.() ?? {}
export const esNativo = (port) => datosPuerto(port).usbVendorId === ESPRESSIF

export function nombreChip(maquina = '') {
  const m = maquina.toUpperCase()
  if (m.includes('ESP32S3')) return 'ESP32-S3'
  if (m.includes('ESP32S2')) return 'ESP32-S2'
  if (m.includes('ESP32C3')) return 'ESP32-C3'
  if (m.includes('ESP32C6')) return 'ESP32-C6'
  if (m.includes('ESP32')) return 'ESP32'
  return maquina || 'Desconocido'
}

// Se ejecuta en la placa. Alarga el watchdog del firmware (60 s) para que no la reinicie
// mientras está detenida en el REPL; al terminar siempre se reinicia la placa.
const SONDA = `
import os, json
try:
    import machine
    machine.WDT(timeout=3600000)
except Exception:
    pass
def _leer(n, clave):
    try:
        import re
        m = re.search(clave + ' *= *.([^"\\']+)', open(n).read())
        return m.group(1) if m else None
    except Exception:
        return None
_u = os.uname()
print(json.dumps({'mp': _u.release, 'maquina': _u.machine, 'archivos': os.listdir(),
    'version': _leer('config.py', 'FIRMWARE_VERSION'), 'codigo': _leer('secrets.py', 'CODIGO_MQTT'),
    'modo': _leer('secrets.py', 'MODO')}))
`

// Reinicia la placa por las líneas DTR/RTS (puentes USB-serie; en USB nativo también funciona).
async function reiniciarPorLineas(port) {
  try {
    await port.setSignals({ dataTerminalReady: false, requestToSend: true })
    await pausa(120)
    await port.setSignals({ dataTerminalReady: false, requestToSend: false })
  } catch {
    // Sin control de líneas.
  }
}

// Intenta llegar al REPL de MicroPython. Devuelve el Repl abierto o null (puerto cerrado).
export async function abrirRepl(port, { reiniciar = true } = {}) {
  const repl = new Repl(port)
  await repl.abrir()
  try {
    if (await repl.interrumpir()) return repl
    if (reiniciar && !esNativo(port)) {
      await reiniciarPorLineas(port)
      if (await repl.interrumpir({ insistir: 6000 })) return repl
    }
  } catch {
    // sin respuesta
  }
  await repl.cerrar()
  return null
}

export async function leerPlaca(repl) {
  const salida = await repl.ejecutar(SONDA)
  const datos = JSON.parse(salida.trim().split('\n').pop())
  return {
    micropython: true,
    version_mp: datos.mp,
    chip: nombreChip(datos.maquina),
    maquina: datos.maquina,
    nucleo: datos.archivos.includes('main.py') && datos.archivos.includes('nucleo'),
    version: datos.version,
    codigo: datos.codigo,
    puente: datos.modo === 'puente',
    configurada: datos.archivos.includes('secrets.py'),
  }
}

async function cargador(port, terminal) {
  const { ESPLoader, Transport } = await import('esptool-js')
  const transport = new Transport(port, false)
  const loader = new ESPLoader({ transport, baudrate: 460800, romBaudrate: 115200, terminal })
  await loader.main('default_reset')
  return { loader, transport }
}

const terminalDe = (log) => ({
  clean() {},
  writeLine(t) {
    if (t?.trim()) log(t.trim())
  },
  write(t) {
    if (t?.trim()) log(t.trim())
  },
})

// Placa sin MicroPython (o que no responde): el cargador de arranque dice qué chip es.
export async function chipPorCargador(port, log) {
  const { loader, transport } = await cargador(port, terminalDe(log))
  try {
    return { micropython: false, chip: loader.chip.CHIP_NAME, nucleo: false, configurada: false }
  } finally {
    try {
      await loader.after('hard_reset')
    } catch {
      // nada
    }
    await transport.disconnect().catch(() => {})
  }
}

export async function grabarMicropython(port, imagen, { chipEsperado, log, avance }) {
  const { loader, transport } = await cargador(port, terminalDe(log))
  try {
    const chip = loader.chip.CHIP_NAME
    if (chipEsperado && chip !== chipEsperado) {
      throw new ErrorPlaca(`La imagen es para ${chipEsperado} y la placa es ${chip}.`)
    }
    log(`Borrando la memoria del ${chip}…`)
    avance({ etapa: 'borrar' })
    await loader.eraseFlash()
    log('Grabando MicroPython…')
    await loader.writeFlash({
      fileArray: [{ data: imagen.datos, address: imagen.direccion }],
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (_i, escrito, total) => avance({ etapa: 'grabar', valor: escrito / total }),
    })
    log('MicroPython grabado. Reiniciando la placa…')
    await loader.after('hard_reset')
  } finally {
    await transport.disconnect().catch(() => {})
  }
}

// Espera a que vuelva a aparecer un puerto ya autorizado (tras un reinicio el USB nativo se
// vuelve a anunciar). Devuelve el puerto o null.
export async function esperarPuerto(previo, ms = 12000) {
  const { usbVendorId } = datosPuerto(previo)
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    const puertos = await navigator.serial.getPorts()
    const igual = puertos.find((p) => p === previo) ?? puertos.find((p) => datosPuerto(p).usbVendorId === usbVendorId)
    if (igual) {
      try {
        await igual.open({ baudRate: 115200 })
        await igual.close()
        return igual
      } catch {
        // aún no está listo o lo tiene otro
      }
    }
    await pausa(500)
  }
  return null
}

const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const aBase64 = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const py = (s) => JSON.stringify(s) // una cadena JSON también es una cadena válida de Python

const PREPARAR = `
import os, binascii, hashlib
def _carpetas(r):
    a = ''
    for p in r.split('/')[:-1]:
        a = a + '/' + p if a else p
        try:
            os.mkdir(a)
        except OSError:
            pass
def _borrar(r):
    try:
        if os.stat(r)[0] & 0x4000:
            for n in os.listdir(r):
                _borrar(r + '/' + n)
            os.rmdir(r)
        else:
            os.remove(r)
    except OSError:
        pass
def _sha(r):
    h = hashlib.sha256()
    with open(r, 'rb') as f:
        while True:
            d = f.read(1024)
            if not d:
                break
            h.update(d)
    return binascii.hexlify(h.digest()).decode()
`

// archivos: [{ruta, bytes}]. Limpia lo que dejó una actualización remota a medias, para que la
// placa no «vuelva atrás» a la versión anterior al arrancar.
export async function copiarArchivos(repl, archivos, { log, avance }) {
  await repl.ejecutar(PREPARAR)
  await repl.ejecutar("for _r in ('ota', 'anterior', 'ota_estado.json'):\n    _borrar(_r)")
  const total = archivos.reduce((s, a) => s + a.bytes.length, 0)
  let hecho = 0
  for (const { ruta, bytes } of archivos) {
    log(`Copiando ${ruta} (${bytes.length.toLocaleString('es-MX')} bytes)`)
    await repl.ejecutar(`_carpetas(${py(ruta)})\n_f = open(${py(ruta + '.tmp')}, 'wb')`)
    for (let i = 0; i < bytes.length; i += 3072) {
      const trozo = bytes.subarray(i, i + 3072)
      await repl.ejecutar(`_f.write(binascii.a2b_base64(${py(aBase64(trozo))}))`)
      hecho += trozo.length
      avance({ etapa: 'copiar', valor: hecho / total })
    }
    await repl.ejecutar('_f.close()')
    const esperado = aHex(await crypto.subtle.digest('SHA-256', bytes))
    const real = (await repl.ejecutar(`print(_sha(${py(ruta + '.tmp')}))`)).trim()
    if (real !== esperado) throw new ErrorPlaca(`${ruta} llegó dañado a la placa; vuelve a intentarlo.`)
    await repl.ejecutar(`_borrar(${py(ruta)})\nos.rename(${py(ruta + '.tmp')}, ${py(ruta)})`)
  }
}

export const archivosDeApi = (lista) => lista.map((a) => ({ ruta: a.ruta, bytes: deBase64(a.contenido) }))
export const textoABytes = (t) => new TextEncoder().encode(t)

export async function reiniciar(repl) {
  try {
    await repl.soltar('import machine\nmachine.reset()\n')
  } catch {
    // al reiniciarse corta la conexión
  }
  await repl.cerrar()
}
