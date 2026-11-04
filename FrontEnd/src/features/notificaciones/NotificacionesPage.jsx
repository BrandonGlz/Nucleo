import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityFeed, Button, Card, IconCircle, Tabs } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { esAyer, esHoy, fechaCorta, hora } from '../../utils/formato'

const grupo = (iso) => (esHoy(iso) ? 'Hoy' : esAyer(iso) ? 'Ayer' : fechaCorta(iso))

// Bandeja de la campana: las notificaciones del usuario (GET /notificaciones/) unidas a su alerta.
export function NotificacionesPage() {
  const { notificaciones, noLeidas, marcarLeidas } = useAvisos()
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState('todas')

  const visibles = notificaciones.filter(
    (n) =>
      filtro === 'todas' ||
      (filtro === 'sinLeer' && !n.leida) ||
      (filtro === 'criticas' && n.nivel === 'PELIGRO') ||
      (filtro === 'advertencias' && n.nivel === 'ADVERTENCIA'),
  )
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
      eyebrow="Alertas de tu organización que te llegaron por correo"
      titulo="Notificaciones"
      cifras={{
        principal: {
          etiqueta: 'Notificaciones',
          valor: noLeidas,
          unidad: 'sin leer',
          tonoValor: 'lima',
          tonoUnidad: 'claro',
          sub: ultima ? `La más reciente a las ${hora(ultima.fecha)}` : 'Estás al día',
        },
        cifras: [
          { etiqueta: 'Hoy', valor: cuenta((n) => esHoy(n.fecha)) },
          { etiqueta: 'Ayer', valor: cuenta((n) => esAyer(n.fecha)) },
          { etiqueta: 'Críticas', valor: cuenta((n) => n.nivel === 'PELIGRO'), tono: 'peligro' },
          { etiqueta: 'Advertencias', valor: cuenta((n) => n.nivel === 'ADVERTENCIA'), tono: 'lima' },
        ],
      }}
    >
      <Card className="nc-grow">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <Tabs
            items={[
              { id: 'todas', label: 'Todas', count: notificaciones.length },
              { id: 'sinLeer', label: 'Sin leer', count: noLeidas },
              { id: 'criticas', label: 'Críticas' },
              { id: 'advertencias', label: 'Advertencias' },
            ]}
            value={filtro}
            onChange={setFiltro}
          />
          <Button variant="ghost" size="sm" icon="circle-check" disabled={!noLeidas} onClick={() => marcarLeidas()}>
            Marcar todo como leído
          </Button>
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
                    navegar('/alertas')
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
