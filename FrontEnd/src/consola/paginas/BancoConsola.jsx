import { useMemo, useState } from 'react'
import { Badge, Button, Card, Chip, EmptyState, Icon, IconCircle, Skeleton, Tabs, Toggle } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { pagina } from '../../utils/convertir'
import { EditarRespuesta } from '../EditarRespuesta'
import { INCLUIDAS, NOMBRES, NOMBRES_CHARLA, TIPOS } from '../catalogos'
import { fecha, mensajeError, useAviso } from '../utilidades'

const PROPIAS = ['FIJA', 'RUTA']
const ICONO_TIPO = { FIJA: 'book-open', RUTA: 'arrow-up-right' }

const cargar = async () => {
  const [banco, arbol, incluidas] = await Promise.all([nicoApi.banco(), nicoApi.arbol(), nicoApi.incluidas()])
  return { respuestas: pagina(banco), empresas: arbol.empresas, incluidas }
}

const coincide = (t, ...textos) => !t || textos.some((x) => x?.toLowerCase().includes(t))
const nombreTema = (x) =>
  x.tipo === 'charla' ? (NOMBRES_CHARLA[x.tema] ?? x.tema) : x.tipo === 'consulta' ? (NOMBRES[x.tema] ?? x.tema) : x.tema.replace('_', ' ')

// Lo que Nico ya trae en código. «Personalizar» crea una respuesta fija que la reemplaza.
function Incluidas({ lista, q, personalizar }) {
  const [tipo, setTipo] = useState('todas')
  const t = q.trim().toLowerCase()
  const visibles = lista.filter((x) => (tipo === 'todas' || x.tipo === tipo) && coincide(t, x.pregunta, x.respuesta, ...x.otras))
  return (
    <>
      <div className="ui-consola-chips">
        <Chip selected={tipo === 'todas'} count={lista.length} onClick={() => setTipo('todas')}>
          Todas
        </Chip>
        {Object.entries(INCLUIDAS).map(([k, v]) => (
          <Chip key={k} icon={v.icono} selected={tipo === k} count={lista.filter((x) => x.tipo === k).length} onClick={() => setTipo(k)}>
            {v.label}
          </Chip>
        ))}
      </div>
      {tipo !== 'todas' && <p className="ui-muted ui-consola-ayuda">{INCLUIDAS[tipo].ayuda}</p>}
      {visibles.length === 0 ? (
        <p className="ui-muted ui-consola-vacio">Nada coincide con la búsqueda.</p>
      ) : (
        <ul className="ui-consola-tarjetas">
          {visibles.map((x) => (
            <li key={x.id} className="ui-consola-respuesta">
              <div className="ui-consola-respuesta__cabeza">
                <IconCircle name={INCLUIDAS[x.tipo].icono} tone="neutral" size="sm" />
                <div className="ui-titulo-fila">
                  <span className="ui-consola-respuesta__tipo">
                    {INCLUIDAS[x.tipo].label} · {nombreTema(x)}
                  </span>
                  <strong>{x.pregunta}</strong>
                </div>
                <span style={{ flex: 1 }} />
                {x.personalizada && <Badge tone="success">Personalizada</Badge>}
                <Button variant="secondary" size="sm" icon="pencil" onClick={() => personalizar(x)}>
                  Personalizar
                </Button>
              </div>
              <p className="ui-consola-respuesta__texto">{x.respuesta}</p>
              {x.otras.length > 0 && (
                <span className="ui-consola-meta">
                  También con: {x.otras.slice(0, 5).map((o) => `«${o}»`).join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Banco de preguntas y respuestas: lo que Nico ya sabe y lo que se le enseña desde aquí.
export default function BancoConsola() {
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [vista, setVista] = useState('incluidas')
  const [q, setQ] = useState('')
  const [empresa, setEmpresa] = useState('todas')
  const [tipo, setTipo] = useState('todos')
  const [modal, setModal] = useState(null)
  const [aviso, avisar] = useAviso()
  const empresas = datos?.empresas ?? []
  const total = useMemo(() => datos?.respuestas ?? [], [datos])
  const incluidas = datos?.incluidas ?? []
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return total.filter(
      (r) =>
        (empresa === 'todas' || r.organizacion === empresa) &&
        (tipo === 'todos' || r.tema === tipo || (tipo === 'aprendidas' && !PROPIAS.includes(r.tema))) &&
        coincide(t, r.pregunta, r.plantilla),
    )
  }, [total, q, empresa, tipo])

  const cambiar = (n) =>
    actualizar((d) => ({
      ...d,
      respuestas: d.respuestas.some((x) => x.num === n.num) ? d.respuestas.map((x) => (x.num === n.num ? { ...x, ...n } : x)) : [n, ...d.respuestas],
    }))
  const alternar = async (r) => {
    try {
      cambiar(await nicoApi.editarRespuesta(r.num, { activa: !r.activa }))
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo cambiar.'), 'danger')
    }
  }
  const borrar = async (r) => {
    try {
      await nicoApi.borrarRespuesta(r.num)
      actualizar((d) => ({ ...d, respuestas: d.respuestas.filter((x) => x.num !== r.num) }))
      avisar('Respuesta borrada del banco.')
    } catch {
      avisar('No se pudo borrar.', 'danger')
    }
  }
  const cifras = datos
    ? {
        principal: { etiqueta: 'Respuestas que Nico ya sabe', valor: incluidas.length, unidad: 'incluidas', sub: `${total.filter((r) => r.activa).length} personalizadas activas` },
        cifras: [
          { etiqueta: 'Fijas', valor: total.filter((r) => r.tema === 'FIJA').length, tono: 'verde' },
          { etiqueta: 'Rutas', valor: total.filter((r) => r.tema === 'RUTA').length },
          { etiqueta: 'Aprendidas', valor: total.filter((r) => !PROPIAS.includes(r.tema)).length },
        ],
      }
    : { principal: { etiqueta: 'Respuestas que Nico ya sabe', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow="Conocimiento"
      titulo="Banco de respuestas"
      cifras={cifras}
      acciones={
        <Button icon="plus" disabled={!datos} onClick={() => setModal({})}>
          Nueva respuesta
        </Button>
      }
    >
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {datos && (
        <Card className="nc-grow ui-consola-lista">
          <div className="ui-consola-barra">
            <Tabs
              items={[
                { id: 'incluidas', label: `Incluidas en Nico (${incluidas.length})` },
                { id: 'propias', label: `Personalizadas (${total.length})` },
              ]}
              value={vista}
              onChange={setVista}
            />
            <span style={{ flex: 1 }} />
            <Buscador valor={q} cambiar={setQ} placeholder="Buscar pregunta o respuesta…" />
            {vista === 'propias' && (
              <>
                <Desplegable icon="building-2" value={empresa} onChange={setEmpresa} options={[{ value: 'todas', label: 'Todas las empresas' }, ...empresas.map((e) => ({ value: e.num, label: e.nombre }))]} />
                <Desplegable
                  icon="list"
                  value={tipo}
                  onChange={setTipo}
                  options={[
                    { value: 'todos', label: 'Todos los tipos' },
                    { value: 'FIJA', label: 'Respuestas fijas' },
                    { value: 'RUTA', label: 'Rutas' },
                    { value: 'aprendidas', label: 'Aprendidas' },
                  ]}
                />
              </>
            )}
          </div>
          {aviso}
          {vista === 'incluidas' ? (
            <Incluidas lista={incluidas} q={q} personalizar={(x) => setModal({ inicial: { organizacion: 'todas', pregunta: x.pregunta, plantilla: x.respuesta } })} />
          ) : total.length === 0 ? (
            <EmptyState
              icon="book-open"
              title="Aún no hay respuestas personalizadas"
              message="Personaliza una de las incluidas, crea una nueva o enséñala desde el registro de preguntas."
              action={
                <Button icon="plus" onClick={() => setModal({})}>
                  Nueva respuesta
                </Button>
              }
            />
          ) : lista.length === 0 ? (
            <p className="ui-muted ui-consola-vacio">Nada coincide con el filtro.</p>
          ) : (
            <ul className="ui-consola-tarjetas">
              {lista.map((r) => {
                const t = TIPOS[r.tema] ?? { label: r.tema || 'Otra', tone: 'neutral' }
                return (
                  <li key={r.num} className={`ui-consola-respuesta${r.activa ? '' : ' is-apagada'}`}>
                    <div className="ui-consola-respuesta__cabeza">
                      <IconCircle name={ICONO_TIPO[r.tema] ?? 'sparkles'} tone={r.tema === 'FIJA' ? 'accent' : 'neutral'} size="sm" />
                      <div className="ui-titulo-fila">
                        <span className="ui-consola-respuesta__tipo">
                          {t.label} · {r.organizacion_nombre}
                        </span>
                        <strong>{r.pregunta}</strong>
                      </div>
                      {r.reemplaza && (
                        <Badge tone="warning" title={`Nico ya traía una respuesta para «${r.reemplaza}»; esta la reemplaza mientras esté activa.`}>
                          Reemplaza una incluida
                        </Badge>
                      )}
                      <span style={{ flex: 1 }} />
                      <Toggle checked={r.activa} ariaLabel={r.activa ? 'Desactivar' : 'Activar'} onChange={() => alternar(r)} />
                      <MenuAcciones
                        items={[
                          { label: 'Editar', icon: 'pencil', onClick: () => setModal({ r }) },
                          { label: 'Borrar', icon: 'trash-2', peligro: true, onClick: () => borrar(r) },
                        ]}
                      />
                    </div>
                    <p className="ui-consola-respuesta__texto">
                      {r.tema === 'RUTA' && <Icon name="arrow-up-right" size={14} />}
                      {r.plantilla}
                    </p>
                    <span className="ui-consola-meta">
                      <span>{r.usos === 1 ? '1 uso' : `${r.usos} usos`}</span>
                      {!PROPIAS.includes(r.tema) && (
                        <span>
                          · {r.votos_si} útiles · {r.votos_no} no útiles
                        </span>
                      )}
                      <span>· {fecha(r.fecha_creacion)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}
      {modal && (
        <EditarRespuesta
          r={modal.r}
          inicial={modal.inicial}
          empresas={empresas}
          cerrar={() => setModal(null)}
          guardada={(n, nueva) => {
            setModal(null)
            if (nueva) {
              reintentar()
              setVista('propias')
            } else cambiar(n)
            avisar(nueva ? 'Agregada al banco: Nico ya responde así.' : 'Respuesta guardada.')
          }}
        />
      )}
    </Pantalla>
  )
}
