import { useState } from 'react'
import { Button, Icon, IconButton, Input, Tabs, Toggle } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { useSalida } from '../../hooks/useSalida'
import { FAMILIAS, ICONOS_TIPO, LIMITES, TIPOS, metaSugerida } from './catalogo'
import { Lienzo } from './Lienzo'
import { PaginasEditor } from './PaginasEditor'

function TipoBoton({ tipo, alAgregar }) {
  const definicion = TIPOS[tipo]
  return (
    <button type="button" className="ui-editor__tipo" onClick={() => alAgregar(tipo)}>
      <span className="ui-editor__tipo-icono"><Icon name={ICONOS_TIPO[tipo] || 'layout-grid'} size={18} /></span>
      <span className="ui-editor__tipo-texto">
        <strong>{definicion.nombre}</strong>
        <small>{definicion.descripcion}</small>
      </span>
      <Icon name="plus" size={16} />
    </button>
  )
}

function PanelAgregar({ alAgregar, aviso }) {
  return (
    <div className="ui-editor__agregar">
      {aviso && <p className="ui-analitica__error" role="alert">{aviso}</p>}
      {FAMILIAS.map((familia) => {
        const tipos = Object.entries(TIPOS).filter(([, definicion]) => definicion.familia === familia.id)
        if (!tipos.length) return null
        return (
          <section key={familia.id} className="ui-editor__familia">
            <h4>{familia.nombre}</h4>
            {tipos.map(([tipo]) => <TipoBoton key={tipo} tipo={tipo} alAgregar={alAgregar} />)}
          </section>
        )
      })}
    </div>
  )
}

function FormularioTarjeta({ tarjeta, alCambiar, alQuitar, alRedimensionar, alValidar }) {
  const definicion = TIPOS[tarjeta.tipo]
  const opciones = tarjeta.opciones || {}
  const [error, setError] = useState('')
  const [metaError, setMetaError] = useState('')

  const cambiar = (cambios) => alCambiar(tarjeta.id, cambios)
  const cambiarOpcion = (clave, valor) => {
    const nuevas = { ...opciones, [clave]: valor }
    if (tarjeta.meta && (clave === 'indicador' || clave === 'metrica')) {
      const anterior = metaSugerida(tarjeta.tipo, opciones)
      const sugerida = metaSugerida(tarjeta.tipo, nuevas)
      if (sugerida && (!anterior || tarjeta.meta.valor === anterior.valor)) {
        cambiar({ opciones: { [clave]: valor }, meta: sugerida })
        return
      }
    }
    cambiar({ opciones: { [clave]: valor } })
  }
  const cambiarMeta = (cambios) => cambiar({ meta: { ...(tarjeta.meta || {}), ...cambios } })
  const cambiarTamano = (clave, valor) => {
    const n = Number(valor)
    if (!Number.isInteger(n)) return
    const w = clave === 'w' ? n : tarjeta.w
    const h = clave === 'h' ? n : tarjeta.h
    if (w < definicion.minimo[0] || h < definicion.minimo[1]) return
    if (w > LIMITES.columnas || h > LIMITES.filas) return
    if (alValidar?.(tarjeta.id, tarjeta.x, tarjeta.y, w, h) === false) return
    alRedimensionar(tarjeta.id, w, h)
  }

  return (
    <div className="ui-editor__form" key={tarjeta.id}>
      <Input
        label="Título"
        value={tarjeta.titulo}
        maxLength={LIMITES.titulo}
        onChange={(e) => cambiar({ titulo: e.target.value })}
        error={error}
      />
      <div className="ui-editor__tamano">
        <Input label="Ancho" type="number" min={definicion.minimo[0]} max={LIMITES.columnas} value={tarjeta.w} onChange={(e) => cambiarTamano('w', e.target.value)} />
        <Input label="Alto" type="number" min={definicion.minimo[1]} max={LIMITES.filas} value={tarjeta.h} onChange={(e) => cambiarTamano('h', e.target.value)} />
      </div>
      {definicion.opciones.map((opcion) => {
        if (opcion.tipo === 'booleano') {
          return (
            <Toggle
              key={opcion.clave}
              label={opcion.etiqueta}
              checked={Boolean(opciones[opcion.clave])}
              onChange={(valor) => cambiarOpcion(opcion.clave, valor)}
            />
          )
        }
        if (opcion.tipo === 'uno') {
          return (
            <Desplegable
              key={opcion.clave}
              label={opcion.etiqueta}
              value={opciones[opcion.clave]}
              onChange={(valor) => cambiarOpcion(opcion.clave, valor)}
              options={opcion.valores.map(([valor, etiqueta]) => ({ value: valor, label: etiqueta }))}
            />
          )
        }
        if (opcion.tipo === 'numero') {
          return (
            <Input
              key={opcion.clave}
              label={opcion.etiqueta}
              type="number"
              min={opcion.minimo}
              max={opcion.maximo}
              value={opciones[opcion.clave]}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= opcion.minimo && n <= opcion.maximo) {
                  setError('')
                  cambiarOpcion(opcion.clave, n)
                }
              }}
            />
          )
        }
        return (
          <Input
            key={opcion.clave}
            label={opcion.etiqueta}
            value={opciones[opcion.clave] || ''}
            maxLength={opcion.max}
            onChange={(e) => cambiarOpcion(opcion.clave, e.target.value)}
          />
        )
      })}
      {definicion.meta && (
        <div className="ui-editor__meta">
          <Toggle
            label="Mostrar meta"
            checked={Boolean(tarjeta.meta)}
            onChange={(valor) => {
              if (valor) {
                const sugerida = metaSugerida(tarjeta.tipo, opciones) || { valor: 0, sentido: 'mayor', tolerancia: 5 }
                cambiar({ meta: sugerida })
              } else {
                cambiar({ meta: null })
              }
            }}
          />
          {tarjeta.meta && (
            <>
              <Input
                label="Valor de la meta"
                type="number"
                value={tarjeta.meta.valor}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n)) {
                    setMetaError('')
                    cambiarMeta({ valor: n })
                  }
                }}
                error={metaError}
              />
              <div className="ui-editor__tamano">
                <Desplegable
                  label="Sentido"
                  value={tarjeta.meta.sentido}
                  onChange={(valor) => cambiarMeta({ sentido: valor })}
                  options={[{ value: 'mayor', label: 'Mayor es mejor' }, { value: 'menor', label: 'Menor es mejor' }]}
                />
                <Input
                  label="Tolerancia %"
                  type="number"
                  min={0}
                  max={50}
                  value={tarjeta.meta.tolerancia ?? 5}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isInteger(n) && n >= 0 && n <= 50) {
                      setMetaError('')
                      cambiarMeta({ tolerancia: n })
                    } else {
                      setMetaError('La tolerancia debe estar entre 0 y 50 %.')
                    }
                  }}
                  error={metaError}
                />
              </div>
            </>
          )}
        </div>
      )}
      <div className="ui-editor__pie">
        <span className="ui-muted">Tamaño mínimo: {definicion.minimo[0]} × {definicion.minimo[1]}</span>
        <Button variant="secondary" size="sm" icon="trash-2" onClick={() => alQuitar(tarjeta.id)}>Quitar tarjeta</Button>
      </div>
    </div>
  )
}

export function EditorTablero({
  pagina,
  datosPagina,
  cargando,
  paginas,
  paginaId,
  alCambiarPagina,
  seleccion,
  alSeleccionar,
  alMoverTarjeta,
  alRedimensionarTarjeta,
  alQuitarTarjeta,
  alValidarTarjeta,
  alCambiarTarjeta,
  alAgregarTarjeta,
  alAgregarPagina,
  alRenombrarPagina,
  alMoverPagina,
  alEliminarPagina,
  alConfigurar,
}) {
  const [pestana, setPestana] = useState('agregar')
  const [aviso, setAviso] = useState('')
  const [panelAbierto, setPanelAbierto] = useState(() => window.innerWidth > 1280)
  const salidaPanel = useSalida(panelAbierto)
  const seleccionada = (pagina?.tarjetas || []).find((t) => t.id === seleccion) || null
  const tabActiva = !seleccionada && pestana === 'tarjeta' ? 'agregar' : pestana

  const elegir = (id) => {
    alSeleccionar(id)
    setPestana('tarjeta')
    setPanelAbierto(true)
  }

  const agregar = (tipo) => {
    const resultado = alAgregarTarjeta(tipo)
    if (resultado?.error) {
      setAviso(resultado.error)
      return
    }
    if (resultado?.id) {
      alSeleccionar(resultado.id)
      setAviso('')
      setPestana('tarjeta')
      setPanelAbierto(true)
    }
  }

  return (
    <div className={`ui-editor${panelAbierto ? ' is-panel-abierto' : ''}`}>
      <div className="ui-editor__principal">
        <Lienzo
          pagina={pagina}
          datosPagina={datosPagina}
          cargando={cargando}
          editor
          seleccion={seleccion}
          alSeleccionarTarjeta={elegir}
          alMoverTarjeta={alMoverTarjeta}
          alRedimensionarTarjeta={alRedimensionarTarjeta}
          alQuitarTarjeta={alQuitarTarjeta}
          alValidarTarjeta={alValidarTarjeta}
        />
        <PaginasEditor
          paginas={paginas}
          actual={paginaId}
          alCambiar={alCambiarPagina}
          alAgregar={alAgregarPagina}
          alRenombrar={alRenombrarPagina}
          alMover={alMoverPagina}
          alEliminar={alEliminarPagina}
          alAlternarPanel={() => setPanelAbierto((v) => !v)}
          panelAbierto={panelAbierto}
        />
      </div>
      {salidaPanel.montado && (
        <aside className={`ui-editor__panel${salidaPanel.saliendo ? ' is-saliendo' : ''}`} aria-label="Propiedades del tablero">
          <div className="ui-editor__panel-cabeza">
            <Tabs
              items={[
                { id: 'agregar', label: 'Agregar' },
                { id: 'tarjeta', label: 'Tarjeta', disabled: !seleccionada },
              ]}
              value={tabActiva}
              onChange={setPestana}
              aria-label="Editor de tarjetas"
            />
            <IconButton className="ui-editor__panel-cerrar" icon="x" label="Cerrar propiedades" variant="ghost" size="sm" onClick={() => setPanelAbierto(false)} />
          </div>
          {pestana === 'agregar' || !seleccionada ? (
            <PanelAgregar alAgregar={agregar} aviso={aviso} />
          ) : (
            <FormularioTarjeta
              tarjeta={seleccionada}
              alCambiar={alCambiarTarjeta}
              alQuitar={alQuitarTarjeta}
              alRedimensionar={alRedimensionarTarjeta}
              alValidar={alValidarTarjeta}
            />
          )}
          <div className="ui-editor__configurar">
            <Button variant="secondary" size="sm" icon="settings" onClick={alConfigurar}>Configurar tablero</Button>
          </div>
        </aside>
      )}
    </div>
  )
}
