import { useState } from 'react'
import { Button, Card, Icon, Input, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Modal } from '../../components/Modal'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { AreaTexto } from '../comunes'
import { fecha, mensajeError, useAviso } from '../utilidades'

function NuevoDocumento({ cerrar, creado }) {
  const [clave, setClave] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState(null)
  const enviar = async () => {
    setError(null)
    try {
      creado(await nicoApi.crearDocumento({ clave, descripcion, contenido: '' }))
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <Modal
      titulo="Nuevo documento"
      sub="Por ejemplo HEARTBEAT, STYLE o FAQ. Se crea apagado y vacío."
      cerrar={cerrar}
      acciones={
        <Button icon="plus" disabled={!clave.trim()} onClick={enviar}>
          Crear
        </Button>
      }
    >
      <Input label="Nombre del archivo" icon="file-code" suffix=".md" value={clave} onChange={(e) => setClave(e.target.value)} />
      <Input label="Para qué sirve" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} error={error ?? undefined} />
    </Modal>
  )
}

// Los .md del agente: los activos se agregan a las instrucciones de la IA local en cada redacción.
export default function DocumentosConsola() {
  const { estado, datos, reintentar, actualizar } = useDatos(nicoApi.documentos, [])
  const [elegido, setElegido] = useState(null)
  const [borrador, setBorrador] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, avisar] = useAviso()
  const docs = datos?.documentos ?? []
  const doc = docs.find((d) => d.num === elegido) ?? docs[0]

  // Al cambiar de documento, el borrador empieza con su contenido guardado.
  if (doc && borrador?.num !== doc.num) {
    setBorrador({ num: doc.num, contenido: doc.contenido, activo: doc.activo, descripcion: doc.descripcion })
  }

  const cambiado = borrador && doc && borrador.num === doc.num && (borrador.contenido !== doc.contenido || borrador.activo !== doc.activo || borrador.descripcion !== doc.descripcion)
  // Lo que ocuparían los documentos activos con este borrador (la IA local tiene poco contexto).
  const usados = docs
    .filter((d) => (d.num === borrador?.num ? borrador.activo : d.activo))
    .reduce((s, d) => s + (d.num === borrador?.num ? borrador.contenido : d.contenido).trim().length + d.clave.length + 4, 0)
  const limite = datos?.limite ?? 2400
  const excede = usados > limite

  const guardar = async () => {
    setGuardando(true)
    try {
      const n = await nicoApi.editarDocumento(doc.num, { contenido: borrador.contenido, activo: borrador.activo, descripcion: borrador.descripcion })
      actualizar((d) => ({ ...d, documentos: d.documentos.map((x) => (x.num === n.num ? n : x)) }))
      avisar(n.activo ? 'Guardado: Nico ya lo usa en sus respuestas.' : 'Guardado (apagado: Nico no lo usa).')
    } catch (e) {
      avisar(mensajeError(e), 'danger')
    }
    setGuardando(false)
  }
  const borrar = async () => {
    try {
      await nicoApi.borrarDocumento(doc.num)
      actualizar((d) => ({ ...d, documentos: d.documentos.filter((x) => x.num !== doc.num) }))
      setElegido(null)
      avisar('Documento borrado.')
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo borrar.'), 'danger')
    }
  }

  return (
    <Pantalla
      eyebrow="Configuración"
      titulo="Documentos del agente"
      acciones={
        <Button icon="plus" variant="secondary" disabled={!datos} onClick={() => setNuevo(true)}>
          Nuevo documento
        </Button>
      }
    >
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && doc && borrador && (
        <div className="ui-consola-docs">
          <Card className="ui-consola-docs__lista">
            <span className="ui-eyebrow">Archivos</span>
            <ul>
              {docs.map((d) => (
                <li key={d.num}>
                  <button type="button" className={`ui-consola-doc${d.num === doc.num ? ' is-activo' : ''}`} onClick={() => setElegido(d.num)}>
                    <Icon name="file-code" size={18} />
                    <span>
                      <strong>{d.clave}.md</strong>
                      <small>{d.descripcion || 'Sin descripción'}</small>
                    </span>
                    <span className={`ui-consola-punto${d.activo && d.contenido.trim() ? ' is-on' : ''}`} title={d.activo ? 'Activo' : 'Apagado'} />
                  </button>
                </li>
              ))}
            </ul>
            <div className={`ui-consola-presupuesto${excede ? ' is-excede' : ''}`}>
              <span>
                Espacio para la IA: {usados.toLocaleString('es-MX')} / {limite.toLocaleString('es-MX')} caracteres
              </span>
              <span className="ui-consola-presupuesto__barra">
                <span style={{ width: `${Math.min(100, (usados / limite) * 100)}%` }} />
              </span>
              <small>
                {excede
                  ? 'Se pasa del límite: lo que sobre no llegará a la IA. Resume o apaga algún documento.'
                  : 'La IA local es pequeña: los documentos activos juntos deben ser breves y concretos.'}
              </small>
            </div>
          </Card>
          <Card className="nc-grow ui-consola-docs__editor">
            <div className="ui-consola-docs__cabeza">
              <div className="ui-titulo-fila">
                <strong style={{ fontSize: 18 }}>{doc.clave}.md</strong>
                <span className="ui-muted" style={{ fontSize: 12 }}>
                  {doc.actualizado_por_nombre ? `Editado por ${doc.actualizado_por_nombre} · ${fecha(doc.actualizado)}` : 'Sin editar'}
                </span>
              </div>
              <span style={{ flex: 1 }} />
              {aviso}
              <Toggle label="Activo" checked={borrador.activo} onChange={(v) => setBorrador({ ...borrador, activo: v })} />
            </div>
            <Input label="Para qué sirve" value={borrador.descripcion} onChange={(e) => setBorrador({ ...borrador, descripcion: e.target.value })} />
            <AreaTexto
              label="Contenido (Markdown)"
              mono
              filas={16}
              placeholder={`# ${doc.clave}\n\nEscribe aquí en frases cortas lo que Nico debe saber o cómo debe comportarse.`}
              value={borrador.contenido}
              onChange={(e) => setBorrador({ ...borrador, contenido: e.target.value })}
              hint={`${borrador.contenido.trim().length.toLocaleString('es-MX')} caracteres · las cifras siempre salen de los datos; los documentos guían el tono y el criterio.`}
            />
            <div className="ui-consola-docs__acciones">
              {!doc.base && (
                <Button variant="ghost" icon="trash-2" onClick={borrar}>
                  Borrar
                </Button>
              )}
              <span style={{ flex: 1 }} />
              <Button variant="secondary" disabled={!cambiado || guardando} onClick={() => setBorrador({ num: doc.num, contenido: doc.contenido, activo: doc.activo, descripcion: doc.descripcion })}>
                Descartar
              </Button>
              <Button icon="save" disabled={!cambiado || guardando} onClick={guardar}>
                Guardar
              </Button>
            </div>
          </Card>
        </div>
      )}
      {nuevo && (
        <NuevoDocumento
          cerrar={() => setNuevo(false)}
          creado={(d) => {
            setNuevo(false)
            actualizar((x) => ({ ...x, documentos: [...x.documentos, d] }))
            setElegido(d.num)
          }}
        />
      )}
    </Pantalla>
  )
}
