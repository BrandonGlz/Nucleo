import { useState } from 'react'
import { Badge, Button, Card, Input, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Modal } from '../../components/Modal'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { AreaTexto } from '../comunes'
import { NOMBRES } from '../catalogos'
import { mensajeError, useAviso } from '../utilidades'

function EditarHerramienta({ h, cerrar, guardada }) {
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
      sub="Lo que hace la herramienta, para qué existe y un ejemplo de pregunta. Si lo dejas vacío, se usa el texto original."
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
      <AreaTexto label="Qué hace" filas={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} hint={`Original: ${h.original.descripcion}`} />
      <AreaTexto label="Propósito" filas={2} value={f.proposito} onChange={(e) => setF({ ...f, proposito: e.target.value })} hint={`Original: ${h.original.proposito}`} />
      <Input label="Pregunta de ejemplo" icon="message-square-text" value={f.ejemplo} onChange={(e) => setF({ ...f, ejemplo: e.target.value })} error={error ?? undefined} />
    </Modal>
  )
}

// Herramientas y propósitos: qué puede consultar Nico. Apagar una la quita de todos los chats.
export default function HerramientasConsola() {
  const { estado, datos, reintentar, actualizar } = useDatos(nicoApi.herramientas, [])
  const [modal, setModal] = useState(null)
  const [aviso, avisar] = useAviso()
  const lista = datos ?? []
  const poner = (n) => actualizar((l) => l.map((x) => (x.nombre === n.nombre ? n : x)))
  const alternar = async (h) => {
    try {
      poner(await nicoApi.ajustarHerramienta(h.nombre, { activa: !h.activa }))
      avisar(h.activa ? `«${NOMBRES[h.nombre] ?? h.nombre}» apagada: Nico dirá que esa consulta está desactivada.` : `«${NOMBRES[h.nombre] ?? h.nombre}» activa.`)
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo cambiar.'), 'danger')
    }
  }
  const activas = lista.filter((h) => h.activa).length
  const cifras = datos
    ? {
        principal: { etiqueta: 'Herramientas', valor: activas, unidad: `de ${lista.length} activas` },
        cifras: [
          { etiqueta: 'Consultas', valor: lista.filter((h) => !h.accion).length, tono: 'verde' },
          { etiqueta: 'Acciones con confirmación', valor: lista.filter((h) => h.accion).length },
          { etiqueta: 'Editadas', valor: lista.filter((h) => h.editada).length },
        ],
      }
    : { principal: { etiqueta: 'Herramientas', valor: '—', tonoValor: 'apagado' } }
  return (
    <Pantalla eyebrow="Configuración" titulo="Herramientas y propósitos" cifras={cifras} acciones={aviso}>
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <div className="ui-consola-herramientas">
          {lista.map((h) => (
            <Card key={h.nombre} className={`ui-consola-herramienta${h.activa ? '' : ' is-apagada'}`}>
              <div className="ui-consola-herramienta__cabeza">
                <strong>{NOMBRES[h.nombre] ?? h.nombre}</strong>
                <code>{h.nombre}</code>
                <span style={{ flex: 1 }} />
                <Toggle checked={h.activa} ariaLabel={h.activa ? 'Apagar' : 'Activar'} onChange={() => alternar(h)} />
              </div>
              <p>{h.descripcion}</p>
              <span className="ui-eyebrow">Propósito</span>
              <p className="ui-muted">{h.proposito}</p>
              <div className="ui-consola-herramienta__pie">
                <span className="ui-consola-ejemplo">«{h.ejemplo}»</span>
                {h.accion && <Badge tone="warning">Escribe al confirmar</Badge>}
                {h.editada && <Badge tone="neutral">Editada</Badge>}
                <span style={{ flex: 1 }} />
                <Button variant="ghost" size="sm" icon="pencil" onClick={() => setModal(h)}>
                  Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {modal && (
        <EditarHerramienta
          h={modal}
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
