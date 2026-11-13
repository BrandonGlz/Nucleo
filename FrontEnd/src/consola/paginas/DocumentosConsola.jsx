import { useState } from 'react'
import { Button, Card, Icon, IconButton, Input, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { GenerarRespuestas } from '../GenerarRespuestas'
import { AreaTexto } from '../comunes'
import { fecha, mensajeError, useAviso } from '../utilidades'

// El documento es Markdown con una sección por cada «## Título».
const partir = (contenido) => {
  const partes = (contenido || '').split(/^##[ \t]+(.+?)[ \t]*$/m)
  const secciones = []
  for (let i = 1; i < partes.length - 1; i += 2) secciones.push({ titulo: partes[i].trim(), texto: partes[i + 1].trim() })
  return secciones
}
const unir = (secciones) =>
  secciones
    .map((s) => `## ${s.titulo.trim()}\n${s.texto.trim()}`)
    .join('\n\n')
    .trim()

// NICO.md: el único documento del agente, dividido en secciones. Lo normal es convertir cada
// sección una vez en respuestas del banco (se contestan sin IA); si se activa, el documento
// también va en cada respuesta de la IA (más lento).
export default function DocumentosConsola() {
  const { estado, datos, reintentar, actualizar } = useDatos(nicoApi.documentos, [])
  const [elegida, setElegida] = useState(0)
  const [borrador, setBorrador] = useState(null)
  const [generar, setGenerar] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, avisar] = useAviso()
  const doc = datos?.documentos?.[0]
  const base = Object.fromEntries((datos?.secciones ?? []).map((s) => [s.titulo, s.descripcion]))

  // El borrador empieza con lo guardado (y vuelve a eso al guardar o descartar).
  const desde = (d) => ({ num: d.num, actualizado: d.actualizado, secciones: partir(d.contenido), activo: d.activo })
  if (doc && (borrador?.num !== doc.num || borrador.actualizado !== doc.actualizado)) setBorrador(desde(doc))

  const contenido = borrador ? unir(borrador.secciones) : ''
  const cambiado = doc && borrador && (contenido !== doc.contenido.trim() || borrador.activo !== doc.activo)
  const actual = borrador?.secciones[Math.min(elegida, (borrador?.secciones.length ?? 1) - 1)]
  const indice = borrador ? borrador.secciones.indexOf(actual) : -1
  const usados = borrador?.activo ? contenido.length : 0
  const limite = datos?.limite ?? 2400
  const excede = usados > limite
  const tituloRepetido = actual && borrador.secciones.some((s, i) => i !== indice && s.titulo.trim().toLowerCase() === actual.titulo.trim().toLowerCase())

  const cambiar = (campos) => setBorrador((b) => ({ ...b, secciones: b.secciones.map((s, i) => (i === indice ? { ...s, ...campos } : s)) }))
  const agregar = () => {
    setBorrador((b) => ({ ...b, secciones: [...b.secciones, { titulo: `Sección ${b.secciones.length + 1}`, texto: '' }] }))
    setElegida(borrador.secciones.length)
  }
  const quitar = () => {
    setBorrador((b) => ({ ...b, secciones: b.secciones.filter((_, i) => i !== indice) }))
    setElegida(Math.max(0, indice - 1))
  }
  const guardar = async () => {
    setGuardando(true)
    try {
      const n = await nicoApi.editarDocumento(doc.num, { contenido, activo: borrador.activo })
      actualizar((d) => ({ ...d, documentos: [n], usados: n.activo ? n.contenido.length : 0 }))
      avisar(n.activo ? 'Guardado: la IA lo lee en cada respuesta.' : 'Guardado.')
    } catch (e) {
      avisar(mensajeError(e), 'danger')
    }
    setGuardando(false)
  }

  return (
    <Pantalla eyebrow="Configuración" titulo="Documento del agente">
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && doc && borrador && (
        <div className="ui-consola-docs">
          <Card className="ui-consola-docs__lista">
            <div className="ui-consola-docs__archivo">
              <Icon name="file-code" size={18} />
              <span>
                <strong>{doc.clave}.md</strong>
                <small>{doc.descripcion}</small>
              </span>
            </div>
            <span className="ui-eyebrow">Secciones</span>
            <ul>
              {borrador.secciones.map((s, i) => (
                <li key={i}>
                  <button type="button" className={`ui-consola-doc${i === indice ? ' is-activo' : ''}`} onClick={() => setElegida(i)}>
                    <Icon name="file-text" size={18} />
                    <span>
                      <strong>{s.titulo || 'Sin título'}</strong>
                      <small>{base[s.titulo] ?? (s.texto ? `${s.texto.length} caracteres` : 'Vacía')}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" icon="plus" onClick={agregar}>
              Agregar sección
            </Button>
            <div className={`ui-consola-presupuesto${excede ? ' is-excede' : ''}`}>
              <span>
                En cada respuesta de la IA: {usados.toLocaleString('es-MX')} / {limite.toLocaleString('es-MX')} caracteres
              </span>
              <span className="ui-consola-presupuesto__barra">
                <span style={{ width: `${Math.min(100, (usados / limite) * 100)}%` }} />
              </span>
              <small>
                {excede
                  ? 'Se pasa del límite: lo que sobre no llegará a la IA. Resume alguna sección.'
                  : usados
                    ? 'Leerlo en cada respuesta hace más lenta a la IA (unos 3-4 s). Mejor convierte las secciones en respuestas del banco.'
                    : 'No va en cada respuesta: Nico responde a su velocidad normal. Convierte cada sección en respuestas del banco.'}
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
              <Toggle label="Usar en cada respuesta de la IA" checked={borrador.activo} onChange={(v) => setBorrador({ ...borrador, activo: v })} />
            </div>
            {actual ? (
              <>
                <div className="ui-consola-docs__seccion">
                  <Input
                    label="Título de la sección"
                    icon="pencil"
                    value={actual.titulo}
                    onChange={(e) => cambiar({ titulo: e.target.value.replace(/\n/g, ' ') })}
                    error={!actual.titulo.trim() ? 'Ponle un título.' : tituloRepetido ? 'Ya hay una sección con ese título.' : undefined}
                  />
                  {!(actual.titulo in base) && <IconButton icon="trash-2" label={`Quitar la sección ${actual.titulo}`} onClick={quitar} />}
                </div>
                <AreaTexto
                  label="Contenido"
                  mono
                  filas={14}
                  placeholder="Escribe en frases cortas lo que Nico debe saber o cómo debe comportarse."
                  value={actual.texto}
                  onChange={(e) => cambiar({ texto: e.target.value })}
                  hint={`${actual.texto.trim().length.toLocaleString('es-MX')} caracteres en esta sección · ${contenido.length.toLocaleString('es-MX')} en todo el documento.`}
                />
              </>
            ) : (
              <p className="ui-muted">Sin secciones: agrega una.</p>
            )}
            <div className="ui-consola-docs__acciones">
              <Button
                variant="secondary"
                icon="lightbulb"
                disabled={!actual || cambiado || !actual.texto.trim()}
                title={cambiado ? 'Guarda los cambios primero' : undefined}
                onClick={() => setGenerar(actual.titulo)}
              >
                Convertir sección en respuestas del banco
              </Button>
              <span style={{ flex: 1 }} />
              <Button variant="secondary" disabled={!cambiado || guardando} onClick={() => setBorrador(desde(doc))}>
                Descartar
              </Button>
              <Button icon="save" disabled={!cambiado || guardando || tituloRepetido || borrador.secciones.some((s) => !s.titulo.trim())} onClick={guardar}>
                Guardar
              </Button>
            </div>
          </Card>
        </div>
      )}
      {generar && (
        <GenerarRespuestas
          documento={doc}
          seccion={generar}
          cerrar={() => setGenerar(null)}
          guardadas={(n, repetidas) => {
            setGenerar(null)
            avisar(`${n} ${n === 1 ? 'respuesta agregada' : 'respuestas agregadas'} al banco${repetidas ? ` (${repetidas} ya estaban)` : ''}.`)
          }}
        />
      )}
    </Pantalla>
  )
}
