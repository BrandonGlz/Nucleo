import { useSesion } from '../../context/SesionContext'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Battery, Card, Chip, DeviceTable, Icon, IconButton, IconCircle, SignalBars, Skeleton, StatusBadge, Tabs,
} from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Select } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useMonitoreo } from '../../hooks/useMonitoreo'
import { enLinea, nivelLectura, statusDispositivo, VARIABLE } from '../../utils/convertir'
import { haceCuanto } from '../../utils/formato'

const VISTAS = [
  { id: 'lista', label: 'Lista', icon: 'list' },
  { id: 'tarjetas', label: 'Tarjetas', icon: 'layout-grid' },
]
const CLAVE_VISTA = 'nucleo.dispositivos.vista'
const leerVista = () => {
  try {
    return localStorage.getItem(CLAVE_VISTA) === 'tarjetas' ? 'tarjetas' : 'lista'
  } catch {
    return 'lista'
  }
}
// Etiquetas que caben en las tarjetas (cuatro por fila).
const ETIQUETA_CORTA = { TEMP: 'Temp.', HUM: 'Humedad', AIRE: 'Aire' }
const sinAcentos = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const FILTROS = [
  ['all', 'Todos', null],
  ['normal', 'Normal', 'circle-check'],
  ['warning', 'Advertencia', 'triangle-alert'],
  ['critical', 'Crítico', 'octagon-alert'],
  ['offline', 'Sin conexión', 'wifi-off'],
]
// El contrato no trae la intensidad de la señal: se estima con la última conexión.
const senal = (d) => (!enLinea(d) ? 0 : d.nivel_bateria > 60 ? 4 : 3)

// Tarjeta de un dispositivo: estado, sus tres lecturas y batería, señal y última conexión.
function TarjetaDispositivo({ d, area, umbrales, abrir }) {
  const apagado = d.status === 'offline'
  return (
    <button type="button" className={`ui-disp-card is-${d.status}`} onClick={abrir}>
      <div className="ui-disp-card__cabeza">
        <IconCircle name="cpu" size="md" tone={apagado ? 'neutral' : 'ink'} />
        <div className="ui-titulo-fila" style={{ flex: 1 }}>
          <strong>{d.nombre}</strong>
          <span>
            {d.codigo_mqtt} · {area}
          </span>
        </div>
        <StatusBadge status={d.status} label={d.label} />
      </div>
      <div className="ui-disp-card__lecturas">
        {['TEMP', 'HUM', 'AIRE'].map((v) => {
          const l = d.lecturas?.find((x) => x.variable === v)
          const nivel = apagado ? 'offline' : nivelLectura(l?.valor, umbrales.find((u) => u.dispositivo === d.num && u.variable === v))
          return (
            <div key={v} className={`is-${nivel}`}>
              <span>
                <Icon name={VARIABLE[v].icono} size={13} /> {ETIQUETA_CORTA[v]}
              </span>
              <strong className="ui-num">
                {l ? Number(l.valor).toFixed(VARIABLE[v].decimales) : '—'}
                <small> {l?.unidad}</small>
              </strong>
            </div>
          )
        })}
      </div>
      <div className="ui-disp-card__pie">
        <Battery level={d.nivel_bateria} />
        <SignalBars level={senal(d)} />
        <span className="ui-muted">{haceCuanto(d.ultima_conexion)}</span>
        <span className="ui-muted ui-num" style={{ marginLeft: 'auto' }}>
          Cada {d.intervalo_muestreo_seg} s
        </span>
      </div>
    </button>
  )
}

export function DispositivosPage() {
  const { organizacion } = useSesion()
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState('all')
  const [area, setArea] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVistaEstado] = useState(leerVista)
  const setVista = (v) => {
    setVistaEstado(v)
    try {
      localStorage.setItem(CLAVE_VISTA, v)
    } catch {
      // Sin almacenamiento se recuerda solo en esta visita.
    }
  }
  const { estado, datos, reintentar } = useMonitoreo({ esVacio: (d) => d.dispositivos.length === 0 })

  if (estado === 'error') {
    return (
      <Pantalla titulo="Dispositivos">
        <EstadoError reintentar={reintentar} />
      </Pantalla>
    )
  }
  if (estado === 'vacio') {
    return (
      <Pantalla
        eyebrow="Sin dispositivos"
        titulo="Dispositivos"
        cifras={{ principal: { etiqueta: 'Dispositivos', valor: '0', sub: 'Da de alta el primero con «Agregar dispositivo».' } }}
      >
        <Card className="nc-grow">
          <div className="ui-centro">
            <DeviceTable devices={[]} />
          </div>
        </Card>
      </Pantalla>
    )
  }

  const todos = (datos?.dispositivos ?? []).map((d) => ({ ...d, ...statusDispositivo(d, d.lecturas, datos.umbrales) }))
  const areas = datos?.areas ?? []
  const nombreArea = (n) => areas.find((a) => a.num === n)?.nombre
  const texto = sinAcentos(busqueda.trim())
  const delArea = todos.filter(
    (d) =>
      (!area || d.area === Number(area)) &&
      (!texto || sinAcentos(`${d.nombre} ${d.codigo_mqtt} ${nombreArea(d.area) ?? ''}`).includes(texto)),
  )
  const lista = delArea.filter((d) => filtro === 'all' || d.status === filtro)
  const cuenta = (k) => todos.filter((d) => d.status === k).length
  const activos = todos.filter(enLinea).length

  return (
    <Pantalla
      eyebrow={datos ? `${organizacion} · ${todos.length} dispositivos · ${activos} en línea` : organizacion}
      titulo="Dispositivos"
      cifras={
        datos
          ? {
              principal: { etiqueta: 'Dispositivos', valor: todos.length, unidad: `en ${areas.length} áreas`, sub: organizacion },
              cifras: [
                { etiqueta: 'En línea', valor: activos, sub: 'Enviando lecturas', tono: 'lima' },
                { etiqueta: 'Advertencia', valor: cuenta('warning'), sub: 'Cerca del umbral' },
                { etiqueta: 'Crítico', valor: cuenta('critical'), sub: 'Fuera de rango', tono: 'peligro' },
                { etiqueta: 'Sin conexión', valor: cuenta('offline'), sub: 'Revisar energía o red', tono: 'tenue' },
              ],
            }
          : { principal: { etiqueta: 'Dispositivos', valor: '—', tonoValor: 'apagado', sub: 'Cargando…' } }
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
        <div style={{ width: 280 }}>
          <Select
            label="Área"
            icon="map-pin"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            options={[{ value: '', label: 'Todas las áreas' }, ...areas.map((a) => ({ value: String(a.num), label: a.nombre }))]}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2, flexWrap: 'wrap' }}>
          {FILTROS.map(([id, label, icon]) => (
            <Chip
              key={id}
              icon={icon}
              selected={filtro === id}
              count={id === 'all' ? delArea.length : delArea.filter((d) => d.status === id).length}
              onClick={() => setFiltro(id)}
            >
              {label}
            </Chip>
          ))}
        </div>
        <div style={{ paddingBottom: 2 }}>
          <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar dispositivo o código…" ancho={260} />
        </div>
      </div>
      <Card className="nc-grow">
        <div className="nc-card__head" style={{ marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="nc-card__title">Dispositivos</h3>
            <p className="nc-card__sub">
              {lista.length} de {todos.length} · {area ? nombreArea(Number(area)) : 'Todas las áreas'}
            </p>
          </div>
          <Tabs items={VISTAS} value={vista} onChange={setVista} />
        </div>
        {estado === 'cargando' ? (
          vista === 'lista' ? (
            <DeviceTable loading />
          ) : (
            <div className="ui-disp-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} variant="card" />
              ))}
            </div>
          )
        ) : lista.length === 0 ? (
          <div className="ui-centro">
            <p className="ui-muted">Ningún dispositivo coincide con los filtros.</p>
          </div>
        ) : vista === 'tarjetas' ? (
          <div className="ui-disp-grid nc-scroll">
            {lista.map((d) => (
              <TarjetaDispositivo
                key={d.num}
                d={d}
                area={nombreArea(d.area)}
                umbrales={datos.umbrales}
                abrir={() => navegar(`/dispositivos/${d.num}`)}
              />
            ))}
          </div>
        ) : (
          <div className="nc-table-wrap nc-scroll">
            <table className="nc-table">
              <thead>
                <tr>
                  <th>Dispositivo</th>
                  <th>Área</th>
                  <th>Estado</th>
                  <th>Batería</th>
                  <th>Señal</th>
                  <th>Última lectura</th>
                  <th>Muestreo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.num} style={{ cursor: 'pointer' }} onClick={() => navegar(`/dispositivos/${d.num}`)}>
                    <td>
                      <div className="nc-table__device">
                        <IconCircle name="cpu" size="sm" />
                        <div>
                          <strong>{d.nombre}</strong>
                          <span>{d.codigo_mqtt}</span>
                        </div>
                      </div>
                    </td>
                    <td>{nombreArea(d.area)}</td>
                    <td>
                      <StatusBadge status={d.status} label={d.label} />
                    </td>
                    <td>
                      <Battery level={d.nivel_bateria} />
                    </td>
                    <td>
                      <SignalBars level={senal(d)} />
                    </td>
                    <td>{haceCuanto(d.ultima_conexion)}</td>
                    <td className="ui-num">Cada {d.intervalo_muestreo_seg} s</td>
                    <td style={{ textAlign: 'right' }}>
                      <IconButton icon="chevron-right" label="Ver detalle" variant="ghost" size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Pantalla>
  )
}
