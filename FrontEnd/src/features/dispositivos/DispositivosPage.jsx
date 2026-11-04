import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Battery, Card, Chip, DeviceTable, IconButton, IconCircle, Select, SignalBars, StatusBadge,
} from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useMonitoreo } from '../../hooks/useMonitoreo'
import { enLinea, statusDispositivo } from '../../utils/convertir'
import { haceCuanto } from '../../utils/formato'

const FILTROS = [
  ['all', 'Todos', null],
  ['normal', 'Normal', 'circle-check'],
  ['warning', 'Advertencia', 'triangle-alert'],
  ['critical', 'Crítico', 'octagon-alert'],
  ['offline', 'Sin conexión', 'wifi-off'],
]
// El contrato no trae la intensidad de la señal: se estima con la última conexión.
const senal = (d) => (!enLinea(d) ? 0 : d.nivel_bateria > 60 ? 4 : 3)

export function DispositivosPage() {
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState('all')
  const [area, setArea] = useState('')
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
  const delArea = todos.filter((d) => !area || d.area === Number(area))
  const lista = delArea.filter((d) => filtro === 'all' || d.status === filtro)
  const cuenta = (k) => todos.filter((d) => d.status === k).length
  const activos = todos.filter(enLinea).length

  return (
    <Pantalla
      eyebrow={datos ? `Grupo Altamira · ${todos.length} dispositivos · ${activos} en línea` : 'Grupo Altamira'}
      titulo="Dispositivos"
      cifras={
        datos
          ? {
              principal: { etiqueta: 'Dispositivos', valor: todos.length, unidad: `en ${areas.length} áreas`, sub: 'Grupo Altamira' },
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
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
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
      </div>
      <Card className="nc-grow">
        <div className="nc-card__head" style={{ marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="nc-card__title">Dispositivos</h3>
            <p className="nc-card__sub">
              {lista.length} de {todos.length} · {area ? nombreArea(Number(area)) : 'Todas las áreas'}
            </p>
          </div>
        </div>
        {estado === 'cargando' ? (
          <DeviceTable loading />
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
