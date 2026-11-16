import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Input, Select, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import * as flasheoApi from '../../services/flasheo'
import { ErrorCarga } from '../comunes'
import { mensajeError } from '../utilidades'
import {
  FILTROS,
  abrirRepl,
  archivosDeApi,
  chipPorCargador,
  copiarArchivos,
  datosPuerto,
  esNativo,
  esperarPuerto,
  grabarMicropython,
  leerPlaca,
  reiniciar,
  soportado,
  textoABytes,
} from '../esp/placa'

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
const ETAPAS = { borrar: 'Borrando la memoria', grabar: 'Grabando MicroPython', copiar: 'Copiando Núcleo' }

function SinWebSerial() {
  return (
    <Card title="Este navegador no puede hablar con el ESP32" subtitle="La carga usa Web Serial, que solo existe en navegadores Chromium de escritorio.">
      <ol className="ui-flasheo-pasos">
        <li>
          En <strong>Brave</strong>: abre <code>brave://flags</code>, busca <strong>Web Serial</strong>, cámbialo a{' '}
          <strong>Enabled</strong> y pulsa <strong>Relaunch</strong>.
        </li>
        <li>
          En <strong>Chrome</strong> o <strong>Edge</strong> ya viene activo.
        </li>
        <li>No funciona en Firefox, Safari ni en el celular.</li>
        <li>
          En Linux tu usuario debe estar en el grupo <code>dialout</code> para poder abrir el puerto.
        </li>
      </ol>
    </Card>
  )
}

function Placa({ placa, puerto, fase }) {
  const info = puerto ? datosPuerto(puerto) : {}
  if (fase === 'detectando') {
    return <Alert level="info" title="Detectando el ESP32…">Se detiene un momento su programa para leer qué tiene.</Alert>
  }
  if (!placa) return null
  const filas = [
    ['Chip', placa.chip],
    ['Conexión', esNativo(puerto) ? 'USB nativo' : `Puente USB-serie (${(info.usbVendorId ?? 0).toString(16).padStart(4, '0')})`],
    ['MicroPython', placa.micropython ? placa.version_mp : 'No tiene'],
    ['Núcleo', placa.nucleo ? `Versión ${placa.version ?? '—'}` : 'No instalado'],
    ['Dispositivo', placa.codigo ? `${placa.codigo}${placa.puente ? ' · llave de Nico AI' : ''}` : 'Sin configurar'],
  ]
  return (
    <dl className="ui-flasheo-placa">
      {filas.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Avance({ avance }) {
  if (!avance) return null
  const pct = avance.valor == null ? null : Math.round(avance.valor * 100)
  return (
    <div className="ui-flasheo-avance" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <div className="ui-flasheo-avance__texto">
        <span>{ETAPAS[avance.etapa] ?? avance.etapa}</span>
        <span>{pct == null ? '' : `${pct} %`}</span>
      </div>
      <div className="ui-flasheo-avance__barra">
        <span className={pct == null ? 'is-indeterminada' : ''} style={pct == null ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function FirmwareAdmin() {
  const inv = useDatos(flasheoApi.inventario, [])
  const equipos = useDatos(() => adminApi.dispositivos({}), [])
  const lista = equipos.datos?.results ?? []

  const [puerto, setPuerto] = useState(null)
  const [placa, setPlaca] = useState(null)
  const [fase, setFase] = useState('esperando') // esperando · detectando · listo · trabajando · hecho
  const [error, setError] = useState(null)
  const [registro, setRegistro] = useState([])
  const [avance, setAvance] = useState(null)
  const [pide, setPide] = useState(null) // {mensaje} cuando hay que volver a elegir el puerto
  const [resultado, setResultado] = useState(null)
  const [f, setF] = useState({ modo: 'completa', dispositivo: '', ssid: '', password: '', ssid2: '', password2: '', puente: false, regenerar: false })

  const repl = useRef(null)
  const ocupado = useRef(false)
  const resolverPuerto = useRef(null)

  const log = useCallback((t) => setRegistro((r) => [...r.slice(-300), t]), [])

  const soltarRepl = useCallback(async (reiniciarPlaca = true) => {
    const r = repl.current
    repl.current = null
    if (!r) return
    if (reiniciarPlaca) await reiniciar(r)
    else await r.cerrar()
  }, [])

  const detectar = useCallback(
    async (port) => {
      if (ocupado.current) return
      ocupado.current = true
      await soltarRepl()
      setPuerto(port)
      setPlaca(null)
      setError(null)
      setResultado(null)
      setRegistro([])
      setFase('detectando')
      try {
        log('Buscando MicroPython…')
        const r = await abrirRepl(port)
        let datos
        if (r) {
          repl.current = r
          datos = await leerPlaca(r)
          log(`MicroPython ${datos.version_mp} en ${datos.maquina}`)
        } else {
          log('No respondió MicroPython; preguntando al cargador de arranque…')
          datos = await chipPorCargador(port, log)
        }
        setPlaca(datos)
        setF((x) => ({
          ...x,
          modo: datos.micropython && datos.nucleo ? 'actualizar' : 'completa',
          regenerar: !datos.configurada,
          puente: datos.puente ?? x.puente,
        }))
        setFase('listo')
      } catch (e) {
        await soltarRepl(false)
        setError(`No se pudo leer la placa: ${mensajeError(e)}. Desconéctala, vuelve a conectarla y prueba de nuevo.`)
        setFase('esperando')
      }
      ocupado.current = false
    },
    [log, soltarRepl],
  )

  // Detección automática: al abrir la página (puertos ya autorizados) y al conectar uno.
  useEffect(() => {
    if (!soportado()) return undefined
    let vivo = true
    navigator.serial.getPorts().then((ps) => {
      if (vivo && ps.length && !ocupado.current) detectar(ps[0])
    })
    const conectar = (e) => {
      if (resolverPuerto.current || ocupado.current) return
      detectar(e.target)
    }
    const desconectar = (e) => {
      if (ocupado.current) return
      setPuerto((p) => {
        if (p === e.target) {
          repl.current = null
          setPlaca(null)
          setFase('esperando')
          return null
        }
        return p
      })
    }
    navigator.serial.addEventListener('connect', conectar)
    navigator.serial.addEventListener('disconnect', desconectar)
    return () => {
      vivo = false
      navigator.serial.removeEventListener('connect', conectar)
      navigator.serial.removeEventListener('disconnect', desconectar)
      // Al salir la placa vuelve a su programa.
      const r = repl.current
      repl.current = null
      if (r) reiniciar(r)
    }
  }, [detectar])

  const elegir = async () => {
    try {
      const port = await navigator.serial.requestPort({ filters: FILTROS })
      if (resolverPuerto.current) {
        resolverPuerto.current(port)
        resolverPuerto.current = null
        setPide(null)
      } else {
        detectar(port)
      }
    } catch {
      // El usuario cerró el diálogo.
    }
  }

  const pedirPuerto = (mensaje) =>
    new Promise((resolve) => {
      resolverPuerto.current = resolve
      setPide({ mensaje })
    })

  const volverAlPuerto = async (previo, mensaje) => {
    await pausa(2000)
    return (await esperarPuerto(previo, 15000)) ?? (await pedirPuerto(mensaje))
  }

  const conectarRepl = async (port) => {
    const limite = Date.now() + 25000
    while (Date.now() < limite) {
      const r = await abrirRepl(port, { reiniciar: false }).catch(() => null)
      if (r) return r
      await pausa(1500)
    }
    throw new Error('MicroPython no respondió después de grabarlo.')
  }

  // Si la placa ya tiene un código registrado, ese dispositivo queda elegido de inicio.
  const sugerido = placa?.codigo ? lista.find((d) => d.codigo_mqtt === placa.codigo) : null
  const dispositivo = f.dispositivo || (sugerido ? String(sugerido.num) : '')
  const elegido = lista.find((d) => String(d.num) === dispositivo)
  const necesitaConfig = f.modo === 'completa' || f.regenerar
  const valido = !necesitaConfig || (elegido && f.ssid.trim())
  const imagen = inv.datos?.micropython?.find((c) => c.chip === placa?.chip)

  const cargar = async () => {
    ocupado.current = true
    setFase('trabajando')
    setError(null)
    setResultado(null)
    setAvance({ etapa: 'preparar' })
    let port = puerto
    try {
      log('Descargando el firmware de Núcleo…')
      const { version, archivos } = await flasheoApi.archivos()
      const paquete = archivosDeApi(archivos)
      let cfg = null
      if (necesitaConfig) {
        log(`Generando la configuración de ${elegido.nombre} (${elegido.codigo_mqtt}) y su contraseña MQTT…`)
        const redes = [{ ssid: f.ssid.trim(), password: f.password }]
        if (f.ssid2.trim()) redes.push({ ssid: f.ssid2.trim(), password: f.password2 })
        cfg = await flasheoApi.configuracion({ dispositivo: elegido.num, redes, puente: f.puente })
        if (cfg.aviso) log(cfg.aviso)
        paquete.push({ ruta: 'secrets.py', bytes: textoABytes(cfg.secrets) })
      }

      if (f.modo === 'completa') {
        if (!imagen) throw new Error(`No hay MicroPython para ${placa.chip}.`)
        log(`Descargando ${imagen.archivo}…`)
        const datos = await flasheoApi.micropython(imagen.chip)
        if (repl.current) {
          if (esNativo(port)) {
            log('Pasando la placa a modo de grabación…')
            await repl.current.soltar('import machine\nmachine.bootloader()\n')
            await repl.current.cerrar()
            repl.current = null
            port = await volverAlPuerto(port, 'La placa entró en modo de grabación y cambió de puerto: elígela otra vez.')
          } else {
            await soltarRepl(false)
          }
        }
        await grabarMicropython(port, { datos, direccion: imagen.direccion }, { chipEsperado: placa.chip, log, avance: setAvance })
        setAvance({ etapa: 'Arrancando MicroPython' })
        port = esNativo(port) ? await volverAlPuerto(port, 'MicroPython ya está grabado: elige otra vez el puerto del ESP32.') : port
        log('Esperando a MicroPython (el primer arranque prepara la memoria)…')
        repl.current = await conectarRepl(port)
        setPuerto(port)
      }

      if (!repl.current) throw new Error('La placa no tiene MicroPython; usa la instalación completa.')
      await repl.current.ejecutar('import machine\ntry:\n    machine.WDT(timeout=3600000)\nexcept Exception:\n    pass')
      await copiarArchivos(repl.current, paquete, { log, avance: setAvance })
      log('Reiniciando la placa con Núcleo…')
      await soltarRepl(true)
      setResultado({ version, dispositivo: cfg ? elegido : null, codigo: cfg?.codigo_mqtt ?? placa.codigo })
      setPlaca(null)
      setFase('hecho')
    } catch (e) {
      log(`Error: ${mensajeError(e)}`)
      setError(mensajeError(e))
      setPide(null)
      resolverPuerto.current = null
      await soltarRepl(false)
      setFase('esperando')
    }
    setAvance(null)
    ocupado.current = false
  }

  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e?.target ? e.target.value : e }))
  const trabajando = fase === 'trabajando'

  return (
    <Pantalla
      eyebrow="Conecta un ESP32 por USB a esta computadora"
      titulo="Cargar firmware"
      cifras={
        inv.datos
          ? {
              principal: { etiqueta: 'Firmware de Núcleo', valor: inv.datos.version ?? '—', sub: `${inv.datos.archivos} archivos` },
              cifras: [
                ...inv.datos.micropython.map((c) => ({ etiqueta: `MicroPython ${c.chip}`, valor: c.archivo.match(/v\d+(\.\d+)*/)?.[0] ?? '✓' })),
                { etiqueta: 'Placa', valor: placa ? placa.chip : '—', tono: placa ? 'verde' : undefined },
              ],
            }
          : { principal: { etiqueta: 'Firmware de Núcleo', valor: '—', tonoValor: 'apagado' } }
      }
    >
      {inv.estado === 'error' && <ErrorCarga error={inv.error} reintentar={inv.reintentar} />}
      {inv.estado === 'cargando' && <Skeleton variant="card" />}
      {!soportado() && <SinWebSerial />}
      {soportado() && inv.estado === 'listo' && (
        <div className="ui-flasheo">
          <Card
            title="ESP32"
            subtitle={
              puerto ? 'Detectado. Si conectas otro, se detecta solo.' : 'Conéctalo por USB. Los que ya autorizaste se detectan solos.'
            }
            action={
              <Button icon="usb" variant={puerto ? 'secondary' : 'primary'} disabled={trabajando || fase === 'detectando'} onClick={elegir}>
                {puerto ? 'Elegir otro' : 'Conectar ESP32'}
              </Button>
            }
          >
            {!puerto && fase === 'esperando' && (
              <p className="ui-flasheo-nota">
                La primera vez el navegador te pide elegir el puerto (aparece como <em>USB JTAG/serial</em>, <em>CP210x</em> o{' '}
                <em>CH340</em>). Después, cada vez que lo conectes se detecta solo.
              </p>
            )}
            <Placa placa={placa} puerto={puerto} fase={fase} />
            {pide && (
              <Alert level="warning" title="Elige otra vez el puerto" action={<Button icon="usb" onClick={elegir}>Elegir puerto</Button>}>
                {pide.mensaje}
              </Alert>
            )}
            {error && <Alert level="critical" title="No se pudo completar">{error}</Alert>}
            {resultado && (
              <Alert level="normal" title="Firmware cargado">
                Núcleo {resultado.version} quedó instalado{resultado.codigo ? ` en ${resultado.codigo}` : ''} y la placa se reinició. En un
                minuto debe aparecer en línea en <Link to="/dispositivos">Equipos ESP32</Link>.
              </Alert>
            )}
          </Card>

          <Card title="Cargar firmware" subtitle={placa ? 'Elige qué hacer con la placa detectada.' : 'Se habilita al detectar un ESP32.'}>
            <fieldset className="ui-flasheo-form" disabled={!placa || trabajando || fase !== 'listo'}>
              <div className="ui-flasheo-modos" role="radiogroup" aria-label="Qué hacer">
                <button
                  type="button"
                  role="radio"
                  aria-checked={f.modo === 'completa'}
                  className={f.modo === 'completa' ? 'is-activo' : ''}
                  onClick={() => setF((x) => ({ ...x, modo: 'completa' }))}
                >
                  <strong>Instalación completa</strong>
                  <span>Borra la placa, graba MicroPython{imagen ? ` (${imagen.chip})` : ''}, copia Núcleo y su configuración.</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={f.modo === 'actualizar'}
                  disabled={!placa?.micropython}
                  className={f.modo === 'actualizar' ? 'is-activo' : ''}
                  onClick={() => setF((x) => ({ ...x, modo: 'actualizar', regenerar: !placa?.configurada }))}
                >
                  <strong>Solo actualizar Núcleo</strong>
                  <span>{placa?.micropython ? 'Conserva MicroPython; reemplaza el firmware de Núcleo.' : 'Requiere que la placa ya tenga MicroPython.'}</span>
                </button>
              </div>
              {placa && f.modo === 'completa' && !imagen && (
                <Alert level="critical" title={`No hay MicroPython para ${placa.chip}`}>
                  Solo hay imágenes para {inv.datos.micropython.map((c) => c.chip).join(' y ')}.
                </Alert>
              )}
              {f.modo === 'actualizar' && placa?.configurada && (
                <Toggle
                  label="Generar configuración nueva (Wi-Fi y contraseña MQTT)"
                  checked={f.regenerar}
                  onChange={() => setF((x) => ({ ...x, regenerar: !x.regenerar }))}
                />
              )}
              {necesitaConfig && (
                <div className="ui-admin-campos">
                  <Select
                    label="Dispositivo"
                    value={dispositivo}
                    onChange={cambiar('dispositivo')}
                    hint="Se le crea una contraseña MQTT nueva; la anterior deja de servir."
                    options={[
                      { value: '', label: lista.length ? 'Elige el dispositivo registrado' : 'Cargando…' },
                      ...lista
                        .filter((d) => d.estado !== 'BAJA')
                        .map((d) => ({ value: String(d.num), label: `${d.nombre} · ${d.codigo_mqtt} · ${d.organizacion?.nombre ?? ''}` })),
                    ]}
                  />
                  <Input label="Red Wi-Fi (2.4 GHz)" value={f.ssid} onChange={cambiar('ssid')} autoComplete="off" />
                  <Input label="Contraseña del Wi-Fi" type="password" value={f.password} onChange={cambiar('password')} autoComplete="new-password" />
                  <Input label="Red de respaldo (opcional)" value={f.ssid2} onChange={cambiar('ssid2')} hint="p. ej. el hotspot del celular" autoComplete="off" />
                  <Input label="Contraseña de la red de respaldo" type="password" value={f.password2} onChange={cambiar('password2')} autoComplete="new-password" />
                  <Toggle
                    label="Solo llave de Nico AI (sin sensores ni pantalla)"
                    checked={f.puente}
                    onChange={() => setF((x) => ({ ...x, puente: !x.puente }))}
                  />
                </div>
              )}
              <div className="ui-flasheo-acciones">
                <Button
                  icon={f.modo === 'completa' ? 'cpu' : 'refresh-cw'}
                  disabled={!placa || !valido || trabajando || (f.modo === 'completa' && !imagen)}
                  onClick={cargar}
                >
                  {trabajando ? 'Cargando…' : f.modo === 'completa' ? 'Instalar todo' : 'Actualizar Núcleo'}
                </Button>
                {f.modo === 'completa' && placa && <span className="ui-flasheo-nota">Se borra todo lo que tenga la placa.</span>}
              </div>
            </fieldset>
            <Avance avance={avance} />
          </Card>

          {registro.length > 0 && (
            <Card title="Registro" subtitle="Lo que va pasando con la placa.">
              <pre className="ui-flasheo-registro">{registro.join('\n')}</pre>
            </Card>
          )}
        </div>
      )}
    </Pantalla>
  )
}
