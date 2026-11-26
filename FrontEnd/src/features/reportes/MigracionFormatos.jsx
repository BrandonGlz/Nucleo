import { useState } from 'react'
import { Button, Card } from '../../design-system/componentes/index.js'
import * as formatosApi from '../../services/formatos'

const CLAVE_FORMATOS = 'nucleo.reportes.formatos'
const CLAVE_WIDGETS = 'nucleo.reportes.widgets'

function leerFormatosLocales() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_FORMATOS))
    return (guardado?.formatos ?? []).filter((f) => f.id !== 'estandar')
  } catch {
    return []
  }
}

const quitarClaves = () => {
  try {
    localStorage.removeItem(CLAVE_FORMATOS)
    localStorage.removeItem(CLAVE_WIDGETS)
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

// Crea por la API los formatos viejos; si el nombre ya existe, le pone « (importado)».
// eslint-disable-next-line react-refresh/only-export-components
export async function subirFormatos(pendientes, formatos) {
  const usados = new Set(formatos.map((f) => f.nombre))
  const subidos = []
  for (const formato of pendientes) {
    const original = formato.nombre || 'Formato'
    let nombre = usados.has(original) ? `${original} (importado)` : original
    let numero = 2
    while (usados.has(nombre)) nombre = `${original} (importado) (${numero++})`
    subidos.push(await formatosApi.crear({ nombre, conf: formato.conf ?? {} }))
    usados.add(nombre)
  }
  return subidos
}

// Aviso para recuperar los formatos que quedaron en el navegador antes de que vivieran en la API.
export function MigracionFormatos({ formatos, alSubir }) {
  const [pendientes, setPendientes] = useState(leerFormatosLocales)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  if (!pendientes.length) {
    return mensaje ? (
      <Card>
        <span className="ui-aviso ui-aviso--success" role="status">
          {mensaje}
        </span>
      </Card>
    ) : null
  }

  const subir = async () => {
    setSubiendo(true)
    setError('')
    try {
      const subidos = await subirFormatos(pendientes, formatos)
      quitarClaves()
      setPendientes([])
      setMensaje(
        `Se subieron ${subidos.length} ${subidos.length === 1 ? 'formato' : 'formatos'} a la organización.`,
      )
      await alSubir?.()
    } catch {
      setError('No se pudieron subir los formatos. Intenta de nuevo.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Card>
      <div className="ui-titulo-fila">
        <strong>Formatos guardados en este navegador</strong>
        <span className="ui-muted">
          Antes los formatos vivían en el navegador. Puedes subirlos a la organización para
          compartirlos con las demás personas.
        </span>
      </div>
      {error && (
        <span className="ui-aviso ui-aviso--danger" role="alert">
          {error}
        </span>
      )}
      <div className="ui-migracion-formatos__acciones">
        <Button size="sm" icon="save" disabled={subiendo} onClick={subir}>
          {subiendo ? 'Subiendo…' : 'Subir mis formatos a la organización'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => {
          quitarClaves()
          setPendientes([])
        }}>
          Descartar
        </Button>
      </div>
    </Card>
  )
}
