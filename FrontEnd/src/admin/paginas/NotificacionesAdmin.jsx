import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityFeed, Button, Card, IconCircle, Skeleton, Tabs, Toggle } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { esAyer, esHoy, fechaCorta, hora } from '../../utils/formato'
import { useAviso } from '../../consola/utilidades'
import { ErrorCarga } from '../comunes'
import { mensajeError } from '../utilidades'

const grupo = (iso) => (esHoy(iso) ? 'Hoy' : esAyer(iso) ? 'Ayer' : fechaCorta(iso))
const OPCIONES = [
  ['niveles_consola', 'critico', 'Campana de la consola: alertas críticas'],
  ['niveles_consola', 'advertencia', 'Campana de la consola: advertencias'],
  ['niveles_correo', 'critico', 'Correo cuando haya una alerta crítica'],
  ['niveles_correo', 'advertencia', 'Correo con las advertencias'],
]

// Qué niveles avisan en la campana y por correo (se guardan en el servidor, por superusuario).
function Preferencias({ recargarAvisos }) {
  const { estado, datos, error, reintentar, actualizar } = useDatos(adminApi.preferenciasAvisos, [])
  const [aviso, avisar] = useAviso()
  const cambiar = async (campo, nivel, activo) => {
    const actual = datos[campo]
    const nuevo = activo ? [...new Set([...actual, nivel])] : actual.filter((n) => n !== nivel)
    actualizar((d) => ({ ...d, [campo]: nuevo }))
    try {
      const guardado = await adminApi.guardarPreferenciasAvisos({ [campo]: nuevo })
      actualizar(() => guardado)
      avisar('Preferencias guardadas.')
      if (campo === 'niveles_consola') recargarAvisos?.()
    } catch (e) {
      actualizar((d) => ({ ...d, [campo]: actual }))
      avisar(mensajeError(e), 'danger')
    }
  }
  return (
    <Card title="Preferencias" subtitle="Avisos de las alertas de seguridad para tu cuenta. No llegan a la app móvil.">
      {estado === 'error' && <ErrorCarga error={error} reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="text" />}
      {datos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {OPCIONES.map(([campo, nivel, label]) => (
            <Toggle
              key={`${campo}-${nivel}`}
              label={label}
              checked={datos[campo].includes(nivel)}
              onChange={(v) => cambiar(campo, nivel, v)}
            />
          ))}
          {aviso}
        </div>
      )}
    </Card>
  )
}

// Bandeja de la campana de la consola: avisos de las alertas de seguridad (la misma pantalla que
// «Notificaciones» de la web) y sus preferencias.
export default function NotificacionesAdmin() {
  const { notificaciones, noLeidas, marcarLeidas, recargar } = useAvisos()
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState('todas')

  const visibles = notificaciones.filter(
    (n) =>
      filtro === 'todas' ||
      (filtro === 'sinLeer' && !n.leida) ||
      (filtro === 'criticas' && n.nivel === 'critico') ||
      (filtro === 'advertencias' && n.nivel === 'advertencia'),
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
      eyebrow="Alertas de seguridad que te llegaron a la consola o por correo"
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
          { etiqueta: 'Por correo', valor: cuenta((n) => n.correo === true) },
          { etiqueta: 'Críticas', valor: cuenta((n) => n.nivel === 'critico'), tono: 'peligro' },
          { etiqueta: 'Advertencias', valor: cuenta((n) => n.nivel === 'advertencia'), tono: 'verde' },
        ],
      }}
    >
      <div className="ui-consola-dash ui-admin-dash">
        <Card className="nc-grow">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
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
                      <span>
                        {n.meta}
                        {n.correo === true ? ' · enviada por correo' : n.correo === false ? ' · el correo no salió' : ''}
                      </span>
                    </div>
                    <span className="ui-hora">{hora(n.fecha)}</span>
                    <span className="ui-punto" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Card>
        <Preferencias recargarAvisos={recargar} />
      </div>
    </Pantalla>
  )
}
