import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Badge, Button, Chip, Icon, IconButton, Input } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { Modal } from '../../components/Modal'
import { MenuAcciones } from '../../components/MenuAcciones'
import { useSalida } from '../../hooks/useSalida'
import { haceCuanto } from '../../utils/formato'
import { NOMBRE_PERIODO, PERIODOS, VARIABLES } from './datos'

function Opciones({ todos, options, value, onChange }) {
  return (
    <>
      <button
        type="button"
        role="option"
        aria-selected={!value.length}
        className={`ui-analitica__opcion${!value.length ? ' is-elegida' : ''}`}
        onClick={() => onChange([])}
      >
        <span>{todos}</span>
        {!value.length && <Check size={16} />}
      </button>
      {options.map((o) => {
        const elegido = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={elegido}
            className={`ui-analitica__opcion${elegido ? ' is-elegida' : ''}`}
            onClick={() => onChange(value.includes(o.value) ? value.filter((v) => v !== o.value) : [...value, o.value])}
          >
            <span>{o.label}</span>
            {elegido && <Check size={16} />}
          </button>
        )
      })}
    </>
  )
}

function FiltroMultiple({ label, icon, options, value, onChange, todos = 'Todas' }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => !caja.current?.contains(e.target) && setAbierto(false)
    const escape = (e) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])
  return (
    <div className="ui-analitica__multiple" ref={caja}>
      <button
        type="button"
        className={`nc-btn nc-btn--secondary nc-btn--sm ui-analitica__filtro${abierto ? ' is-abierto' : ''}${value.length ? ' is-activo' : ''}`}
        aria-label={`${label}${value.length ? `: ${value.length} seleccionados` : ''}`}
        title={`${label}${value.length ? ` · ${value.length}` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        data-cuenta={value.length}
        onClick={() => setAbierto((v) => !v)}
      >
        <Icon name={icon || 'sliders-horizontal'} size={16} />
        <span className="ui-analitica__filtro-texto">{label}{value.length ? ` · ${value.length}` : ''}</span>
        <Icon className="ui-analitica__filtro-chevron" name="chevron-down" size={14} />
      </button>
      {abierto && (
        <div className="ui-analitica__popover" role="listbox" aria-label={label} aria-multiselectable="true">
          <Opciones todos={todos} options={options} value={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

function RangoPersonalizado({ abierto, filtros, cerrar, aplicar }) {
  const [desde, setDesde] = useState(filtros.desde || '')
  const [hasta, setHasta] = useState(filtros.hasta || '')
  const [error, setError] = useState('')
  const confirmar = () => {
    if (!desde || !hasta) {
      setError('Elige las dos fechas.')
      return
    }
    if (desde > hasta) {
      setError('La fecha inicial debe ser anterior a la final.')
      return
    }
    aplicar({ desde, hasta })
    cerrar()
  }
  return abierto ? (
    <Modal
      titulo="Periodo personalizado"
      sub="Hasta 366 días. La fecha final incluye el día completo."
      cerrar={cerrar}
      cerrarConEscape
      acciones={<Button onClick={confirmar}>Aplicar periodo</Button>}
    >
      <div className="ui-analitica__rango">
        <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      {error && <p className="ui-analitica__error">{error}</p>}
    </Modal>
  ) : null
}

function HojaFiltros({
  abierto,
  saliendo,
  filtros,
  areas,
  dispositivos,
  variablePorDefecto,
  cruzado,
  etiquetaCruzado,
  alCambiarFiltros,
  alQuitarCruzado,
  cerrar,
}) {
  if (!abierto && !saliendo) return null
  const dispos = dispositivos.filter((d) => !filtros.areas.length || filtros.areas.includes(d.area))
  const variableActiva = Boolean(filtros.variable && filtros.variable !== variablePorDefecto)
  return (
    <div className={`ui-analitica__hoja${saliendo ? ' is-saliendo' : ''}`} role="dialog" aria-modal="true" aria-label="Filtros">
      <button type="button" className="ui-analitica__hoja-fondo" aria-label="Cerrar filtros" onClick={cerrar} />
      <div className="ui-analitica__hoja-panel">
        <header className="ui-analitica__hoja-cabeza">
          <strong>Filtros</strong>
          <IconButton icon="x" label="Cerrar filtros" variant="ghost" size="sm" onClick={cerrar} />
        </header>
        <div className="ui-analitica__hoja-cuerpo">
          {cruzado && (
            <Chip className="ui-analitica__chip-cruzado" onClick={alQuitarCruzado} aria-label={`Quitar filtro ${etiquetaCruzado}`}>
              <span>{etiquetaCruzado}</span>
              <Icon name="x" size={14} />
            </Chip>
          )}
          <section className="ui-analitica__hoja-grupo">
            <h4>Áreas</h4>
            <div className="ui-analitica__opciones" role="listbox" aria-label="Áreas" aria-multiselectable="true">
              <Opciones todos="Todas" options={areas.map((a) => ({ value: a.num, label: a.nombre }))} value={filtros.areas} onChange={(valor) => alCambiarFiltros({ areas: valor, dispositivos: [] })} />
            </div>
          </section>
          <section className="ui-analitica__hoja-grupo">
            <h4>Dispositivos</h4>
            <div className="ui-analitica__opciones" role="listbox" aria-label="Dispositivos" aria-multiselectable="true">
              <Opciones todos="Todos" options={dispos.map((d) => ({ value: d.num, label: d.nombre }))} value={filtros.dispositivos} onChange={(valor) => alCambiarFiltros({ dispositivos: valor })} />
            </div>
          </section>
          <section className="ui-analitica__hoja-grupo">
            <h4>Variable</h4>
            <div className="ui-analitica__opciones" role="listbox" aria-label="Variable">
              {VARIABLES.map(([value, label]) => {
                const elegido = (filtros.variable || '') === value
                return (
                  <button
                    key={value || 'todas'}
                    type="button"
                    role="option"
                    aria-selected={elegido || (!variableActiva && value === variablePorDefecto)}
                    className={`ui-analitica__opcion${elegido ? ' is-elegida' : ''}`}
                    onClick={() => alCambiarFiltros({ variable: value })}
                  >
                    <span>{label}</span>
                    {elegido && <Check size={16} />}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
        <div className="ui-analitica__hoja-acciones">
          <Button variant="secondary" onClick={cerrar}>Listo</Button>
        </div>
      </div>
    </div>
  )
}

export function BarraFiltros({
  tablero,
  tableros,
  filtros,
  areas,
  dispositivos,
  cruzado,
  etiquetaCruzado,
  listaAbierta,
  alAlternarLista,
  alCambiarTablero,
  alCambiarFiltros,
  alQuitarCruzado,
  alExportar,
  alRefrescar,
  alVerVersiones,
  generado,
  actualizando,
}) {
  const [rangoAbierto, setRangoAbierto] = useState(false)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const salidaHoja = useSalida(hojaAbierta)
  const [, setLatido] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setLatido((v) => v + 1), 5000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!hojaAbierta) return undefined
    const alEscape = (e) => {
      if (e.key === 'Escape') setHojaAbierta(false)
    }
    document.addEventListener('keydown', alEscape)
    return () => document.removeEventListener('keydown', alEscape)
  }, [hojaAbierta])
  const areasSeleccionadas = filtros.areas.map((num) => areas.find((a) => a.num === num)?.nombre).filter(Boolean)
  const dispositivosFiltrados = dispositivos.filter((d) => !filtros.areas.length || filtros.areas.includes(d.area))
  const variablePorDefecto = tablero?.conf?.filtros?.variable || 'TEMP'
  const variableActiva = Boolean(filtros.variable && filtros.variable !== variablePorDefecto)
  const filtrosActivos = (filtros.areas.length ? 1 : 0) + (filtros.dispositivos.length ? 1 : 0) + (variableActiva ? 1 : 0) + (cruzado ? 1 : 0)
  const nombreDimension = { area: 'Área', dispositivo: 'Dispositivo', variable: 'Variable', nivel: 'Nivel', estado: 'Estado', tipo: 'Tipo' }[cruzado?.dimension] || 'Filtro'
  const textoCruzado = cruzado ? `${nombreDimension}: ${etiquetaCruzado || cruzado.valor}` : ''
  return (
    <>
      <div className={`ui-analitica__barra${cruzado ? ' is-cruzado' : ''}`}>
        <div className="ui-analitica__barra-grupo">
          <IconButton
            className="ui-analitica__toggle-lista"
            icon="panel-left"
            label={listaAbierta ? 'Ocultar tableros' : 'Mostrar tableros'}
            variant="secondary"
            size="sm"
            onClick={alAlternarLista}
          />
          {!listaAbierta && tablero ? (
            <div className="ui-analitica__tablero-bar">
              <Desplegable
                icon="layout-dashboard"
                value={tablero.num}
                onChange={(num) => alCambiarTablero(tableros.find((t) => t.num === Number(num)))}
                options={tableros.map((t) => ({ value: t.num, label: t.nombre }))}
                placeholder="Tablero"
              />
            </div>
          ) : null}
          <div className="ui-analitica__periodo">
            <Desplegable
              icon="calendar"
              value={filtros.periodo || '30d'}
              onChange={(valor) => {
                if (valor === 'personalizado') setRangoAbierto(true)
                else alCambiarFiltros({ periodo: valor, desde: '', hasta: '' })
              }}
              options={PERIODOS.map(([value, label]) => ({ value, label }))}
              placeholder={NOMBRE_PERIODO[filtros.periodo] || 'Periodo'}
            />
          </div>
          <FiltroMultiple
            label="Áreas"
            icon="map-pin"
            options={areas.map((a) => ({ value: a.num, label: a.nombre }))}
            value={filtros.areas}
            onChange={(valor) => alCambiarFiltros({ areas: valor, dispositivos: [] })}
          />
          <FiltroMultiple
            label="Dispositivos"
            icon="cpu"
            todos="Todos"
            options={dispositivosFiltrados.map((d) => ({ value: d.num, label: d.nombre }))}
            value={filtros.dispositivos}
            onChange={(valor) => alCambiarFiltros({ dispositivos: valor })}
          />
          <div className="ui-analitica__variable">
            <Desplegable
              icon="activity"
              value={filtros.variable || ''}
              onChange={(valor) => alCambiarFiltros({ variable: valor })}
              options={VARIABLES.map(([value, label]) => ({ value, label }))}
              placeholder="Variable"
            />
          </div>
          {areasSeleccionadas.length > 0 && (
            <Badge tone="neutral" className="ui-analitica__resumen-filtros">Áreas: {areasSeleccionadas.length}</Badge>
          )}
          {cruzado && (
            <Chip className="ui-analitica__chip-cruzado" onClick={alQuitarCruzado} aria-label={`Quitar filtro ${textoCruzado}`}>
              <span>{textoCruzado}</span>
              <Icon name="x" size={14} />
            </Chip>
          )}
          <button
            type="button"
            className="nc-btn nc-btn--secondary nc-btn--sm ui-analitica__filtros-movil"
            aria-label={`Filtros${filtrosActivos ? `: ${filtrosActivos} activos` : ''}`}
            onClick={() => setHojaAbierta(true)}
          >
            <Icon name="sliders-horizontal" size={16} />
            <span>Filtros</span>
            {filtrosActivos ? <span className="ui-analitica__filtros-cuenta">{filtrosActivos}</span> : null}
          </button>
          <div className="ui-analitica__menu-movil">
            <MenuAcciones
              label="Más acciones de Analítica"
              icon="ellipsis"
              items={[
                { label: 'Versiones', icon: 'history', onClick: alVerVersiones },
                { label: 'Actualizar', icon: 'history', onClick: alRefrescar },
                { label: 'Imagen de esta página (PNG)', icon: 'download', onClick: () => alExportar('png') },
                { label: 'PDF de todas las páginas', icon: 'file-text', onClick: () => alExportar('pdf') },
              ]}
            />
          </div>
        </div>
        <div className="ui-analitica__barra-grupo ui-analitica__barra-acciones">
          <span className="ui-analitica__actualizado">{actualizando ? 'Actualizando…' : generado ? `Actualizado ${haceCuanto(generado).toLowerCase()}` : 'Cargando…'}</span>
          <IconButton icon="history" label="Actualizar" variant="secondary" size="sm" onClick={alRefrescar} />
          <MenuAcciones
            texto="Exportar"
            icon="download"
            label="Exportar Analítica"
            items={[
              { label: 'Imagen de esta página (PNG)', icon: 'download', onClick: () => alExportar('png') },
              { label: 'PDF de todas las páginas', icon: 'file-text', onClick: () => alExportar('pdf') },
            ]}
          />
        </div>
      </div>
      <RangoPersonalizado
        key={`${rangoAbierto}-${filtros.desde}-${filtros.hasta}`}
        abierto={rangoAbierto}
        filtros={filtros}
        cerrar={() => setRangoAbierto(false)}
        aplicar={(rango) => alCambiarFiltros({ periodo: 'personalizado', ...rango })}
      />
      <HojaFiltros
        abierto={hojaAbierta}
        saliendo={salidaHoja.saliendo}
        filtros={filtros}
        areas={areas}
        dispositivos={dispositivos}
        variablePorDefecto={variablePorDefecto}
        cruzado={cruzado}
        etiquetaCruzado={textoCruzado}
        alCambiarFiltros={alCambiarFiltros}
        alQuitarCruzado={alQuitarCruzado}
        cerrar={() => setHojaAbierta(false)}
      />
    </>
  )
}
