// REPL de MicroPython por Web Serial (como mpremote): interrumpe el programa, entra al modo
// «raw» y ejecuta código. Usa el modo raw-paste (con control de flujo de la placa) y, si la placa
// no lo soporta, el raw normal en trozos de 256 bytes.

const codificar = new TextEncoder()
const decodificar = new TextDecoder()
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
const aBytes = (x) => (typeof x === 'string' ? codificar.encode(x) : x)

function buscar(buf, patron) {
  fuera: for (let i = 0; i <= buf.length - patron.length; i++) {
    for (let j = 0; j < patron.length; j++) if (buf[i + j] !== patron[j]) continue fuera
    return i
  }
  return -1
}

export class ErrorPlaca extends Error {}

export class Repl {
  constructor(port) {
    this.port = port
    this.buf = new Uint8Array(0)
    this.cerrado = false
    this._avisar = null
  }

  async abrir() {
    await this.port.open({ baudRate: 115200, bufferSize: 8192 })
    this.escritor = this.port.writable.getWriter()
    this._leyendo = this._leer()
  }

  async _leer() {
    this.lector = this.port.readable.getReader()
    try {
      for (;;) {
        const { value, done } = await this.lector.read()
        if (done) break
        if (value?.length) {
          const nuevo = new Uint8Array(this.buf.length + value.length)
          nuevo.set(this.buf)
          nuevo.set(value, this.buf.length)
          this.buf = nuevo
          this._avisar?.()
        }
      }
    } catch {
      // Se desconectó la placa o se cerró el puerto.
    } finally {
      try {
        this.lector.releaseLock()
      } catch {
        // ya liberado
      }
      this.cerrado = true
      this._avisar?.()
    }
  }

  _esperarDatos(ms) {
    return new Promise((r) => {
      const t = setTimeout(() => {
        this._avisar = null
        r()
      }, ms)
      this._avisar = () => {
        clearTimeout(t)
        this._avisar = null
        r()
      }
    })
  }

  vaciar() {
    this.buf = new Uint8Array(0)
  }

  async escribir(datos) {
    await this.escritor.write(aBytes(datos))
  }

  // Devuelve lo recibido antes de `fin` y lo consume (incluido `fin`).
  async leerHasta(fin, ms = 5000) {
    const patron = aBytes(fin)
    const limite = Date.now() + ms
    for (;;) {
      const i = buscar(this.buf, patron)
      if (i >= 0) {
        const antes = this.buf.slice(0, i)
        this.buf = this.buf.slice(i + patron.length)
        return antes
      }
      if (this.cerrado) throw new ErrorPlaca('La placa se desconectó.')
      const resta = limite - Date.now()
      if (resta <= 0) throw new ErrorPlaca('La placa no respondió a tiempo.')
      await this._esperarDatos(resta)
    }
  }

  async leerBytes(n, ms = 3000) {
    const limite = Date.now() + ms
    while (this.buf.length < n) {
      if (this.cerrado) throw new ErrorPlaca('La placa se desconectó.')
      const resta = limite - Date.now()
      if (resta <= 0) throw new ErrorPlaca('La placa no respondió a tiempo.')
      await this._esperarDatos(resta)
    }
    const fuera = this.buf.slice(0, n)
    this.buf = this.buf.slice(n)
    return fuera
  }

  // Detiene el programa y espera el «>>>» del REPL. `insistir` manda Ctrl-C durante unos
  // segundos (útil justo después de un reinicio, antes de que arranque main.py).
  async interrumpir({ insistir = 0 } = {}) {
    this.vaciar()
    const limite = Date.now() + Math.max(insistir, 1500)
    while (Date.now() < limite) {
      await this.escribir('\r\x03\x03')
      try {
        await this.leerHasta('>>> ', 250)
        // Puede llegar más de un «>>>»: deja que se calme y empieza limpio.
        await pausa(150)
        this.vaciar()
        return true
      } catch (e) {
        if (this.cerrado) throw e
      }
    }
    return false
  }

  async entrarRaw() {
    this.vaciar()
    await this.escribir('\r\x01')
    await this.leerHasta('raw REPL; CTRL-B to exit\r\n>', 3000)
    this.raw = true
  }

  async _pegar(datos) {
    await this.escribir('\x05A\x01')
    const r = await this.leerBytes(2)
    if (r[0] === 0x52 && r[1] === 0x01) {
      const v = await this.leerBytes(2)
      const ventana = v[0] | (v[1] << 8)
      let libre = ventana
      let i = 0
      while (i < datos.length) {
        // La placa manda \x01 cada vez que libera otra ventana; \x04 = abortó.
        while (libre === 0 || this.buf.length) {
          if (!this.buf.length) await this._esperarDatos(3000)
          if (this.cerrado) throw new ErrorPlaca('La placa se desconectó.')
          if (!this.buf.length) throw new ErrorPlaca('La placa dejó de pedir datos.')
          const b = this.buf[0]
          this.buf = this.buf.slice(1)
          if (b === 0x01) libre += ventana
          else if (b === 0x04) throw new ErrorPlaca('La placa interrumpió la carga.')
        }
        const n = Math.min(libre, datos.length - i)
        await this.escribir(datos.slice(i, i + n))
        i += n
        libre -= n
      }
      await this.escribir('\x04')
      await this.leerHasta('\x04', 5000)
      return
    }
    if (r[0] === 0x52 && r[1] === 0x00) {
      // Sin raw-paste: raw normal.
      for (let i = 0; i < datos.length; i += 256) {
        await this.escribir(datos.slice(i, i + 256))
        await pausa(10)
      }
      await this.escribir('\x04')
      await this.leerHasta('OK', 5000)
      return
    }
    throw new ErrorPlaca('Respuesta inesperada del REPL de MicroPython.')
  }

  // Ejecuta código en la placa y devuelve lo que imprimió; si falla, lanza el error de Python.
  async ejecutar(codigo, ms = 15000) {
    if (!this.raw) await this.entrarRaw()
    await this._pegar(codificar.encode(codigo))
    const salida = decodificar.decode(await this.leerHasta('\x04', ms))
    const error = decodificar.decode(await this.leerHasta('\x04', 3000))
    await this.leerHasta('>', 3000)
    if (error.trim()) throw new ErrorPlaca(error.trim().split('\n').slice(-1)[0])
    return salida
  }

  // Manda una orden sin esperar respuesta (p. ej. reiniciar, que corta la conexión).
  async soltar(codigo) {
    if (!this.raw) await this.entrarRaw()
    await this.escribir('\x05A\x01')
    const r = await this.leerBytes(2).catch(() => null)
    if (r && r[0] === 0x52 && r[1] === 0x01) {
      await this.leerBytes(2).catch(() => null)
      await this.escribir(codigo)
    } else {
      await this.escribir(codigo)
    }
    await this.escribir('\x04')
    await pausa(300)
  }

  async cerrar() {
    try {
      await this.lector?.cancel()
    } catch {
      // nada
    }
    await this._leyendo?.catch(() => {})
    try {
      this.escritor?.releaseLock()
    } catch {
      // nada
    }
    try {
      await this.port.close()
    } catch {
      // ya cerrado
    }
  }
}
