import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityFeed, Button, Card, IconCircle, Tabs, Toggle } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { TIPOS_NOTIFICACION } from '../../utils/convertir'
import { esAyer, esHoy, fechaCorta, hora } from '../../utils/formato'

const grupo = (iso) => (esHoy(iso) ? 'Hoy' : esAyer(iso) ? 'Ayer' : fechaCorta(iso))

// Bandeja de la campana: las alertas de medición (GET /notificaciones/ unidas a su alerta) y los
// avisos de dispositivos, usuarios, reportes y Nico AI (GET /avisos/), filtrables por tipo.
export function NotificacionesPage() {
  const { notificaciones, noLeidas, marcarLeidas } = useAvisos()
  const navegar = useNavigate()
  const [tipo, setTipo] = useState('todas')
  const [soloSinLeer, setSoloSinLeer] = useState(false)

  const delTipo = notificaciones.filter((n) => tipo === 'todas' || n.tipo === tipo)
  const visibles = soloSinLeer ? delTipo.filter((n) => !n.leida) : delTipo
  const pestanas = [
    { id: 'todas', label: 'Todas', count: notificaciones.length },
    ...Object.entries(TIPOS_NOTIFICACION).map(([id, t]) => ({
      id,
      label: t.etiqueta,
      count: notificaciones.filter((n) => n.tipo === id).length,
    })),
  ]
  const sinLeerTipo = delTipo.filter((n) => !n.leida).map((n) => n.num)
  const grupos = []
  for (const n of visibles) {
    const g = grupo(n.fecha)
    if (!grupos.length || grupos.at(-1).etiqueta !== g) grupos.push({ etiqueta: g, items: [] })
    grupos.at(-1).items.push(n)
  }
  const ultima = notificaciones.find((n) => !n.leida)
  const cuenta = (f) => notificaciones.filter(f).length

  return (
    <Pantalla
      eyebrow="Alertas, dispositivos, usuarios, reportes y Nico AI"
      titulo="Notificaciones"
      cifras={{
        principal: {
          etiqueta: 'Notificaciones',
          valor: noLeidas,
          unidad: 'sin leer',
          tonoValor: 'verde',
          tonoUnidad: 'claro',
          sub: ultima ? `La más reciente a las ${hora(ultima.fecha)}` : 'Estás al día',
        },
        cifras: [
          { etiqueta: 'Hoy', valor: cuenta((n) => esHoy(n.fecha)) },
          { etiqueta: 'Ayer', valor: cuenta((n) => esAyer(n.fecha)) },
          { etiqueta: 'Críticas', valor: cuenta((n) => n.nivel === 'PELIGRO'), tono: 'peligro' },
          { etiqueta: 'Advertencias', valor: cuenta((n) => n.nivel === 'ADVERTENCIA'), tono: 'verde' },
        ],
      }}
    >
      <Card className="nc-grow">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
          <Tabs items={pestanas} value={tipo} onChange={setTipo} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Toggle label="Solo sin leer" checked={soloSinLeer} onChange={setSoloSinLeer} />
            <Button
              variant="ghost"
              size="sm"
              icon="circle-check"
              disabled={!sinLeerTipo.length}
              onClick={() => marcarLeidas(tipo === 'todas' ? undefined : sinLeerTipo)}
            >
              Marcar todo como leído
            </Button>
          </div>
        </div>
        <div className="nc-scroll">
          {grupos.length === 0 && <ActivityFeed items={[]} />}
          {grupos.map((g) => (
            <div key={g.etiqueta}>
              <span className="ui-eyebrow" style={{ display: 'block', padding: '16px 12px 6px' }}>
                {g.etiqueta}
              </span>
              {g.items.map((n) => (
                <button
                  key={n.num}
                  type="button"
                  className={`ui-item ui-item--boton${n.leida ? '' : ' is-unread'}`}
                  onClick={() => {
                    marcarLeidas([n.num])
                    navegar(n.ruta)
                  }}
                >
                  <IconCircle name={n.icon} tone={n.tone} size="md" />
                  <div className="ui-titulo-fila" style={{ flex: 1, gap: 2 }}>
                    <strong>{n.titulo}</strong>
                    <span>{n.meta}</span>
                  </div>
                  <span className="ui-hora">{hora(n.fecha)}</span>
                  <span className="ui-punto" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </Pantalla>
  )
}
