import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ActivityFeed, Battery, Card, DeviceTable, IconCircle, PeriodFilter, Skeleton,
  StatusBadge,
} from '../../design-system/componentes/index.js'
import { GraficaAjustable } from '../../components/GraficaAjustable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import { useMonitoreo } from '../../hooks/useMonitoreo'
import * as lecturasApi from '../../services/lecturas'
import {
  enLinea, limiteAlerta, NIVEL_ALERTA, nivelLectura, statusDispositivo, tituloAlerta, valorAlerta, VARIABLE,
} from '../../utils/convertir'
import { haceCuanto, hora, hoyTexto, num } from '../../utils/formato'

const lectura = (d, v) => d.lecturas.find((l) => l.variable === v)
// La lectura que saca al dispositivo de rango (o la temperatura si todo está bien).
function lecturaFuera(d, umbrales) {
  const fuera = d.lecturas.find((l) => nivelLectura(l.valor, umbrales.find((u) => u.dispositivo === d.num && u.variable === l.variable)) !== 'normal')
  const l = fuera ?? lectura(d, 'TEMP')
  return `${VARIABLE[l.variable].corta} ${num(l.valor, VARIABLE[l.variable].decimales)} ${l.unidad}`
}
const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// Cifras de la tarjeta oscura: temperatura del área con más dispositivos y promedios generales.
function cifrasPanel({ dispositivos, umbrales, areas, alertas }) {
  const activos = dispositivos.filter(enLinea)
  const area = areas[0]
  const delArea = activos.filter((d) => d.area === area?.num)
  const temp = promedio(delArea.map((d) => Number(lectura(d, 'TEMP').valor)))
  const hum = promedio(delArea.map((d) => Number(lectura(d, 'HUM').valor)))
  const aire = promedio(activos.map((d) => Number(lectura(d, 'AIRE').valor)))
  const u = umbrales.find((x) => x.dispositivo === delArea[0]?.num && x.variable === 'TEMP')
  const [min, max] = u ? [Number(u.advertencia_min), Number(u.advertencia_max)] : [0, 0]
  const escala = [min - (max - min) / 2, max + (max - min) / 2]
  const pct = (v) => Math.max(0, Math.min(100, ((v - escala[0]) / (escala[1] - escala[0])) * 100))
  const pend = alertas.filter((a) => a.estado === 'PENDIENTE')
  const enRango = temp != null && temp >= min && temp <= max
  return {
    principal: {
      etiqueta: `Temperatura · ${area?.nombre ?? ''}`,
      valor: num(temp),
      unidad: '°C',
      sub: `${enRango ? 'En rango' : 'Fuera de rango'} · ${min} – ${max} °C`,
      tonoSub: enRango ? 'lima' : 'peligro',
    },
    barra: u ? { desde: pct(min), ancho: pct(max) - pct(min), marca: pct(temp) } : null,
    cifras: [
      { etiqueta: 'Humedad', valor: num(hum), unidad: '%HR', sub: area?.nombre, tono: 'lima' },
      { etiqueta: 'En línea', valor: activos.length, unidad: `/ ${dispositivos.length}`, sub: `${dispositivos.length - activos.length} sin conexión` },
      { etiqueta: 'Aire', valor: num(aire, 0), unidad: 'ppm', sub: 'Promedio general' },
      {
        etiqueta: 'Pendientes', valor: pend.length, tono: pend.length ? 'peligro' : undefined,
        sub: `${pend.filter((a) => a.nivel === 'PELIGRO').length} crítica`,
      },
    ],
  }
}

const CIFRAS_CARGANDO = {
  principal: { etiqueta: 'Temperatura', valor: '--.-', tonoValor: 'apagado', sub: 'Cargando lecturas…' },
  cifras: ['Humedad', 'En línea', 'Aire'].map((etiqueta) => ({ etiqueta, valor: '—', tono: 'tenue' })),
}

function Tendencia({ dispositivo, umbral }) {
  const [periodo, setPeriodo] = useState('Hoy')
  const { datos } = useDatos(() => lecturasApi.serie(dispositivo.num, 'TEMP'), [dispositivo.num, periodo])
  const data = (datos ?? []).map((p) => ({ label: hora(p.periodo), time: `Hoy · ${hora(p.periodo)}`, value: Number(p.promedio) }))
  return (
    <Card className="nc-grow ui-tendencia">
      <div className="nc-card__head" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="nc-card__title">Tendencia de temperatura</h3>
          <p className="nc-card__sub">
            {dispositivo.nombre} · máx {Number(umbral?.peligro_max)} °C
          </p>
        </div>
        <PeriodFilter value={periodo} onChange={setPeriodo} />
      </div>
      {data.length ? (
        <GraficaAjustable data={data} unit="°C" threshold={{ max: Number(umbral?.peligro_max) }} minimo={60} />
      ) : (
        <Skeleton height={120} />
      )}
    </Card>
  )
}

export function PanelPage() {
  const { usuario } = useSesion()
  const navegar = useNavigate()
  const { estado, datos, reintentar } = useMonitoreo()
  const encabezado = { eyebrow: `Grupo Altamira · ${hoyTexto()}`, titulo: `Hola, ${usuario?.nombre ?? ''}` }

  const vista = useMemo(() => {
    if (!datos) return null
    const conEstado = datos.dispositivos.map((d) => ({ ...d, ...statusDispositivo(d, d.lecturas, datos.umbrales) }))
    const atencion = conEstado.filter((d) => d.status !== 'normal')
    const destacado = conEstado.find((d) => d.status === 'warning' && lectura(d, 'TEMP')) ?? conEstado[0]
    const feed = [...datos.alertas]
      .sort((a, b) => (a.fecha_hora < b.fecha_hora ? 1 : -1))
      .slice(0, 6)
      .map((a) => ({
        level: NIVEL_ALERTA[a.nivel].level,
        title: tituloAlerta(a),
        meta: `${a.dispositivo_nombre} · ${valorAlerta(a)} (${limiteAlerta(a)})`,
        time: hora(a.fecha_hora),
        unread: a.estado === 'PENDIENTE',
      }))
    return { atencion, destacado, feed }
  }, [datos])

  if (estado === 'cargando') {
    return (
      <Pantalla {...encabezado} cifras={CIFRAS_CARGANDO}>
        <div className="ui-fila" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <Card className="nc-grow">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Skeleton width="30%" height={20} />
              <Skeleton width="100%" height={220} />
              <DeviceTable loading />
            </div>
          </Card>
          <Skeleton variant="card" />
        </div>
      </Pantalla>
    )
  }
  if (estado === 'error') {
    return (
      <Pantalla {...encabezado}>
        <EstadoError reintentar={reintentar} />
      </Pantalla>
    )
  }

  const { atencion, destacado, feed } = vista
  const pendientes = datos.alertas.filter((a) => a.estado === 'PENDIENTE').length
  return (
    <Pantalla {...encabezado} cifras={cifrasPanel(datos)}>
      <div className="ui-fila" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="ui-col">
          <Tendencia
            dispositivo={destacado}
            umbral={datos.umbrales.find((u) => u.dispositivo === destacado.num && u.variable === 'TEMP')}
          />
          <Card className="nc-grow">
            <div className="nc-card__head" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Dispositivos que requieren atención</h3>
                <p className="nc-card__sub">Fuera de rango o sin conexión</p>
              </div>
            </div>
            <div className="nc-table-wrap nc-scroll">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Dispositivo</th>
                    <th>Lectura</th>
                    <th>Última lectura</th>
                    <th>Batería</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {atencion.map((d) => (
                    <tr key={d.num} style={{ cursor: 'pointer' }} onClick={() => navegar(`/dispositivos/${d.num}`)}>
                      <td>
                        <div className="nc-table__device">
                          <IconCircle name="cpu" size="sm" />
                          <div>
                            <strong>{d.nombre}</strong>
                            <span>
                              {d.codigo_mqtt} · {datos.areas.find((a) => a.num === d.area)?.nombre}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="ui-num">
                        {enLinea(d) ? lecturaFuera(d, datos.umbrales) : '—'}
                      </td>
                      <td>{haceCuanto(d.ultima_conexion)}</td>
                      <td>
                        <Battery level={d.nivel_bateria} />
                      </td>
                      <td>
                        <StatusBadge status={d.status} label={d.label} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Card className="nc-grow">
          <div className="nc-card__head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="nc-card__title">Alertas recientes</h3>
              <p className="nc-card__sub">
                {pendientes ? `${pendientes} pendientes de atender` : 'Todo atendido'}
              </p>
            </div>
          </div>
          <div className="nc-scroll">
            <ActivityFeed items={feed} />
          </div>
        </Card>
      </div>
    </Pantalla>
  )
}
