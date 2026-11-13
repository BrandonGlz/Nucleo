import { useEffect, useState } from 'react'
import { Badge, Button, Card, Skeleton } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { EditarRespuesta } from '../EditarRespuesta'
import { fecha, useAviso } from '../utilidades'

const VIAS = {
  PREDEFINIDA: ['Reglas', 'neutral'],
  BANCO: ['Banco', 'success'],
  IA: ['IA', 'accent'],
  ENRUTADA: ['Interpretada por IA', 'accent'],
  REPETIDA: ['Repetida', 'neutral'],
  NO_ENTENDIDA: ['No entendida', 'danger'],
}

// Registro de lo que preguntan los usuarios: desde aquí se enseña la respuesta correcta al banco.
export default function RegistroConsola() {
  const arbol = useDatos(nicoApi.arbol, [])
  const empresas = arbol.datos?.empresas ?? []
  const [filtros, setFiltros] = useState({ organizacion: '', via: '', calificacion: '', q: '' })
  const [texto, setTexto] = useState('')
  const [paginas, setPaginas] = useState(1)
  const [modal, setModal] = useState(null)
  const [aviso, avisar] = useAviso()

  // La búsqueda se manda al servidor al dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.q === texto ? f : { ...f, q: texto })), 350)
    return () => clearTimeout(t)
  }, [texto])

  const { estado, datos, reintentar } = useDatos(
    async () => {
      const partes = await Promise.all(
        Array.from({ length: paginas }, (_, i) => nicoApi.registro({ ...filtros, page: i + 1, page_size: 50 })),
      )
      return { count: partes[0].count, results: partes.flatMap((p) => p.results) }
    },
    [filtros, paginas],
  )
  const filtrar = (cambio) => {
    setPaginas(1)
    setFiltros((f) => ({ ...f, ...cambio }))
  }
  const filas = datos?.results ?? []

  return (
    <Pantalla eyebrow="Conocimiento" titulo="Registro de preguntas">
      <Card className="nc-grow ui-consola-lista">
        <div className="ui-consola-barra">
          <Buscador valor={texto} cambiar={setTexto} placeholder="Buscar en preguntas y respuestas…" />
          <Desplegable
            icon="building-2"
            value={filtros.organizacion}
            onChange={(v) => filtrar({ organizacion: v })}
            options={[{ value: '', label: 'Todas las empresas' }, ...empresas.map((e) => ({ value: e.num, label: e.nombre }))]}
          />
          <Desplegable
            icon="list"
            value={filtros.via}
            onChange={(v) => filtrar({ via: v })}
            options={[{ value: '', label: 'Cualquier vía' }, ...Object.entries(VIAS).map(([k, [l]]) => ({ value: k, label: l }))]}
          />
          <Desplegable
            icon="thumbs-up"
            value={filtros.calificacion}
            onChange={(v) => filtrar({ calificacion: v })}
            options={[
              { value: '', label: 'Con o sin voto' },
              { value: 'no', label: 'Solo 👎' },
              { value: 'si', label: 'Solo 👍' },
            ]}
          />
          {aviso}
        </div>
        {estado === 'error' && <EstadoError reintentar={reintentar} />}
        {estado === 'cargando' && !filas.length && <Skeleton variant="card" />}
        {datos && filas.length === 0 && <p className="ui-muted ui-consola-vacio">No hay preguntas con ese filtro.</p>}
        {filas.length > 0 && (
          <>
            <span className="ui-muted ui-consola-cuenta">
              {filas.length} de {datos.count.toLocaleString('es-MX')} preguntas
            </span>
            <ul className="ui-consola-filas">
              {filas.map((p) => {
                const [via, tono] = VIAS[p.via] ?? [p.via, 'neutral']
                return (
                  <li key={p.num} className="ui-consola-fila">
                    <div className="ui-consola-fila__texto">
                      <strong>
                        {p.calificacion === 1 && '👍 '}
                        {p.calificacion === -1 && '👎 '}
                        {p.pregunta}
                      </strong>
                      <p>{p.respuesta}</p>
                      <span className="ui-consola-meta">
                        <Badge tone={tono}>{via}</Badge>
                        <span>{p.organizacion_nombre}</span>
                        <span>· {p.dispositivo_nombre}</span>
                        <span>· {p.usuario_nombre}</span>
                        <span>· {fecha(p.fecha)}</span>
                        <span>· {(p.milisegundos / 1000).toFixed(1)} s</span>
                        {p.tokens_salida > 0 && <span>· {p.tokens_entrada + p.tokens_salida} tokens</span>}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="lightbulb"
                      onClick={() => setModal({ organizacion: p.organizacion, pregunta: p.pregunta, plantilla: p.via === 'NO_ENTENDIDA' ? '' : p.respuesta })}
                    >
                      Enseñar
                    </Button>
                  </li>
                )
              })}
            </ul>
            {filas.length < datos.count && (
              <Button variant="secondary" block disabled={estado === 'cargando'} onClick={() => setPaginas((n) => n + 1)}>
                Cargar más
              </Button>
            )}
          </>
        )}
      </Card>
      {modal && (
        <EditarRespuesta
          inicial={modal}
          empresas={empresas}
          cerrar={() => setModal(null)}
          guardada={() => {
            setModal(null)
            avisar('Agregada al banco: la próxima vez Nico responderá así.')
          }}
        />
      )}
    </Pantalla>
  )
}
