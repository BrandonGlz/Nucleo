import { useState } from 'react'
import { Badge, Battery, Card, EmptyState, Icon, Skeleton } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Select } from '../../components/Desplegable'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { pagina } from '../../utils/convertir'
import { haceCuanto } from '../../utils/formato'
import { fecha, useAviso } from '../../consola/utilidades'
import { ESTADO_EQUIPO } from '../catalogos'
import { Confirmar, ErrorCarga, FiltroOrganizacion, Recorte } from '../comunes'
import { mensajeError, useDiferido, useOrganizaciones } from '../utilidades'

const ESTADOS = [{ value: '', label: 'Todos los estados' }, ...Object.entries(ESTADO_EQUIPO).map(([value, e]) => ({ value, label: e.label }))]

// Versión del firmware publicada, arriba a la derecha.
function Firmware({ firmware }) {
  if (!firmware) return null
  return (
    <span className="ui-admin-firmware" title={firmware.publicada ? `Publicada el ${fecha(firmware.publicada)}` : undefined}>
      <Icon name="cloud-download" size={16} />
      <span>
        <span>
          Firmware <strong>{firmware.version ? `v${firmware.version}` : 'sin publicar'}</strong>
        </span>
        <small>
          {firmware.ota_todos ? 'OTA a todos los equipos' : `OTA a ${firmware.dispositivos_ota} equipo${firmware.dispositivos_ota === 1 ? '' : 's'}`}
        </small>
      </span>
    </span>
  )
}

// Equipos ESP32 de todas las organizaciones: estado, conexión, batería y actualizaciones (OTA).
export default function DispositivosAdmin() {
  const organizaciones = useOrganizaciones()
  const [organizacion, setOrganizacion] = useState('')
  const [estadoEquipo, setEstadoEquipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const q = useDiferido(busqueda.trim())
  const { estado, datos, error, reintentar, actualizar } = useDatos(
    () => adminApi.dispositivos({ organizacion, estado: estadoEquipo, q }),
    [organizacion, estadoEquipo, q],
  )
  const fw = useDatos(adminApi.firmware, [])
  const [confirmacion, setConfirmacion] = useState(null)
  const [aviso, avisar] = useAviso()
  const equipos = pagina(datos)
  const hayFiltros = organizacion || estadoEquipo || q
  const otaTodos = fw.datos?.ota_todos

  const reemplazar = (d) => actualizar((x) => ({ ...x, results: pagina(x).map((y) => (y.num === d.num ? d : y)) }))
  const cambiarEstado = (d, estadoNuevo, texto) => async () => {
    reemplazar(await adminApi.editarDispositivo(d.num, { estado: estadoNuevo }))
    avisar(texto)
  }
  const alternarOta = async (d) => {
    try {
      reemplazar(await adminApi.editarDispositivo(d.num, { recibe_ota: !d.recibe_ota }))
      avisar(d.recibe_ota ? `${d.nombre} ya no recibe actualizaciones.` : `${d.nombre} recibirá la próxima actualización.`)
      fw.reintentar()
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo cambiar la OTA.'), 'danger')
    }
  }

  const acciones = (d) => {
    const fuera = d.estado === 'MANT' || d.estado === 'BAJA'
    return [
      d.estado !== 'MANT' &&
        d.estado !== 'BAJA' && {
          label: 'Poner en mantenimiento',
          icon: 'wrench',
          nota: 'Deja de generar alertas',
          onClick: () =>
            setConfirmacion({
              titulo: 'Poner en mantenimiento',
              mensaje: `${d.nombre} (${d.organizacion.nombre}) deja de generar alertas y de contar como sin conexión hasta que lo reactives.`,
              boton: 'Poner en mantenimiento',
              icono: 'wrench',
              hacer: cambiarEstado(d, 'MANT', `${d.nombre} está en mantenimiento.`),
            }),
        },
      fuera && {
        label: 'Reactivar',
        icon: 'power',
        nota: 'El sistema vuelve a ver si está en línea',
        onClick: () =>
          setConfirmacion({
            titulo: 'Reactivar equipo',
            mensaje: `${d.nombre} vuelve a monitorearse; su estado se calcula con su última conexión.`,
            boton: 'Reactivar',
            icono: 'power',
            hacer: cambiarEstado(d, 'ACTIVO', `${d.nombre} reactivado.`),
          }),
      },
      {
        label: d.recibe_ota ? 'Quitar OTA' : 'Activar OTA',
        icon: 'cloud-download',
        disabled: d.estado === 'BAJA',
        nota: otaTodos ? 'Hoy la OTA llega a todos (Políticas)' : undefined,
        onClick: () => alternarOta(d),
      },
      d.estado !== 'BAJA' && {
        label: 'Dar de baja',
        icon: 'trash-2',
        peligro: true,
        onClick: () =>
          setConfirmacion({
            titulo: 'Dar de baja el equipo',
            mensaje: `${d.nombre} (${d.codigo_mqtt}) deja de monitorearse y sus lecturas nuevas se ignoran. Su historial se conserva y puedes reactivarlo después.`,
            boton: 'Dar de baja',
            icono: 'trash-2',
            peligro: true,
            hacer: cambiarEstado(d, 'BAJA', `${d.nombre} quedó dado de baja.`),
          }),
      },
    ]
  }

  const cuenta = (fn) => equipos.filter(fn).length
  const cifras = datos
    ? {
        principal: {
          etiqueta: hayFiltros ? 'Equipos con estos filtros' : 'Equipos ESP32',
          valor: datos.count ?? equipos.length,
          unidad: 'registrados',
          sub: `${cuenta((d) => d.en_linea)} en línea ahora`,
        },
        cifras: [
          { etiqueta: 'Sin conexión', valor: cuenta((d) => d.estado === 'SINCONEX'), tono: cuenta((d) => d.estado === 'SINCONEX') ? 'peligro' : undefined },
          { etiqueta: 'Batería baja', valor: cuenta((d) => d.nivel_bateria != null && d.nivel_bateria <= 20 && d.estado !== 'BAJA') },
          { etiqueta: 'Mantenimiento', valor: cuenta((d) => d.estado === 'MANT') },
          { etiqueta: 'Con OTA', valor: otaTodos ? 'Todos' : cuenta((d) => d.recibe_ota), tono: 'verde' },
        ],
      }
    : { principal: { etiqueta: 'Equipos ESP32', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla eyebrow="Dispositivos de todas las organizaciones" titulo="Dispositivos" acciones={<Firmware firmware={fw.datos} />} cifras={cifras}>
      <div className="ui-filtros ui-admin-filtros">
        <FiltroOrganizacion organizaciones={organizaciones} value={organizacion} onChange={setOrganizacion} />
        <Select label="Estado" value={estadoEquipo} options={ESTADOS} onChange={(e) => setEstadoEquipo(e.target.value)} />
        <div style={{ flex: 1 }} />
        {aviso}
        <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por nombre o código MQTT…" />
      </div>
      {estado === 'error' && <ErrorCarga error={error} reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && !equipos.length && (
        <Card className="nc-grow">
          <div className="ui-centro">
            <EmptyState
              icon="cpu"
              title={hayFiltros ? 'Ningún equipo coincide' : 'Aún no hay equipos'}
              message={hayFiltros ? 'Prueba con otra organización, estado o búsqueda.' : 'Los equipos se registran desde la web de cada organización.'}
            />
          </div>
        </Card>
      )}
      {estado === 'listo' && equipos.length > 0 && (
        <Card className="nc-grow">
          <div className="nc-table-wrap nc-scroll">
            <table className="nc-table ui-tabla-tarjetas">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Organización</th>
                  <th>Estado</th>
                  <th>En línea</th>
                  <th>Batería</th>
                  <th>Última conexión</th>
                  <th>OTA</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {equipos.map((d) => {
                  const est = ESTADO_EQUIPO[d.estado] ?? { label: d.estado, tone: 'neutral' }
                  return (
                    <tr key={d.num}>
                      <td style={{ paddingTop: 12, paddingBottom: 12 }}>
                        <div className="nc-table__device">
                          <div>
                            <strong>{d.nombre}</strong>
                            <span className="ui-admin-mono">
                              {d.codigo_mqtt} · cada {d.intervalo_muestreo_seg} s
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="ui-titulo-fila">
                          <strong className="ui-admin-celda">{d.organizacion?.nombre ?? '—'}</strong>
                          <span>{d.area?.nombre ?? '—'}</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={est.tone} dot>
                          {est.label}
                        </Badge>
                      </td>
                      <td>
                        <span className={`ui-admin-enlinea${d.en_linea ? ' is-si' : ''}`}>
                          <i />
                          {d.en_linea ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td>{d.nivel_bateria == null ? <span className="ui-muted">—</span> : <Battery level={d.nivel_bateria} />}</td>
                      <td title={d.ultimo_arranque ? `Último arranque: ${fecha(d.ultimo_arranque)}` : undefined}>
                        {d.ultima_conexion ? haceCuanto(d.ultima_conexion) : 'Nunca'}
                      </td>
                      <td>
                        {otaTodos || d.recibe_ota ? (
                          <Badge tone="success" icon="cloud-download">
                            {d.recibe_ota ? 'Sí' : 'Todos'}
                          </Badge>
                        ) : (
                          <span className="ui-muted">No</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <MenuAcciones label={`Opciones de ${d.nombre}`} items={acciones(d)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Recorte datos={datos} mostrados={equipos.length} />
          </div>
        </Card>
      )}
      {confirmacion && <Confirmar {...confirmacion} cerrar={() => setConfirmacion(null)} />}
    </Pantalla>
  )
}
