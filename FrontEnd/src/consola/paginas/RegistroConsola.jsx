import { useEffect, useState } from 'react'
import { Button, Card, Chip, Icon, Skeleton } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { EditarRespuesta } from '../EditarRespuesta'
import { VIAS } from '../catalogos'
import { fecha, useAviso } from '../utilidades'

const cargarContexto = async () => {
  const [arbol, resumen] = await Promise.all([nicoApi.arbol(), nicoApi.resumen()])
  return { empresas: arbol.empresas, porVia: Object.fromEntries(resumen.por_via.map((x) => [x.via, x.total])), total: resumen.preguntas }
}

function Fila({ p, ensenar }) {
  const via = VIAS[p.via] ?? { label: p.via, icono: 'list', color: 'var(--text-muted)' }
  return (
    <li className="ui-consola-pregunta" style={{ '--via': via.color }}>
      <span className="ui-consola-pregunta__icono" title={via.label}>
        <Icon name={via.icono} size={16} />
      </span>
      <div className="ui-consola-pregunta__cuerpo">
        <div className="ui-consola-pregunta__cabeza">
          <strong>{p.pregunta}</strong>
          {p.calificacion === 1 && (
            <span className="ui-consola-voto is-si" title="Marcada como útil">
              <Icon name="thumbs-up" size={14} />
            </span>
          )}
          {p.calificacion === -1 && (
            <span className="ui-consola-voto is-no" title="Marcada como no útil">
              <Icon name="thumbs-down" size={14} />
            </span>
          )}
        </div>
        <p className="ui-consola-pregunta__respuesta">{p.respuesta}</p>
        <span className="ui-consola-meta">
          <span className="ui-consola-pregunta__via">{via.label}</span>
          <span>
            <Icon name="building-2" size={12} /> {p.organizacion_nombre}
          </span>
          <span>
            <Icon name="cpu" size={12} /> {p.dispositivo_nombre}
          </span>
          <span>
            <Icon name="user" size={12} /> {p.usuario_nombre}
          </span>
          <span>
            <Icon name="clock" size={12} /> {fecha(p.fecha)} · {(p.milisegundos / 1000).toFixed(1)} s
          </span>
          {p.tokens_salida > 0 && <span>{p.tokens_entrada + p.tokens_salida} tokens</span>}
        </span>
      </div>
      <Button variant="ghost" size="sm" icon="lightbulb" onClick={ensenar}>
        Enseñar
      </Button>
    </li>
  )
}

// Registro de lo que preguntan los usuarios: desde aquí se enseña la respuesta correcta al banco.
export default function RegistroConsola() {
  const contexto = useDatos(cargarContexto, [])
  const empresas = contexto.datos?.empresas ?? []
  const porVia = contexto.datos?.porVia ?? {}
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
      const partes = await Promise.all(Array.from({ length: paginas }, (_, i) => nicoApi.registro({ ...filtros, page: i + 1, page_size: 50 })))
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
        <div className="ui-consola-chips">
          <Chip selected={!filtros.via} count={contexto.datos?.total} onClick={() => filtrar({ via: '' })}>
            Todas
          </Chip>
          {Object.entries(VIAS).map(([k, v]) => (
            <Chip key={k} icon={v.icono} selected={filtros.via === k} count={porVia[k] ?? 0} onClick={() => filtrar({ via: filtros.via === k ? '' : k })}>
              {v.label}
            </Chip>
          ))}
        </div>
        <div className="ui-consola-barra">
          <Buscador valor={texto} cambiar={setTexto} placeholder="Buscar en preguntas y respuestas…" ancho={320} />
          <Desplegable
            icon="building-2"
            value={filtros.organizacion}
            onChange={(v) => filtrar({ organizacion: v })}
            options={[{ value: '', label: 'Todas las empresas' }, ...empresas.map((e) => ({ value: e.num, label: e.nombre }))]}
          />
          <Desplegable
            icon="thumbs-up"
            value={filtros.calificacion}
            onChange={(v) => filtrar({ calificacion: v })}
            options={[
              { value: '', label: 'Con o sin calificación' },
              { value: 'no', label: 'Marcadas como no útiles' },
              { value: 'si', label: 'Marcadas como útiles' },
            ]}
          />
          <span style={{ flex: 1 }} />
          {datos && (
            <span className="ui-muted ui-consola-cuenta">
              {filas.length} de {datos.count.toLocaleString('es-MX')}
            </span>
          )}
        </div>
        {aviso}
        {estado === 'error' && <EstadoError reintentar={reintentar} />}
        {estado === 'cargando' && !filas.length && <Skeleton variant="card" />}
        {datos && filas.length === 0 && <p className="ui-muted ui-consola-vacio">No hay preguntas con ese filtro.</p>}
        {filas.length > 0 && (
          <>
            <ul className="ui-consola-preguntas">
              {filas.map((p) => (
                <Fila
                  key={p.num}
                  p={p}
                  ensenar={() => setModal({ organizacion: p.organizacion, pregunta: p.pregunta, plantilla: p.via === 'NO_ENTENDIDA' ? '' : p.respuesta })}
                />
              ))}
            </ul>
            {filas.length < datos.count && (
              <div className="ui-consola-mas">
                <Button variant="secondary" icon="chevron-down" disabled={estado === 'cargando'} onClick={() => setPaginas((n) => n + 1)}>
                  Cargar 50 más
                </Button>
              </div>
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
