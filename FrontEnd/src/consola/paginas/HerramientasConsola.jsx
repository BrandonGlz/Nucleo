import { useState } from 'react'
import { Badge, Button, Card, IconButton, IconCircle, Input, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { Modal } from '../../components/Modal'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { NOMBRES } from '../catalogos'
import { AreaTexto, Campo } from '../comunes'
import { mensajeError, useAviso } from '../utilidades'

const ICONOS = {
  lecturas: 'activity',
  alertas: 'bell',
  dispositivo: 'cpu',
  configuracion: 'sliders-horizontal',
  reportes: 'file-text',
  acciones: 'send',
  conocimiento: 'info',
}

function EditarHerramienta({ h, propositos, cerrar, guardada }) {
  const [f, setF] = useState({ descripcion: h.descripcion, proposito: h.proposito, ejemplo: h.ejemplo })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const guardar = async (cuerpo) => {
    setEnviando(true)
    setError(null)
    try {
      guardada(await nicoApi.ajustarHerramienta(h.nombre, cuerpo))
    } catch (e) {
      setError(mensajeError(e))
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={NOMBRES[h.nombre] ?? h.nombre}
      sub="Cómo la entiende Nico y para qué se usa. Lo que dejes vacío vuelve al texto original."
      cerrar={cerrar}
      acciones={
        <>
          {h.editada && (
            <Button variant="secondary" icon="rotate-ccw" disabled={enviando} onClick={() => guardar({ restaurar: true })}>
              Restaurar original
            </Button>
          )}
          <Button icon="save" disabled={enviando} onClick={() => guardar(f)}>
            Guardar
          </Button>
        </>
      }
    >
      <Campo
        label="Propósito"
        icon={ICONOS[f.proposito] ?? 'wrench'}
        value={f.proposito}
        onChange={(v) => setF({ ...f, proposito: v })}
        options={propositos.map((p) => ({ value: p.clave, label: p.nombre }))}
      />
      <AreaTexto label="Qué hace" filas={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
      <Input label="Pregunta de ejemplo" icon="message-square-text" value={f.ejemplo} onChange={(e) => setF({ ...f, ejemplo: e.target.value })} error={error ?? undefined} />
    </Modal>
  )
}

// Herramientas: qué puede consultar Nico, agrupadas por propósito. Apagar una la quita de todos los chats.
export default function HerramientasConsola() {
  const { estado, datos, reintentar, actualizar } = useDatos(nicoApi.herramientas, [])
  const [proposito, setProposito] = useState('todos')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)
  const [aviso, avisar] = useAviso()
  const lista = datos?.herramientas ?? []
  const propositos = datos?.propositos ?? []
  const nombreProposito = Object.fromEntries(propositos.map((p) => [p.clave, p.nombre]))
  const t = q.trim().toLowerCase()
  const visibles = lista.filter(
    (h) =>
      (proposito === 'todos' || h.proposito === proposito) &&
      (!t || (NOMBRES[h.nombre] ?? h.nombre).toLowerCase().includes(t) || h.descripcion.toLowerCase().includes(t)),
  )
  const poner = (n) => actualizar((d) => ({ ...d, herramientas: d.herramientas.map((x) => (x.nombre === n.nombre ? n : x)) }))
  const alternar = async (h) => {
    try {
      poner(await nicoApi.ajustarHerramienta(h.nombre, { activa: !h.activa }))
      avisar(h.activa ? `«${NOMBRES[h.nombre] ?? h.nombre}» apagada: Nico dirá que esa consulta está desactivada.` : `«${NOMBRES[h.nombre] ?? h.nombre}» activa.`)
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo cambiar.'), 'danger')
    }
  }
  const cifras = datos
    ? {
        principal: { etiqueta: 'Herramientas', valor: lista.filter((h) => h.activa).length, unidad: `de ${lista.length} activas` },
        cifras: [
          { etiqueta: 'Consultas', valor: lista.filter((h) => !h.accion).length, tono: 'verde' },
          { etiqueta: 'Acciones con confirmación', valor: lista.filter((h) => h.accion).length },
          { etiqueta: 'Editadas', valor: lista.filter((h) => h.editada).length },
        ],
      }
    : { principal: { etiqueta: 'Herramientas', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla eyebrow="Configuración" titulo="Herramientas" cifras={cifras}>
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <Card className="nc-grow ui-consola-lista">
          <div className="ui-consola-barra">
            <Desplegable
              icon={ICONOS[proposito] ?? 'wrench'}
              value={proposito}
              onChange={setProposito}
              options={[
                { value: 'todos', label: `Todos los propósitos (${lista.length})` },
                ...propositos.map((p) => ({ value: p.clave, label: `${p.nombre} (${lista.filter((h) => h.proposito === p.clave).length})` })),
              ]}
            />
            <Buscador valor={q} cambiar={setQ} placeholder="Buscar herramienta…" />
            <span style={{ flex: 1 }} />
            {aviso}
          </div>
          <ul className="ui-consola-herramientas">
            {visibles.map((h) => (
              <li key={h.nombre} className={`ui-consola-herramienta${h.activa ? '' : ' is-apagada'}`}>
                <IconCircle name={ICONOS[h.proposito] ?? 'wrench'} tone={h.activa ? 'accent' : 'neutral'} size="sm" />
                <div className="ui-consola-herramienta__texto">
                  <div className="ui-consola-herramienta__cabeza">
                    <strong>{NOMBRES[h.nombre] ?? h.nombre}</strong>
                    <Badge tone="neutral">{nombreProposito[h.proposito] ?? h.proposito}</Badge>
                    {h.accion && <Badge tone="warning">Pide confirmación</Badge>}
                    {h.editada && <Badge tone="success">Editada</Badge>}
                  </div>
                  <p>{h.descripcion}</p>
                  <span className="ui-consola-ejemplo">Ejemplo: «{h.ejemplo}»</span>
                </div>
                <IconButton icon="pencil" label={`Editar ${NOMBRES[h.nombre] ?? h.nombre}`} onClick={() => setModal(h)} />
                <Toggle checked={h.activa} ariaLabel={h.activa ? 'Apagar' : 'Activar'} onChange={() => alternar(h)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {modal && (
        <EditarHerramienta
          h={modal}
          propositos={propositos}
          cerrar={() => setModal(null)}
          guardada={(n) => {
            setModal(null)
            poner(n)
            avisar('Herramienta guardada.')
          }}
        />
      )}
    </Pantalla>
  )
}
