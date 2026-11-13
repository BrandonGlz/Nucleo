import { useMemo, useState } from 'react'
import { Badge, Button, Card, Chip, EmptyState, Icon, IconButton, Input, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import { filtrar, normalizar, resaltar } from '../../features/agente/sugerenciasEscritura'
import * as nicoApi from '../../services/nico'
import { delEsp } from '../catalogos'
import { Campo } from '../comunes'
import { mensajeError, useAviso } from '../utilidades'

const FUENTES = [
  { campo: 'usar_banco', titulo: 'Banco de respuestas', texto: 'Las respuestas fijas de la empresa.', icono: 'book-open' },
  { campo: 'usar_herramientas', titulo: 'Consultas', texto: 'Los ejemplos de las herramientas activas (las acciones solo a quien puede usarlas).', icono: 'activity' },
  { campo: 'usar_incluidas', titulo: 'Lo que Nico ya sabe', texto: 'Explicaciones de términos y «¿Qué puedes hacer?».', icono: 'lightbulb' },
  { campo: 'usar_frecuentes', titulo: 'Preguntas frecuentes', texto: 'Las más repetidas de la empresa en 60 días, sin las calificadas como no útiles.', icono: 'history' },
]
const TIPOS = [
  { id: 'todas', label: 'Todas' },
  { id: 'fijada', label: 'Destacadas' },
  { id: 'respuesta', label: 'Respuestas' },
  { id: 'consulta', label: 'Consultas' },
  { id: 'frecuente', label: 'Frecuentes' },
]

async function cargar() {
  const arbol = await nicoApi.arbol()
  // El del ESP; sin ESP conectado, el primer dispositivo (para ver las sugerencias de alguna empresa).
  const primero = arbol.empresas.flatMap((e) => e.areas.flatMap((a) => a.dispositivos))[0]
  const dispositivo = delEsp(arbol.empresas).dispositivo ?? primero?.num
  return { ...(await nicoApi.ajusteSugerencias(dispositivo)), dispositivo }
}

// Prueba en vivo: lo mismo que verá quien escriba en el chat del ESP.
function Prueba({ candidatas, ajuste }) {
  const [q, setQ] = useState('')
  const lista = useMemo(() => candidatas.filter((c) => !c.oculta).map((c) => ({ ...c, normal: normalizar(c.texto) })), [candidatas])
  const encontradas = ajuste.activas ? filtrar(lista, q, ajuste.maximo) : []
  return (
    <Card title="Pruébalas" subtitle="Escribe como lo haría un usuario en el chat del ESP.">
      <Input icon="message-square-text" placeholder="Por ejemplo: humedad, niveles, reporte…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!ajuste.activas ? (
        <p className="ui-muted">Las sugerencias están apagadas: el chat no muestra ninguna.</p>
      ) : q.trim().length < 2 ? (
        <p className="ui-muted">Aparecen desde la segunda letra.</p>
      ) : encontradas.length ? (
        <ul className="ui-ia-sugiere ui-consola-sugiere-prueba">
          {encontradas.map((s) => (
            <li key={s.texto}>
              <button type="button" tabIndex={-1}>
                <Icon name={s.tipo === 'consulta' ? 'activity' : s.tipo === 'frecuente' ? 'history' : 'message-square-text'} size={15} />
                <span className="ui-ia-sugiere__texto">
                  {resaltar(s.texto, q).map((p, j) => (p.marca ? <strong key={j}>{p.texto}</strong> : <span key={j}>{p.texto}</span>))}
                </span>
                <span className={`ui-ia-sugiere__tipo is-${s.tipo}`}>{s.etiqueta}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ui-muted">Ninguna sugerencia coincide.</p>
      )}
    </Card>
  )
}

// Sugerencias que aparecen mientras se escribe en el chat de Nico (web y consola).
export default function SugerenciasConsola() {
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [aviso, avisar] = useAviso()
  const [nueva, setNueva] = useState('')
  const [tipo, setTipo] = useState('todas')
  const [q, setQ] = useState('')
  const ajuste = datos?.ajuste
  const candidatas = datos?.candidatas ?? []

  const guardar = async (cambio, mensaje = 'Guardado: el chat ya lo usa.') => {
    try {
      const nuevo = await nicoApi.guardarSugerencias(cambio)
      const r = await nicoApi.ajusteSugerencias(datos.dispositivo)
      actualizar((d) => ({ ...d, ajuste: nuevo, candidatas: r.candidatas }))
      avisar(mensaje)
    } catch (e) {
      avisar(mensajeError(e, 'No se pudo guardar.'), 'danger')
    }
  }
  const alternarOculta = (c) =>
    guardar({ ocultas: c.oculta ? ajuste.ocultas.filter((x) => x !== c.clave) : [...ajuste.ocultas, c.clave] }, c.oculta ? 'Se volverá a sugerir.' : 'Ya no se sugiere.')
  const fijar = () => {
    const t = nueva.trim()
    if (!t) return
    setNueva('')
    guardar({ fijadas: [...ajuste.fijadas, t] }, 'Destacada: sale antes que las demás.')
  }

  const t = normalizar(q)
  const visibles = candidatas.filter((c) => (tipo === 'todas' || c.tipo === tipo) && (!t || normalizar(c.texto).includes(t)))
  const cuenta = (id) => (id === 'todas' ? candidatas.length : candidatas.filter((c) => c.tipo === id).length)
  const cifras = ajuste
    ? {
        principal: { etiqueta: 'Sugerencias', valor: ajuste.activas ? 'Activas' : 'Apagadas', tonoValor: ajuste.activas ? undefined : 'apagado', sub: `hasta ${ajuste.maximo} a la vez` },
        cifras: [
          { etiqueta: 'Disponibles', valor: candidatas.filter((c) => !c.oculta).length, tono: 'verde' },
          { etiqueta: 'Destacadas', valor: ajuste.fijadas.length },
          { etiqueta: 'Ocultas', valor: ajuste.ocultas.length },
        ],
      }
    : { principal: { etiqueta: 'Sugerencias', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla eyebrow="Configuración" titulo="Sugerencias" cifras={cifras}>
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && ajuste && (
        <div className="ui-consola-sugerencias">
          <div className="ui-consola-sugerencias__col">
            <Card title="Al escribir en el chat" subtitle="Aparecen arriba de la caja de texto en la web y en la consola.">
              <div className="ui-consola-ajuste">
                <Toggle label="Mostrar sugerencias" checked={ajuste.activas} onChange={(v) => guardar({ activas: v }, v ? 'Sugerencias activas.' : 'Sugerencias apagadas.')} />
                <Campo
                  label="Cuántas a la vez"
                  icon="list"
                  value={String(ajuste.maximo)}
                  onChange={(v) => guardar({ maximo: Number(v) })}
                  options={[3, 4, 5, 6, 7, 8, 10].map((n) => ({ value: String(n), label: `${n} sugerencias` }))}
                />
              </div>
              <span className="ui-eyebrow">De dónde salen</span>
              <ul className="ui-consola-fuentes">
                {FUENTES.map((f) => (
                  <li key={f.campo}>
                    <Icon name={f.icono} size={18} />
                    <span>
                      <strong>{f.titulo}</strong>
                      <small>{f.texto}</small>
                    </span>
                    <Toggle checked={ajuste[f.campo]} ariaLabel={f.titulo} onChange={(v) => guardar({ [f.campo]: v })} />
                  </li>
                ))}
              </ul>
              {aviso}
            </Card>
            <Card title="Destacadas" subtitle="Salen antes que las demás cuando coinciden con lo escrito.">
              <form
                className="ui-consola-barra"
                onSubmit={(e) => {
                  e.preventDefault()
                  fijar()
                }}
              >
                <Input placeholder="Escribe la pregunta a destacar" value={nueva} onChange={(e) => setNueva(e.target.value)} />
                <Button type="submit" icon="plus" variant="secondary" disabled={!nueva.trim()}>
                  Destacar
                </Button>
              </form>
              {ajuste.fijadas.length ? (
                <ul className="ui-consola-fijadas">
                  {ajuste.fijadas.map((f) => (
                    <li key={f}>
                      <span>{f}</span>
                      <IconButton icon="x" label={`Quitar ${f}`} onClick={() => guardar({ fijadas: ajuste.fijadas.filter((x) => x !== f) }, 'Ya no está destacada.')} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ui-muted">Ninguna. Sin destacadas, el orden es: banco, consultas, lo que Nico sabe y frecuentes.</p>
              )}
            </Card>
            <Prueba candidatas={candidatas} ajuste={ajuste} />
          </div>
          <Card className="nc-grow ui-consola-lista" title="Todas las sugerencias" subtitle="Con las de la empresa del ESP. Apaga las que no quieras que aparezcan; ocultarlas aplica a todas las empresas.">
            <div className="ui-consola-barra">
              <Buscador valor={q} cambiar={setQ} placeholder="Buscar sugerencia…" />
            </div>
            <div className="ui-consola-chips">
              {TIPOS.map((x) => (
                <Chip key={x.id} selected={tipo === x.id} count={cuenta(x.id)} onClick={() => setTipo(x.id)}>
                  {x.label}
                </Chip>
              ))}
            </div>
            {visibles.length ? (
              <ul className="ui-consola-candidatas">
                {visibles.map((c) => (
                  <li key={c.clave} className={c.oculta ? 'is-oculta' : undefined}>
                    <span>{c.texto}</span>
                    <Badge tone={c.tipo === 'fijada' ? 'success' : 'neutral'}>{c.etiqueta}</Badge>
                    <Toggle checked={!c.oculta} ariaLabel={c.oculta ? 'Volver a sugerir' : 'No sugerir'} onChange={() => alternarOculta(c)} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="search" title="Sin sugerencias" message="Nada coincide con el filtro." />
            )}
          </Card>
        </div>
      )}
    </Pantalla>
  )
}
