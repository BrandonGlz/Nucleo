import { useState } from 'react'
import { Alert, Badge, Button, Card, EmptyState, Input, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as seguridad from '../../services/seguridad'
import { pagina } from '../../utils/convertir'
import { haceCuanto } from '../../utils/formato'
import { ErrorCarga, FiltroOrganizacion } from '../comunes'
import { mensajeError, useOrganizaciones } from '../utilidades'

const EVENTOS = [
  ['alerta.nueva', 'Alerta nueva'],
  ['alerta.atendida', 'Alerta atendida'],
  ['alerta.descartada', 'Alerta descartada'],
]
// Los sistemas externos usan la API del dominio principal (sin «admin.»).
const API = `${window.location.origin.replace('//admin.', '//')}/api/v1`
const error = (err, porDefecto) => mensajeError(err, porDefecto)

async function cargar(organizacion) {
  if (!organizacion) return null
  const [t, w] = await Promise.all([seguridad.tokens(organizacion), seguridad.webhooks(organizacion)])
  return { tokens: pagina(t), webhooks: pagina(w) }
}

// Un valor secreto que solo se ve al crearlo (clave del token o secreto del webhook).
function Secreto({ titulo, sub, valor, cerrar, children }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Modal
      titulo={titulo}
      sub={sub}
      tamano="chico"
      cerrar={cerrar}
      acciones={
        <Button icon="circle-check" onClick={cerrar}>
          Ya lo guardé
        </Button>
      }
    >
      <span className="ui-secreto">{valor}</span>
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon="copy"
          onClick={() => navigator.clipboard?.writeText(valor).then(() => setCopiado(true)).catch(() => {})}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      {children}
    </Modal>
  )
}

function NuevoToken({ organizacion, cerrar, creado }) {
  const [nombre, setNombre] = useState('')
  const [dias, setDias] = useState('')
  const [aviso, setAviso] = useState()
  const crear = async () => {
    try {
      const fecha_expiracion = dias ? new Date(Date.now() + Number(dias) * 24 * 3600 * 1000).toISOString() : null
      creado(await seguridad.crearToken({ nombre, fecha_expiracion }, organizacion))
    } catch (err) {
      setAviso(error(err, 'No se pudo crear el token.'))
    }
  }
  return (
    <Modal
      titulo="Nuevo token de API"
      tamano="mediano"
      sub="De solo lectura: consulta dispositivos, sensores, lecturas y alertas de esta organización."
      cerrar={cerrar}
      acciones={
        <Button icon="key-round" disabled={!nombre.trim()} onClick={crear}>
          Crear token
        </Button>
      }
    >
      <div className="ui-grid-2">
        <Input label="Nombre" placeholder="Por ejemplo: ERP de mantenimiento" value={nombre} error={aviso} onChange={(e) => setNombre(e.target.value)} />
        <Input
          label="Caduca en (días)"
          type="number"
          min="1"
          placeholder="Sin caducidad"
          hint="Vacío: no caduca; se puede revocar en cualquier momento."
          value={dias}
          onChange={(e) => setDias(e.target.value)}
        />
      </div>
    </Modal>
  )
}

function NuevoWebhook({ organizacion, cerrar, creado }) {
  const [datos, setDatos] = useState({ nombre: '', url: 'https://', eventos: ['alerta.nueva'] })
  const [aviso, setAviso] = useState()
  const alternar = (e) =>
    setDatos((d) => ({ ...d, eventos: d.eventos.includes(e) ? d.eventos.filter((x) => x !== e) : [...d.eventos, e] }))
  const crear = async () => {
    try {
      creado(await seguridad.crearWebhook(datos, organizacion))
    } catch (err) {
      setAviso(error(err, 'No se pudo crear el webhook.'))
    }
  }
  return (
    <Modal
      titulo="Nuevo webhook"
      tamano="mediano"
      sub="Núcleo mandará un POST firmado a esta dirección HTTPS en cada evento elegido."
      cerrar={cerrar}
      acciones={
        <Button icon="webhook" disabled={!datos.nombre.trim() || !datos.eventos.length} onClick={crear}>
          Crear webhook
        </Button>
      }
    >
      <div className="ui-grid-2">
        <Input label="Nombre" value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
        <div className="ui-form-ancho">
          <Input label="URL (https)" value={datos.url} error={aviso} onChange={(e) => setDatos({ ...datos, url: e.target.value })} />
        </div>
        <div className="ui-form-ancho">
          {EVENTOS.map(([id, label]) => (
            <Toggle key={id} label={label} checked={datos.eventos.includes(id)} onChange={() => alternar(id)} />
          ))}
        </div>
      </div>
    </Modal>
  )
}

// Integraciones de una organización (se elige arriba; todas las peticiones llevan ?organizacion=):
// tokens de API de solo lectura y webhooks de alertas.
export default function IntegracionesAdmin() {
  const organizaciones = useOrganizaciones()
  const [organizacion, setOrganizacion] = useState('')
  const { estado, datos, error: errorCarga, reintentar, actualizar } = useDatos(() => cargar(organizacion), [organizacion])
  const [modal, setModal] = useState(null)
  const [secreto, setSecreto] = useState(null)
  const [aviso, setAviso] = useState(null)
  const avisar = (t, tono = 'success') => {
    setAviso({ t, tono })
    setTimeout(() => setAviso(null), 4000)
  }

  const tokens = datos?.tokens ?? []
  const webhooks = datos?.webhooks ?? []
  const revocar = async (t) => {
    try {
      await seguridad.revocarToken(t.num, organizacion)
      actualizar((d) => ({ ...d, tokens: d.tokens.map((x) => (x.num === t.num ? { ...x, activo: false } : x)) }))
      avisar(`Token «${t.nombre}» revocado.`)
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo revocar el token.'), 'danger')
    }
  }
  const cambiarWebhook = async (w, cambios, texto) => {
    try {
      const nuevo = await seguridad.actualizarWebhook(w.num, cambios, organizacion)
      actualizar((d) => ({ ...d, webhooks: d.webhooks.map((x) => (x.num === w.num ? nuevo : x)) }))
      avisar(texto)
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo cambiar el webhook.'), 'danger')
    }
  }
  const probar = async (w) => {
    try {
      const r = await seguridad.probarWebhook(w.num, organizacion)
      avisar(r.exito ? `Prueba entregada (${r.estado}).` : `La prueba falló: ${r.estado}.`, r.exito ? 'success' : 'danger')
      reintentar()
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo probar el webhook.'), 'danger')
    }
  }
  const borrar = async (w) => {
    try {
      await seguridad.borrarWebhook(w.num, organizacion)
      actualizar((d) => ({ ...d, webhooks: d.webhooks.filter((x) => x.num !== w.num) }))
      avisar(`Webhook «${w.nombre}» eliminado.`)
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo eliminar el webhook.'), 'danger')
    }
  }
  const nombreOrg = organizaciones.find((o) => String(o.num) === organizacion)?.nombre

  return (
    <Pantalla
      eyebrow={nombreOrg ? `Conexiones de ${nombreOrg} con otros sistemas` : 'Conecta Núcleo con otros sistemas'}
      titulo="Integraciones"
      acciones={
        aviso && (
          <span className={`ui-aviso ui-aviso--${aviso.tono}`} role="status">
            {aviso.t}
          </span>
        )
      }
      cifras={{
        principal: { etiqueta: 'Integraciones', valor: datos ? tokens.filter((t) => t.activo).length + webhooks.filter((w) => w.activo).length : '—', unidad: 'activas' },
        cifras: [
          { etiqueta: 'Tokens de API', valor: tokens.filter((t) => t.activo).length, tono: 'verde' },
          { etiqueta: 'Webhooks', valor: webhooks.filter((w) => w.activo).length },
          { etiqueta: 'Webhooks con fallas', valor: webhooks.filter((w) => w.fallos_consecutivos > 0).length, tono: webhooks.some((w) => w.fallos_consecutivos > 0) ? 'peligro' : undefined },
        ],
      }}
    >
      <div className="ui-filtros" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <FiltroOrganizacion
          organizaciones={organizaciones}
          value={organizacion}
          onChange={setOrganizacion}
          todas={false}
          placeholder="Elige una organización"
        />
      </div>
      {!organizacion && (
        <Card className="nc-grow">
          <div className="ui-centro">
            <EmptyState
              icon="building-2"
              title="Elige una organización"
              message="Los tokens de API y los webhooks son de cada organización: elige cuál quieres revisar."
            />
          </div>
        </Card>
      )}
      {organizacion && estado === 'error' && <ErrorCarga error={errorCarga} reintentar={reintentar} />}
      {organizacion && estado === 'cargando' && <Skeleton variant="card" />}
      {organizacion && estado === 'listo' && datos && (
        <div className="ui-fila" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
          <Card className="nc-grow">
            <div className="ui-panel">
              <div className="nc-card__head" style={{ margin: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="nc-card__title">Tokens de API</h3>
                  <p className="nc-card__sub">
                    Solo lectura. Encabezado <code>Authorization: ApiKey &lt;token&gt;</code> en {API}/dispositivos/,
                    /lecturas/ y /alertas/
                  </p>
                </div>
                <Button size="sm" icon="plus" onClick={() => setModal('token')}>
                  Nuevo
                </Button>
              </div>
              {tokens.length === 0 && <p className="ui-muted">Aún no hay tokens.</p>}
              {tokens.map((t) => (
                <div key={t.num} className="ui-item">
                  <div className="ui-titulo-fila" style={{ flex: 1, gap: 2 }}>
                    <strong>{t.nombre}</strong>
                    <span>
                      nuc_{t.prefijo}_… · {t.ultimo_uso ? `usado ${haceCuanto(t.ultimo_uso)}` : 'sin usar'}
                      {t.fecha_expiracion ? ` · caduca ${haceCuanto(t.fecha_expiracion)}` : ''}
                    </span>
                  </div>
                  <Badge tone={t.activo ? 'success' : 'offline'} dot>
                    {t.activo ? 'Activo' : 'Revocado'}
                  </Badge>
                  {t.activo && (
                    <MenuAcciones label={`Opciones de ${t.nombre}`} items={[{ label: 'Revocar', icon: 'trash-2', peligro: true, onClick: () => revocar(t) }]} />
                  )}
                </div>
              ))}
            </div>
          </Card>
          <Card className="nc-grow">
            <div className="ui-panel">
              <div className="nc-card__head" style={{ margin: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="nc-card__title">Webhooks de alertas</h3>
                  <p className="nc-card__sub">POST JSON firmado con HMAC-SHA256 en el encabezado X-Nucleo-Firma</p>
                </div>
                <Button size="sm" icon="plus" onClick={() => setModal('webhook')}>
                  Nuevo
                </Button>
              </div>
              {webhooks.length === 0 && <p className="ui-muted">Aún no hay webhooks.</p>}
              {webhooks.map((w) => (
                <div key={w.num} className="ui-item">
                  <div className="ui-titulo-fila" style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <strong>{w.nombre}</strong>
                    <span style={{ overflowWrap: 'anywhere' }}>{w.url}</span>
                    <span>
                      {w.ultimo_envio ? `${w.ultimo_estado} · ${haceCuanto(w.ultimo_envio)}` : 'Sin envíos'}
                      {w.fallos_consecutivos > 0 ? ` · ${w.fallos_consecutivos} fallas seguidas` : ''}
                    </span>
                  </div>
                  <Badge tone={w.activo ? 'success' : 'offline'} dot>
                    {w.activo ? 'Activo' : 'Pausado'}
                  </Badge>
                  <MenuAcciones
                    label={`Opciones de ${w.nombre}`}
                    items={[
                      { label: 'Enviar prueba', icon: 'send', onClick: () => probar(w) },
                      {
                        label: w.activo ? 'Pausar' : 'Reanudar',
                        icon: w.activo ? 'bell-off' : 'bell',
                        onClick: () => cambiarWebhook(w, { activo: !w.activo }, w.activo ? 'Webhook pausado.' : 'Webhook reanudado.'),
                      },
                      { label: 'Eliminar', icon: 'trash-2', peligro: true, onClick: () => borrar(w) },
                    ]}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {modal === 'token' && (
        <NuevoToken
          organizacion={organizacion}
          cerrar={() => setModal(null)}
          creado={({ clave, ...t }) => {
            actualizar((d) => ({ ...d, tokens: [t, ...d.tokens] }))
            setModal(null)
            setSecreto({ titulo: 'Copia el token de API', valor: clave, sub: 'No se volverá a mostrar. Guárdalo en el sistema que lo usará.' })
          }}
        />
      )}
      {modal === 'webhook' && (
        <NuevoWebhook
          organizacion={organizacion}
          cerrar={() => setModal(null)}
          creado={({ secreto: s, ...w }) => {
            actualizar((d) => ({ ...d, webhooks: [w, ...d.webhooks] }))
            setModal(null)
            setSecreto({ titulo: 'Copia el secreto del webhook', valor: s, sub: 'Sirve para comprobar la firma X-Nucleo-Firma. No se volverá a mostrar.', webhook: true })
          }}
        />
      )}
      {secreto && (
        <Secreto titulo={secreto.titulo} sub={secreto.sub} valor={secreto.valor} cerrar={() => setSecreto(null)}>
          {secreto.webhook && (
            <Alert level="info" title="Cómo comprobar la firma">
              HMAC-SHA256 con este secreto sobre «X-Nucleo-Fecha» + «.» + el cuerpo; compáralo con X-Nucleo-Firma (sha256=…).
            </Alert>
          )}
        </Secreto>
      )}
    </Pantalla>
  )
}
