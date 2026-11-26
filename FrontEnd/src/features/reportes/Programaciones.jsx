import { useEffect, useState } from 'react'
import { Badge, Button, IconCircle } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import * as reportesApi from '../../services/reportes'
import * as usuariosApi from '../../services/usuarios'
import { pagina } from '../../utils/convertir'
import { fechaLarga } from '../../utils/formato'
import { etiquetaFormato } from './personalizacion'

const FRECUENCIAS = [
  { value: 'DIARIA', label: 'Diaria' },
  { value: 'SEMANAL', label: 'Semanal' },
  { value: 'MENSUAL', label: 'Mensual' },
]
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const HORAS = Array.from({ length: 48 }, (_, i) => {
  const hora = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
  return { value: hora, label: hora }
})
const DIAS_MES = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))
const USUARIO_ACTIVO = 'ACT'

const horaDe = (p) => String(p.hora ?? '08:00').slice(0, 5)

function textoFrecuencia(p) {
  if (p.frecuencia === 'SEMANAL') return `Cada ${DIAS[p.dia_semana] ?? 'lunes'} ${horaDe(p)}`
  if (p.frecuencia === 'MENSUAL') return `Día ${p.dia_mes ?? 1} de cada mes ${horaDe(p)}`
  return `Cada día ${horaDe(p)}`
}

const nombreArea = (areas, num) =>
  areas.find((a) => a.num === Number(num))?.nombre ?? 'Toda la organización'

function Formulario({ programacion, areas, formatos, usuarios, guardar, cerrar }) {
  const [frecuencia, setFrecuencia] = useState(programacion?.frecuencia ?? 'DIARIA')
  const [hora, setHora] = useState(horaDe(programacion ?? {}))
  const [diaSemana, setDiaSemana] = useState(String(programacion?.dia_semana ?? 0))
  const [diaMes, setDiaMes] = useState(String(programacion?.dia_mes ?? 1))
  const [area, setArea] = useState(programacion?.area ? String(programacion.area) : '')
  const [formato, setFormato] = useState(programacion?.formato ? String(programacion.formato) : '')
  const [destinatarios, setDestinatarios] = useState(() =>
    (programacion?.destinatarios ?? []).map(String),
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const activos = usuarios.filter((u) => u.estado_usuario === USUARIO_ACTIVO)
  const guardarFormulario = async () => {
    if (!destinatarios.length) {
      setError('Elige al menos un destinatario.')
      return
    }
    setGuardando(true)
    setError('')
    try {
      await guardar({
        frecuencia,
        hora,
        dia_semana: frecuencia === 'SEMANAL' ? Number(diaSemana) : null,
        dia_mes: frecuencia === 'MENSUAL' ? Number(diaMes) : null,
        area: area ? Number(area) : null,
        formato: formato ? Number(formato) : null,
        destinatarios: destinatarios.map(Number),
      })
    } catch (e) {
      setError(e?.datos?.dia_semana?.[0] || e?.datos?.dia_mes?.[0] || 'No se pudo guardar la programación.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo={programacion ? 'Editar programación' : 'Nueva programación'}
      sub="Elige cuándo se genera el reporte y quién lo recibe."
      cerrar={cerrar}
      acciones={
        <Button icon="circle-check" disabled={guardando} onClick={guardarFormulario}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      }
    >
      <div className="ui-grid-2">
        <Desplegable
          label="Frecuencia"
          value={frecuencia}
          onChange={setFrecuencia}
          options={FRECUENCIAS}
        />
        <Desplegable label="Hora" value={hora} onChange={setHora} options={HORAS} />
        {frecuencia === 'SEMANAL' && (
          <Desplegable
            label="Día de la semana"
            value={diaSemana}
            onChange={setDiaSemana}
            options={DIAS.map((label, value) => ({ value: String(value), label }))}
          />
        )}
        {frecuencia === 'MENSUAL' && (
          <Desplegable
            label="Día del mes"
            value={diaMes}
            onChange={setDiaMes}
            options={DIAS_MES}
          />
        )}
        <Desplegable
          label="Alcance"
          value={area}
          onChange={setArea}
          options={[
            { value: '', label: 'Toda la organización' },
            ...areas.map((a) => ({ value: String(a.num), label: a.nombre })),
          ]}
        />
        <Desplegable
          label="Formato"
          value={formato}
          onChange={setFormato}
          options={[
            { value: '', label: 'Predeterminado' },
            ...formatos.map((f) => ({ value: String(f.num), label: etiquetaFormato(f) })),
          ]}
        />
      </div>
      <fieldset className="ui-programacion__destinatarios">
        <legend>Destinatarios</legend>
        <p className="ui-muted">Solo aparecen las cuentas activas de la organización.</p>
        <div>
          {activos.map((u) => (
            <label key={u.num}>
              <input
                type="checkbox"
                checked={destinatarios.includes(String(u.num))}
                onChange={(e) =>
                  setDestinatarios((actuales) =>
                    e.target.checked
                      ? [...actuales, String(u.num)]
                      : actuales.filter((num) => num !== String(u.num)),
                  )
                }
              />
              <span>
                {u.nombre} {u.primer_apellido}
                <small>{u.correo}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <span className="ui-aviso ui-aviso--danger" role="alert">
          {error}
        </span>
      )}
    </Modal>
  )
}

// Lista administrable de las programaciones de reportes. ADMIN y SUPER crean, editan,
// pausan/reanudan y envían pruebas; los demás solo ven la lista.
export function Programaciones({ programaciones, areas, formatos, puedeEditar, onCambio }) {
  const [usuarios, setUsuarios] = useState([])
  const [modal, setModal] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!puedeEditar) return undefined
    let vivo = true
    usuariosApi
      .lista()
      .then((r) => vivo && setUsuarios(pagina(r)))
      .catch(() => vivo && setUsuarios([]))
    return () => {
      vivo = false
    }
  }, [puedeEditar])

  const guardar = async (datos) => {
    if (modal?.num) await reportesApi.actualizarProgramacion(modal.num, datos)
    else await reportesApi.crearProgramacion(datos)
    setModal(null)
    setMensaje('Programación guardada.')
    setError('')
    onCambio?.()
  }

  const alternar = async (programacion) => {
    try {
      await reportesApi.actualizarProgramacion(programacion.num, { activa: !programacion.activa })
      setMensaje(programacion.activa ? 'Programación pausada.' : 'Programación reanudada.')
      setError('')
      onCambio?.()
    } catch {
      setError('No se pudo cambiar la programación.')
    }
  }

  const probar = async (programacion) => {
    try {
      await reportesApi.probarProgramacion(programacion.num)
      setMensaje(`La prueba de «${textoFrecuencia(programacion)}» quedó en cola; llegará a tu correo al generarse.`)
      setError('')
    } catch (e) {
      setError(e?.status === 503 ? 'El servicio de IA no está disponible.' : 'No se pudo enviar la prueba.')
    }
  }

  return (
    <>
      <span className="ui-eyebrow" style={{ padding: '12px 12px 6px' }}>
        Programados por correo
      </span>
      {puedeEditar && (
        <div style={{ padding: '0 12px 8px' }}>
          <Button size="sm" icon="plus" onClick={() => setModal({})}>
            Nueva programación
          </Button>
        </div>
      )}
      {(mensaje || error) && (
        <div style={{ padding: '0 12px 8px' }}>
          <span
            className={`ui-aviso ui-aviso--bloque ${error ? 'ui-aviso--danger' : 'ui-aviso--success'}`}
            role="status"
          >
            {error || mensaje}
          </span>
        </div>
      )}
      {programaciones.length === 0 && (
        <p className="ui-muted" style={{ padding: '0 12px 12px' }}>
          No hay programaciones por correo.
        </p>
      )}
      {programaciones.map((p) => (
        <div key={p.num} className="ui-item" style={{ alignItems: 'flex-start', gap: 12, padding: 12 }}>
          <IconCircle name="calendar-clock" size="sm" />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="ui-programacion__cabeza">
              <div className="ui-titulo-fila">
                <strong style={{ fontSize: 14, lineHeight: '20px' }}>{textoFrecuencia(p)}</strong>
                <span style={{ fontSize: 12, lineHeight: '16px' }}>
                  {nombreArea(areas, p.area)} · {p.formato_nombre || 'Predeterminado'} ·{' '}
                  {p.destinatarios.length} {p.destinatarios.length === 1 ? 'destinatario' : 'destinatarios'}
                </span>
              </div>
              {puedeEditar && (
                <MenuAcciones
                  items={[
                    { label: 'Editar', icon: 'pencil', onClick: () => setModal(p) },
                    {
                      label: p.activa ? 'Pausar' : 'Reanudar',
                      icon: p.activa ? 'circle-x' : 'circle-check',
                      onClick: () => alternar(p),
                    },
                    { label: 'Enviar prueba ahora', icon: 'send', onClick: () => probar(p) },
                  ]}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {p.activa ? (
                <Badge tone="neutral" icon="calendar-clock">
                  Próximo {fechaLarga(p.proxima_ejecucion)}
                </Badge>
              ) : (
                <Badge tone="warning">Pausada</Badge>
              )}
            </div>
          </div>
        </div>
      ))}
      {modal && (
        <Formulario
          programacion={modal.num ? modal : null}
          areas={areas}
          formatos={formatos}
          usuarios={usuarios}
          guardar={guardar}
          cerrar={() => setModal(null)}
        />
      )}
    </>
  )
}
