import { useState } from 'react'
import { Badge, Card, Select, Skeleton } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as seguridad from '../../services/seguridad'
import { pagina } from '../../utils/convertir'
import { esHoy, fechaCorta, hora } from '../../utils/formato'

const ACCIONES = [
  { value: '', label: 'Todas las acciones' },
  { value: 'CREAR', label: 'Creación' },
  { value: 'MODIFICAR', label: 'Modificación' },
  { value: 'ELIMINAR', label: 'Eliminación' },
  { value: 'LOGIN', label: 'Inicio de sesión' },
  { value: 'LOGIN_FALLIDO', label: 'Inicio de sesión fallido' },
  { value: 'LOGOUT', label: 'Cierre de sesión' },
  { value: 'RECUPERAR', label: 'Recuperación de contraseña' },
  { value: 'SEGUNDO_FACTOR', label: 'Verificación en dos pasos' },
  { value: 'INTEGRACION', label: 'Integración' },
  { value: 'EXPORTAR', label: 'Exportación de datos' },
]
const TONO = { LOGIN_FALLIDO: 'danger', ELIMINAR: 'danger', MODIFICAR: 'warning', CREAR: 'success' }
const RECURSO = {
  organizacion: 'Organización',
  area: 'Área',
  usuario: 'Usuario',
  dispositivo: 'Dispositivo',
  sensor: 'Sensor',
  umbral: 'Umbral',
  alerta: 'Alerta',
  programacionreporte: 'Reporte programado',
  tokenapi: 'Token de API',
  webhook: 'Webhook',
  lecturas: 'Lecturas',
  alertas: 'Alertas',
}
const DIAS = [
  { value: '1', label: 'Últimas 24 horas' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '365', label: 'Último año' },
]

const valor = (v) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

// Cambios de un registro: «campo: antes → después» (o el valor al crear).
function Cambios({ cambios }) {
  if (!cambios || typeof cambios !== 'object') return null
  const filas = Object.entries(cambios).slice(0, 6)
  return (
    <ul className="ui-cambios">
      {filas.map(([campo, c]) => (
        <li key={campo}>
          <code>{campo}</code>:{' '}
          {c && typeof c === 'object' && 'antes' in c ? `${valor(c.antes)} → ${valor(c.despues)}` : valor(c)}
        </li>
      ))}
      {Object.keys(cambios).length > filas.length && <li>…</li>}
    </ul>
  )
}

// Bitácora de auditoría: quién hizo qué, cuándo y desde qué IP (ADMIN de su organización, ADMINPLAT toda).
export function AuditoriaPage() {
  const [accion, setAccion] = useState('')
  const [dias, setDias] = useState('7')
  const [busqueda, setBusqueda] = useState('')
  const { estado, datos, reintentar } = useDatos(
    () =>
      seguridad.auditoria({
        accion,
        desde: new Date(Date.now() - Number(dias) * 24 * 3600 * 1000).toISOString(),
      }),
    [accion, dias],
  )
  const registros = pagina(datos ?? [])
  const texto = busqueda.trim().toLowerCase()
  const lista = texto
    ? registros.filter((r) =>
        [r.usuario_correo, r.usuario_nombre, r.descripcion, r.recurso, r.ip].some((x) => x?.toLowerCase().includes(texto)),
      )
    : registros
  const cuenta = (a) => registros.filter((r) => r.accion === a).length

  return (
    <Pantalla
      eyebrow="Quién hizo qué, cuándo y desde dónde"
      titulo="Auditoría"
      cifras={{
        principal: {
          etiqueta: 'Registros',
          valor: datos ? datos.count ?? registros.length : '—',
          unidad: 'eventos',
          sub: DIAS.find((d) => d.value === dias)?.label,
        },
        cifras: [
          { etiqueta: 'Inicios de sesión', valor: cuenta('LOGIN'), tono: 'verde' },
          { etiqueta: 'Intentos fallidos', valor: cuenta('LOGIN_FALLIDO'), tono: cuenta('LOGIN_FALLIDO') ? 'peligro' : undefined },
          { etiqueta: 'Cambios', valor: cuenta('CREAR') + cuenta('MODIFICAR') + cuenta('ELIMINAR') },
          { etiqueta: 'Exportaciones', valor: cuenta('EXPORTAR') },
        ],
      }}
    >
      <div className="ui-filtros" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <Select label="Acción" value={accion} options={ACCIONES} onChange={(e) => setAccion(e.target.value)} />
        <Select label="Periodo" value={dias} options={DIAS} onChange={(e) => setDias(e.target.value)} />
        <div style={{ flex: 1 }} />
        <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por persona, IP o descripción…" />
      </div>
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <Card className="nc-grow">
          <div className="nc-table-wrap nc-scroll">
            <table className="nc-table ui-tabla-tarjetas">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Persona</th>
                  <th>Acción</th>
                  <th>Sobre</th>
                  <th>Detalle</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.num}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {esHoy(r.fecha_hora) ? 'Hoy' : fechaCorta(r.fecha_hora)}, {hora(r.fecha_hora)}
                    </td>
                    <td>
                      <div className="nc-table__device">
                        <div>
                          <strong>{r.usuario_nombre || r.usuario_correo || 'Sistema'}</strong>
                          {r.usuario_nombre && <span>{r.usuario_correo}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={TONO[r.accion] ?? 'neutral'}>{r.accion_nombre}</Badge>
                    </td>
                    <td>{r.recurso ? `${RECURSO[r.recurso] ?? r.recurso}${r.recurso_num ? ` #${r.recurso_num}` : ''}` : '—'}</td>
                    <td style={{ maxWidth: 360 }}>
                      {r.descripcion && <div style={{ fontSize: 13 }}>{r.descripcion}</div>}
                      <Cambios cambios={r.cambios} />
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{r.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="ui-muted" style={{ textAlign: 'center', padding: 32, margin: 0 }}>
                {texto ? `Nada coincide con «${busqueda}».` : 'Sin registros en este periodo.'}
              </p>
            )}
          </div>
        </Card>
      )}
    </Pantalla>
  )
}
