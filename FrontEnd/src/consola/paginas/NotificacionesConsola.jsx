import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityFeed, Button, Card, Icon, IconCircle, Skeleton, Tabs, Toggle } from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { esAyer, esHoy, fechaCorta, hora } from '../../utils/formato'
import { TIPOS_AVISO } from '../catalogos'
import { mensajeError, useAviso } from '../utilidades'

const grupo = (iso) => (esHoy(iso) ? 'Hoy' : esAyer(iso) ? 'Ayer' : fechaCorta(iso))

// Qué avisos llegan a la campana y cuáles por correo, por tipo de evento. Columna lateral compacta:
// lo importante de la página es la bandeja.
function Preferencias() {
  const { estado, datos, reintentar, actualizar } = useDatos(nicoApi.preferenciasAvisos, [])
  const [aviso, avisar] = useAviso()
  const cambiar = async (tipo, canal, valor) => {
    actualizar((d) => ({ ...d, tipos: d.tipos.map((t) => (t.tipo === tipo ? { ...t, [canal]: valor } : t)) }))
    try {
      const nuevas = await nicoApi.guardarPreferenciasAvisos({ [tipo]: { [canal]: valor } })
      actualizar(() => nuevas)
    } catch (e) {
      avisar(mensajeError(e), 'danger')
      reintentar()
    }
  }
  return (
    <Card className="ui-consola-notif__prefs" title="Preferencias" subtitle={datos ? `Los correos llegan a ${datos.correo}.` : undefined}>
      {aviso}
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && !datos && <Skeleton variant="card" />}
      {datos && (
        <ul className="ui-consola-preferencias">
          <li className="ui-consola-preferencias__cabeza" aria-hidden="true">
            <span />
            <span title="Campana">
              <Icon name="bell" size={16} />
            </span>
            <span title="Correo">
              <Icon name="mail" size={16} />
            </span>
          </li>
          {datos.tipos.map((t) => (
            <li key={t.tipo}>
              <div className="ui-consola-preferencias__tipo" title={t.descripcion}>
                <IconCircle name={TIPOS_AVISO[t.tipo]?.icon ?? 'bell'} tone="neutral" size="sm" />
                <span>
                  <strong>{t.etiqueta}</strong>
                  <small>{t.descripcion}</small>
                </span>
              </div>
              <Toggle ariaLabel={`${t.etiqueta}: campana`} checked={t.consola} onChange={(v) => cambiar(t.tipo, 'consola', v)} />
              <Toggle ariaLabel={`${t.etiqueta}: correo`} checked={t.correo} onChange={(v) => cambiar(t.tipo, 'correo', v)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// Bandeja de la campana de la consola: eventos de Nico AI que le importan al superusuario.
export default function NotificacionesConsola() {
  const { notificaciones, noLeidas, marcarLeidas } = useAvisos()
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState('todas')
  const visibles = notificaciones.filter((n) => filtro === 'todas' || (filtro === 'sinLeer' ? !n.leida : n.tipo === filtro))
  const grupos = []
  for (const n of visibles) {
    const g = grupo(n.fecha)
    if (!grupos.length || grupos.at(-1).etiqueta !== g) grupos.push({ etiqueta: g, items: [] })
    grupos.at(-1).items.push(n)
  }
  const cuenta = (tipo) => notificaciones.filter((n) => n.tipo === tipo).length
  const ultima = notificaciones.find((n) => !n.leida)

  return (
    <Pantalla
      eyebrow="Avisos de Nico AI"
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
          { etiqueta: 'No entendidas', valor: cuenta('NO_ENTENDIDA') },
          { etiqueta: 'No útiles', valor: cuenta('NEGATIVA') },
          { etiqueta: 'ESP puente', valor: cuenta('PUENTE'), tono: 'peligro' },
          { etiqueta: 'Aprendidas', valor: cuenta('APRENDIDA'), tono: 'verde' },
        ],
      }}
    >
      {/* La bandeja ocupa todo el alto libre (scroll interno); las preferencias, una columna estrecha. */}
      <div className="ui-consola-notif">
      <Card className="nc-grow ui-consola-notif__lista">
        <div className="ui-consola-barra">
          <Tabs
            items={[
              { id: 'todas', label: 'Todas', count: notificaciones.length },
              { id: 'sinLeer', label: 'Sin leer', count: noLeidas },
              ...Object.entries(TIPOS_AVISO).map(([id, t]) => ({ id, label: t.label })),
            ]}
            value={filtro}
            onChange={setFiltro}
          />
          <span style={{ flex: 1 }} />
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
      <Preferencias />
      </div>
    </Pantalla>
  )
}
