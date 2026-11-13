import { useMemo, useState } from 'react'
import { Badge, Button, Card, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { pagina } from '../../utils/convertir'
import { EditarRespuesta } from '../EditarRespuesta'
import { TIPOS } from '../catalogos'
import { fecha, mensajeError, useAviso } from '../utilidades'

const cargar = async () => {
  const [banco, arbol] = await Promise.all([nicoApi.banco(), nicoApi.arbol()])
  return { respuestas: pagina(banco), empresas: arbol.empresas }
}

// Banco de preguntas y respuestas: lo que Nico responde sin redactar (fijas, rutas y aprendidas).
export default function BancoConsola() {
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [q, setQ] = useState('')
  const [empresa, setEmpresa] = useState('todas')
  const [tipo, setTipo] = useState('todos')
  const [modal, setModal] = useState(null)
  const [aviso, avisar] = useAviso()
  const empresas = datos?.empresas ?? []
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (datos?.respuestas ?? []).filter(
      (r) =>
        (empresa === 'todas' || r.organizacion === empresa) &&
        (tipo === 'todos' || r.tema === tipo || (tipo === 'aprendidas' && !['FIJA', 'RUTA'].includes(r.tema))) &&
        (!t || r.pregunta.toLowerCase().includes(t) || r.plantilla.toLowerCase().includes(t)),
    )
  }, [datos, q, empresa, tipo])

  const cambiar = (n) => actualizar((d) => ({ ...d, respuestas: d.respuestas.some((x) => x.num === n.num) ? d.respuestas.map((x) => (x.num === n.num ? { ...x, ...n } : x)) : [n, ...d.respuestas] }))
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
  const total = datos?.respuestas ?? []
  const cifras = datos
    ? {
        principal: { etiqueta: 'Respuestas en el banco', valor: total.filter((r) => r.activa).length, unidad: 'activas', sub: `${total.length} en total` },
        cifras: [
          { etiqueta: 'Fijas', valor: total.filter((r) => r.tema === 'FIJA').length, tono: 'verde' },
          { etiqueta: 'Rutas', valor: total.filter((r) => r.tema === 'RUTA').length },
          { etiqueta: 'Aprendidas', valor: total.filter((r) => !['FIJA', 'RUTA'].includes(r.tema)).length },
        ],
      }
    : { principal: { etiqueta: 'Respuestas en el banco', valor: '—', tonoValor: 'apagado' } }

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
      {estado === 'listo' && (
        <Card className="nc-grow ui-consola-lista">
          <div className="ui-consola-barra">
            <Buscador valor={q} cambiar={setQ} placeholder="Buscar pregunta o respuesta…" />
            <Desplegable icon="building-2" value={empresa} onChange={setEmpresa} options={[{ value: 'todas', label: 'Todas las empresas' }, ...empresas.map((e) => ({ value: e.num, label: e.nombre }))]} />
            <Desplegable
              icon="list"
              value={tipo}
              onChange={setTipo}
              options={[
                { value: 'todos', label: 'Todos los tipos' },
                { value: 'FIJA', label: 'Respuestas fijas' },
                { value: 'RUTA', label: 'Rutas' },
                { value: 'aprendidas', label: 'Aprendidas de 👍' },
              ]}
            />
            {aviso}
          </div>
          {lista.length === 0 ? (
            <p className="ui-muted ui-consola-vacio">
              {total.length ? 'Nada coincide con el filtro.' : 'El banco está vacío. Agrega una respuesta o enséñala desde el registro de preguntas.'}
            </p>
          ) : (
            <ul className="ui-consola-filas">
              {lista.map((r) => {
                const t = TIPOS[r.tema] ?? { label: r.tema || 'Otra', tone: 'neutral' }
                return (
                  <li key={r.num} className={`ui-consola-fila${r.activa ? '' : ' is-apagada'}`}>
                    <div className="ui-consola-fila__texto">
                      <strong>{r.pregunta}</strong>
                      <p>{r.tema === 'RUTA' ? `→ ${r.plantilla}` : r.plantilla}</p>
                      <span className="ui-consola-meta">
                        <Badge tone={t.tone}>{t.label}</Badge>
                        <span>{r.organizacion_nombre}</span>
                        <span>· {r.usos} usos</span>
                        {!['FIJA', 'RUTA'].includes(r.tema) && <span>· 👍 {r.votos_si} · 👎 {r.votos_no}</span>}
                        <span>· {fecha(r.fecha_creacion)}</span>
                      </span>
                    </div>
                    <Toggle checked={r.activa} ariaLabel={r.activa ? 'Desactivar' : 'Activar'} onChange={() => alternar(r)} />
                    <MenuAcciones
                      items={[
                        { label: 'Editar', icon: 'pencil', onClick: () => setModal({ r }) },
                        { label: 'Borrar', icon: 'trash-2', peligro: true, onClick: () => borrar(r) },
                      ]}
                    />
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
          empresas={empresas}
          cerrar={() => setModal(null)}
          guardada={(n, nueva) => {
            setModal(null)
            if (nueva) reintentar()
            else cambiar(n)
            avisar(nueva ? 'Agregada al banco.' : 'Respuesta guardada.')
          }}
        />
      )}
    </Pantalla>
  )
}
