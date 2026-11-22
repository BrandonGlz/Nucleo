import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Avatar, Badge, Battery, Button, Card, IconCircle, Input, PeriodFilter, SignalBars, Skeleton,
  StatusBadge,
} from '../../design-system/componentes/index.js'
import { GraficaAjustable } from '../../components/GraficaAjustable'
import { BotonVolver, Migas } from '../../components/BotonVolver'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { estadoForzado, useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as lecturasApi from '../../services/lecturas'
import * as organizacionesApi from '../../services/organizaciones'
import * as umbralesApi from '../../services/umbrales'
import * as usuariosApi from '../../services/usuarios'
import {
  enLinea, nivelLectura, statusDispositivo, nombreCompleto, pagina, puedeEditar, rangoUmbral, UNIDAD, VARIABLE,
} from '../../utils/convertir'
import { avisoUltima, fechaLarga, haceCuanto, num, puntoSerie } from '../../utils/formato'
import { fotoDe } from '../../utils/foto'

// Estado de cada sensor: primero lo que se registró de él (falla o calibración pendiente) y luego si
// está respondiendo, según su última lectura. Sin conexión no hay forma de saberlo: «Sin datos recientes».
const ESTADO_SENSOR = {
  responde: ['success', 'circle-check', 'Respondiendo'],
  calentando: ['warning', 'clock', 'Calentando'],
  sinDatos: ['offline', 'wifi-off', 'Sin datos recientes'],
  CALIB: ['warning', 'wrench', 'Requiere calibración'],
  FALLA: ['danger', 'octagon-alert', 'Falla'],
}
// Una lectura es reciente si llegó dentro de tres intervalos de muestreo (al menos 2 min).
const esReciente = (iso, intervaloSeg) => !!iso && Date.now() - new Date(iso).getTime() <= Math.max(3 * intervaloSeg, 120) * 1000

function estadoSensor(s, d, lecturas, sinConexion) {
  const ultima = lecturas
    .filter((l) => l.sensor_modelo === s.modelo)
    .reduce((max, l) => (!max || l.fecha_hora > max ? l.fecha_hora : max), null)
  if (s.estado_sensor === 'FALLA' || s.estado_sensor === 'CALIB') return { clave: s.estado_sensor, ultima }
  if (sinConexion) return { clave: 'sinDatos', ultima }
  // El CCS811 no entrega lecturas estabilizadas en sus primeros 20 min tras arrancar.
  if (s.modelo === 'CCS811' && d.estado_dispositivo === 'CALENT' && !esReciente(ultima, d.intervalo_muestreo_seg)) {
    return { clave: 'calentando', ultima }
  }
  return { clave: esReciente(ultima, d.intervalo_muestreo_seg) ? 'responde' : 'sinDatos', ultima }
}

// Versión de firmware del equipo contra la publicada para la actualización remota.
function estadoFirmware(d) {
  if (!d.version_firmware) return { tone: 'neutral', icon: 'cpu', label: 'Sin informar' }
  if (!d.version_firmware_publicada) return null
  return d.version_firmware === d.version_firmware_publicada
    ? { tone: 'success', icon: 'circle-check', label: 'Al día' }
    : { tone: 'warning', icon: 'download', label: `Actualización disponible · ${d.version_firmware_publicada}` }
}
const MIGA = <Migas a="/dispositivos" modulo="Dispositivos" />
const VOLVER = <BotonVolver a="/dispositivos" etiqueta="Volver a la página anterior" />
const VAR_POR_SENSOR = { DHT22: 'thermometer', 'MQ-135': 'wind', CCS811: 'wind' }

async function cargar(numDisp) {
  const [d, lecturas, umb, areas] = await Promise.all([
    dispositivosApi.detalle(numDisp),
    dispositivosApi.ultimasLecturas(numDisp),
    umbralesApi.lista(numDisp),
    organizacionesApi.areas(),
  ])
  let operador = null
  if (d.operador) {
    try {
      operador = pagina(await usuariosApi.lista()).find((u) => u.num === d.operador) ?? null
    } catch {
      operador = null // La lista de usuarios es solo para ADMIN y SUPER.
    }
  }
  return { d, lecturas, umbrales: pagina(umb), area: pagina(areas).find((a) => a.num === d.area), operador }
}

// Cifras: la variable en peor estado como principal y el resto a la derecha.
function cifrasDetalle({ d, lecturas, umbrales }, sinConexion) {
  const filas = lecturas.map((l) => {
    const u = umbrales.find((x) => x.variable === l.variable)
    return { l, u, nivel: nivelLectura(l.valor, u), info: VARIABLE[l.variable] }
  })
  const PESO = { critical: 2, warning: 1, normal: 0 }
  const principal = sinConexion ? filas[0] : [...filas].sort((a, b) => PESO[b.nivel] - PESO[a.nivel])[0]
  const fuera = !sinConexion && principal.nivel !== 'normal'
  return {
    principal: {
      etiqueta: `${principal.info.etiqueta} · ${d.nombre}`,
      valor: num(principal.l.valor, principal.info.decimales),
      unidad: principal.l.unidad,
      tonoValor: sinConexion ? 'tenue' : undefined,
      tonoUnidad: sinConexion ? 'tenue' : fuera ? 'peligro' : undefined,
      tonoSub: sinConexion ? undefined : fuera ? 'peligro' : 'verde',
      sub: sinConexion
        ? `Sin conexión · última lectura ${haceCuanto(d.ultima_conexion)}`
        : `${fuera ? 'Fuera de rango' : 'En rango'} · ${rangoUmbral(principal.u, principal.l.unidad)}`,
    },
    cifras: [
      ...filas
        .filter((f) => f !== principal)
        .map((f) => ({
          etiqueta: f.info.corta,
          valor: num(f.l.valor, f.info.decimales),
          unidad: f.l.unidad,
          sub: sinConexion ? 'Última conocida' : rangoUmbral(f.u, f.l.unidad),
          tono: sinConexion ? 'tenue' : f.nivel === 'normal' ? 'verde' : 'peligro',
        })),
      {
        etiqueta: 'Batería', valor: d.nivel_bateria ?? '—', unidad: d.nivel_bateria == null ? '' : '%',
        sub: d.nivel_bateria == null ? 'Sin dato' : d.nivel_bateria <= 15 ? 'Batería baja' : d.nivel_bateria <= 30 ? 'Cambiar pronto' : 'Bien',
        tono: d.nivel_bateria == null ? 'tenue' : d.nivel_bateria <= 15 ? 'peligro' : undefined,
      },
      ...(sinConexion ? [] : [{ etiqueta: 'Muestreo', valor: d.intervalo_muestreo_seg, unidad: 's', sub: `Última lectura ${haceCuanto(d.ultima_conexion)}` }]),
    ],
  }
}

function Grafica({ d, umbrales, variable }) {
  const [periodo, setPeriodo] = useState('Hoy')
  const clave = { Hoy: 'hoy', '7 días': '7', '30 días': '30' }[periodo]
  const { datos } = useDatos(() => lecturasApi.serieConDatos(d.num, variable, clave), [d.num, variable, clave])
  const u = umbrales.find((x) => x.variable === variable)
  const info = VARIABLE[variable]
  const data = (datos?.puntos ?? []).map((p) => puntoSerie(p, clave))
  return (
    <Card className="nc-grow">
      <div className="nc-card__head" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="nc-card__title">{info.etiqueta} · {periodo.toLowerCase()}</h3>
          <p className="nc-card__sub">
            Umbral {rangoUmbral(u, UNIDAD[variable])}
            {datos?.ultima && <span className="ui-aviso-ultima"> · {avisoUltima(datos.ultima)}</span>}
          </p>
        </div>
        <PeriodFilter value={periodo} onChange={setPeriodo} />
      </div>
      {datos ? (
        <GraficaAjustable
          data={data}
          unit={UNIDAD[variable]}
          threshold={u ? { min: Number(u.peligro_min), max: Number(u.peligro_max) } : undefined}
          minimo={140}
          vacio={`Sin lecturas de ${d.nombre} en este periodo`}
        />
      ) : (
        <Skeleton height={140} />
      )}
    </Card>
  )
}

// Sensores del equipo: si cada uno responde, su última lectura y su calibración, y al pie la versión
// de firmware del dispositivo (al día o con actualización disponible).
function TarjetaSensores({ d, lecturas, sinConexion }) {
  const filas = d.sensores.map((s) => ({ s, ...estadoSensor(s, d, lecturas, sinConexion) }))
  const responden = filas.filter((f) => f.clave === 'responde').length
  const fw = estadoFirmware(d)
  const resumen = sinConexion
    ? 'Sin datos recientes del dispositivo'
    : responden === filas.length
      ? fw?.label === 'Al día'
        ? 'Todo funciona: sensores respondiendo y firmware al día'
        : 'Todos los sensores responden'
      : `${responden} de ${filas.length} sensores responden`
  const fila = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }
  const derecha = { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, textAlign: 'right' }
  return (
    <Card className="nc-grow">
      <div className="nc-card__head" style={{ marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="nc-card__title">Sensores</h3>
          <p className="nc-card__sub">{resumen}</p>
        </div>
      </div>
      <div className="nc-scroll">
        {filas.map(({ s, clave, ultima }) => {
          const [tone, icon, label] = ESTADO_SENSOR[clave]
          return (
            <div key={s.num} style={fila}>
              <IconCircle name={VAR_POR_SENSOR[s.modelo] ?? 'cpu'} size="sm" />
              <div className="ui-titulo-fila" style={{ flex: 1 }}>
                <strong style={{ fontSize: 14, lineHeight: '20px' }}>{s.modelo}</strong>
                <span style={{ fontSize: 12, lineHeight: '16px' }}>
                  {s.funcion}
                  {s.fecha_calibracion && ` · calibrado el ${fechaLarga(s.fecha_calibracion + 'T12:00:00')}`}
                </span>
              </div>
              <div style={derecha}>
                <Badge tone={tone} icon={icon}>
                  {label}
                </Badge>
                <span className="ui-muted" style={{ fontSize: 12 }}>
                  {ultima ? `Última lectura ${haceCuanto(ultima).toLowerCase()}` : 'Sin lecturas registradas'}
                </span>
              </div>
            </div>
          )
        })}
        <div style={{ ...fila, borderBottom: 0 }}>
          <IconCircle name="cpu" size="sm" />
          <div className="ui-titulo-fila" style={{ flex: 1 }}>
            <strong style={{ fontSize: 14, lineHeight: '20px' }}>{d.version_firmware ? `Firmware v${d.version_firmware}` : 'Firmware'}</strong>
            <span style={{ fontSize: 12, lineHeight: '16px' }}>
              {d.version_firmware
                ? `Informada ${haceCuanto(d.version_reportada_en).toLowerCase()}`
                : 'El equipo la informa al revisar actualizaciones'}
            </span>
          </div>
          {fw && (
            <div style={derecha}>
              <Badge tone={fw.tone} icon={fw.icon}>
                {fw.label}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export function DetalleDispositivo() {
  const { num: numDisp } = useParams()
  const navegar = useNavigate()
  const { rol } = useSesion()
  const { estado, datos, reintentar, actualizar } = useDatos(() => cargar(numDisp), [numDisp], { cadaMs: 30000, enVivo: true })
  const [intervalo, setIntervalo] = useState(null)
  const [aviso, setAviso] = useState(null)

  if (estado === 'error') {
    return (
      <Pantalla eyebrow={MIGA} titulo="Detalle de dispositivo" volver={VOLVER}>
        <EstadoError reintentar={reintentar} titulo="No encontramos este dispositivo" />
      </Pantalla>
    )
  }
  if (estado === 'cargando' || !datos) {
    return (
      <Pantalla
        eyebrow={MIGA}
        titulo="Detalle de dispositivo"
        volver={VOLVER}
        cifras={{ principal: { etiqueta: 'Cargando', valor: '--.-', tonoValor: 'apagado' } }}
      >
        <Skeleton variant="card" />
      </Pantalla>
    )
  }

  const { d, umbrales, area, operador } = datos
  const sinConexion = !enLinea(d) || estadoForzado() === 'sinConexion'
  const editable = puedeEditar(rol) && !sinConexion
  const valorIntervalo = intervalo ?? String(d.intervalo_muestreo_seg)
  const errorIntervalo = Number(valorIntervalo) >= 5 && Number(valorIntervalo) <= 120 ? undefined : 'Usa un valor entre 5 y 120 s.'

  const guardarIntervalo = async () => {
    setAviso(null)
    try {
      const nuevo = await dispositivosApi.cambiarIntervalo(d.num, Number(valorIntervalo))
      actualizar((x) => ({ ...x, d: { ...x.d, intervalo_muestreo_seg: nuevo.intervalo_muestreo_seg } }))
      setIntervalo(null)
      setAviso('Intervalo guardado.')
    } catch {
      setAviso('No se pudo guardar el intervalo.')
    }
  }

  return (
    <Pantalla
      eyebrow={<Migas a="/dispositivos" modulo="Dispositivos" actual={d.codigo_mqtt} />}
      titulo="Detalle de dispositivo"
      volver={VOLVER}
      acciones={
        puedeEditar(rol) && (
          <Button variant="secondary" icon="sliders-horizontal" onClick={() => navegar(`/umbrales?dispositivo=${d.num}`)}>
            Editar umbrales
          </Button>
        )
      }
      cifras={cifrasDetalle(datos, sinConexion)}
    >
      <Card>
        <div className="ui-ficha" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <IconCircle name="cpu" size="lg" tone="ink" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 20, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.01em' }}>{d.nombre}</strong>
              <StatusBadge {...(sinConexion ? { status: 'offline', label: 'Sin conexión' } : statusDispositivo(d, datos.lecturas, umbrales))} />
            </div>
            <span className="ui-muted" style={{ fontSize: 14 }}>
              {d.codigo_mqtt} · {area?.nombre} · cada {d.intervalo_muestreo_seg} s
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <div className="ui-ficha__datos" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <div className="ui-dato">
              <span className="ui-eyebrow">Batería</span>
              <Battery level={d.nivel_bateria} />
            </div>
            <div className="ui-dato">
              <span className="ui-eyebrow">Señal</span>
              <SignalBars level={sinConexion ? 0 : 3} showLabel />
            </div>
            <div className="ui-dato">
              <span className="ui-eyebrow">Última lectura</span>
              <strong>{haceCuanto(d.ultima_conexion)}</strong>
            </div>
            <div className="ui-dato">
              <span className="ui-eyebrow">Asignado a</span>
              {operador ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={nombreCompleto(operador)} src={fotoDe(operador)} size={24} />
                  <strong style={{ fontSize: 14 }}>{nombreCompleto(operador)}</strong>
                  <span className="ui-muted" style={{ fontSize: 13 }}>
                    · Operador
                  </span>
                </div>
              ) : (
                <strong>Sin operador</strong>
              )}
            </div>
          </div>
        </div>
      </Card>
      {sinConexion && (
        <Alert level="offline" title={`Sin conexión · última lectura ${haceCuanto(d.ultima_conexion).toLowerCase()}`}>
          El dispositivo sigue alertando con LED y buzzer aunque no llegue a la plataforma. Los valores que ves son la última lectura conocida.
        </Alert>
      )}
      <div className="ui-fila" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <Grafica d={d} umbrales={umbrales} variable="HUM" />
        <div className="ui-col">
          <TarjetaSensores d={d} lecturas={datos.lecturas} sinConexion={sinConexion} />
          {editable && (
            <Card>
              <div className="nc-card__head" style={{ marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="nc-card__title">Intervalo de muestreo</h3>
                  <p className="nc-card__sub">{aviso ?? `Cada ${d.intervalo_muestreo_seg} s`}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    label="Enviar lecturas cada"
                    type="number"
                    min={5}
                    max={120}
                    value={valorIntervalo}
                    onChange={(e) => setIntervalo(e.target.value)}
                    suffix="s"
                    error={intervalo != null ? errorIntervalo : undefined}
                    hint="Usa un valor entre 5 y 120 s."
                  />
                </div>
                <div style={{ paddingTop: 24 }}>
                  <Button disabled={intervalo == null || !!errorIntervalo} onClick={guardarIntervalo}>
                    Guardar intervalo
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Pantalla>
  )
}
