import { useState } from 'react'
import { Button, Input, Toggle } from '../design-system/componentes/index.js'
import { Modal } from '../components/Modal'
import * as nicoApi from '../services/nico'
import { TIPOS } from './catalogos'
import { AreaTexto, Campo } from './comunes'
import { mensajeError } from './utilidades'

// Alta o edición de una respuesta. `inicial` puede venir del registro (enseñar desde una pregunta).
export function EditarRespuesta({ r, inicial, empresas, cerrar, guardada }) {
  const nueva = !r?.num
  const [f, setF] = useState(() => ({
    organizacion: r?.organizacion ?? inicial?.organizacion ?? empresas[0]?.num ?? '',
    tema: r?.tema || 'FIJA',
    pregunta: r?.pregunta ?? inicial?.pregunta ?? '',
    plantilla: r?.plantilla ?? inicial?.plantilla ?? '',
    activa: r?.activa ?? true,
  }))
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const tipo = TIPOS[f.tema] ?? TIPOS.FIJA
  const editarTipo = nueva || f.tema === 'FIJA' || f.tema === 'RUTA'
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    const cuerpo = { ...f, todas: f.organizacion === 'todas' }
    if (cuerpo.todas) delete cuerpo.organizacion
    try {
      guardada(await (nueva ? nicoApi.crearRespuesta(cuerpo) : nicoApi.editarRespuesta(r.num, cuerpo)), nueva)
    } catch (e) {
      setError(mensajeError(e))
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={nueva ? 'Nueva respuesta' : 'Editar respuesta'}
      sub={tipo.ayuda}
      cerrar={cerrar}
      acciones={
        <Button icon="save" disabled={!f.pregunta.trim() || !f.plantilla.trim() || enviando} onClick={enviar}>
          {nueva ? 'Agregar al banco' : 'Guardar'}
        </Button>
      }
    >
      <div className="ui-grid-2">
        <Campo
          label="Empresa"
          icon="building-2"
          value={f.organizacion}
          disabled={!nueva}
          onChange={(v) => setF({ ...f, organizacion: v })}
          options={[...(nueva ? [{ value: 'todas', label: 'Todas las empresas' }] : []), ...empresas.map((e) => ({ value: e.num, label: e.nombre }))]}
        />
        <Campo
          label="Tipo"
          icon="book-open"
          value={f.tema}
          disabled={!editarTipo}
          onChange={(v) => setF({ ...f, tema: v })}
          options={(editarTipo ? ['FIJA', 'RUTA'] : [f.tema]).map((k) => ({ value: k, label: TIPOS[k].label }))}
        />
      </div>
      <Input label="Pregunta" icon="message-square-text" value={f.pregunta} onChange={(e) => setF({ ...f, pregunta: e.target.value })} />
      <AreaTexto
        label={f.tema === 'RUTA' ? 'Responder como si preguntaran…' : 'Respuesta'}
        filas={f.tema === 'RUTA' ? 2 : 5}
        value={f.plantilla}
        onChange={(e) => setF({ ...f, plantilla: e.target.value })}
        error={error ?? undefined}
        hint={f.tema === 'RUTA' ? 'Una pregunta que Nico ya entiende, p. ej. «¿cómo está la temperatura hoy?»' : undefined}
      />
      <Toggle label="Activa" checked={f.activa} onChange={(v) => setF({ ...f, activa: v })} />
    </Modal>
  )
}

