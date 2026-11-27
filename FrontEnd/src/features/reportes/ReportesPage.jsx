import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import {
  Badge, Button, Card, Skeleton, Tabs,
} from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { aviso, confirmar } from '../../components/confirmacion'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import { useSesion } from '../../context/SesionContext'
import { useEsMovil } from '../../hooks/useMenuMovil'
import { useDatos } from '../../hooks/useDatos'
import { AsistenteReporte } from './AsistenteReporte'
import { DashboardReporte, ListaTarjetas } from './DashboardReporte'
import { EsperaReporte } from './EsperaReporte'
import { MigracionFormatos } from './MigracionFormatos'
import { Programaciones } from './Programaciones'
import { etiquetaFormato, useEdicion } from './personalizacion'
import { ProveedorZoom } from './VisorHoja'
import { Pantalla } from '../../components/Pantalla'
import * as formatosApi from '../../services/formatos'
import * as organizacionesApi from '../../services/organizaciones'
import * as reportesApi from '../../services/reportes'
import { pagina } from '../../utils/convertir'
import { fechaLarga, hora, periodo } from '../../utils/formato'

async function cargar(filtros = {}) {
  const params = {
    q: filtros.q || undefined,
    area: filtros.area || undefined,
    formato: filtros.formato || undefined,
    origen: filtros.origen || undefined,
    archivados: filtros.archivados ? 1 : undefined,
    ...rangoDeFiltro(filtros),
  }
  const [r, p, a] = await Promise.all([
    reportesApi.lista(params),
    reportesApi.programaciones(),
    organizacionesApi.areas(),
  ])
  return { reportes: pagina(r), programaciones: pagina(p), areas: pagina(a) }
}

const ESTADO_REPORTE = {
  GENERANDO: { tone: 'warning', label: 'Generando…', icon: 'clock' },
  LISTO: { tone: 'success', label: 'Listo', icon: 'circle-check' },
  ENVIADO: { tone: 'success', label: 'Enviado por correo', icon: 'circle-check' },
  FALLO: { tone: 'danger', label: 'Falló', icon: 'triangle-alert' },
}
const estadoDe = (r) => ESTADO_REPORTE[r.estado] ?? ESTADO_REPORTE.LISTO
const ORIGEN_ENVIO = { MANUAL: 'Manual', PROGRAMADO: 'Programado', NICO: 'Nico AI' }
const tituloDe = (r) =>
  r?.titulo || r?.cifras?.titulo || `Reporte R-${String(r?.num ?? 0).padStart(4, '0')}`
const PESTANAS = [
  { id: 'reportes', label: 'Reportes' },
  { id: 'programados', label: 'Programados' },
]
const FILTROS_VACIOS = { q: '', area: '', formato: '', origen: '', archivados: false, periodo: '', desde: '', hasta: '' }
const ETIQUETA_PERIODO = {
  mes: 'Este mes',
  anterior: 'Mes anterior',
  trimestre: 'Últimos 3 meses',
  rango: 'Rango',
}
// Rango de fechas del filtro; `hasta` va un día después para que el día elegido entre completo.
function rangoDeFiltro(filtros) {
  const hoy = new Date()
  const inicioMes = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), 1)
  const sumarDias = (fecha, dias) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias)
  if (filtros.periodo === 'mes') return { desde: inicioMes(hoy).toISOString(), hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString() }
  if (filtros.periodo === 'anterior') return { desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString(), hasta: inicioMes(hoy).toISOString() }
  if (filtros.periodo === 'trimestre') return { desde: new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1).toISOString(), hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString() }
  if (filtros.periodo === 'rango') {
    const desde = filtros.desde ? new Date(`${filtros.desde}T00:00:00`) : null
    const hasta = filtros.hasta ? sumarDias(new Date(`${filtros.hasta}T00:00:00`), 1) : null
    return { ...(desde && { desde: desde.toISOString() }), ...(hasta && { hasta: hasta.toISOString() }) }
  }
  return {}
}

function Filtros({ filtros, setFiltros, areas, formatos, cerrar, saliendo }) {
  const cambiar = (clave, valor) => setFiltros((f) => ({ ...f, [clave]: valor }))
  return (
    <div className={`ui-reportes__panel-filtros${saliendo ? ' is-saliendo' : ''}`} role="dialog" aria-label="Filtros de reportes">
      <Desplegable
        label="Área"
        icon="map-pin"
        value={filtros.area}
        onChange={(v) => cambiar('area', v)}
        options={[
          { value: '', label: 'Todas las áreas' },
          ...areas.map((a) => ({ value: String(a.num), label: a.nombre })),
        ]}
      />
      <Desplegable
        label="Formato"
        icon="file-text"
        value={filtros.formato}
        onChange={(v) => cambiar('formato', v)}
        options={[
          { value: '', label: 'Todos los formatos' },
          ...formatos.map((f) => ({ value: String(f.num), label: f.nombre })),
        ]}
      />
      <Desplegable
        label="Origen"
        icon="sparkles"
        value={filtros.origen}
        onChange={(v) => cambiar('origen', v)}
        options={[
          { value: '', label: 'Todos los orígenes' },
          { value: 'MANUAL', label: 'Manual' },
          { value: 'PROGRAMADO', label: 'Programado' },
          { value: 'AGENTE', label: 'Nico AI' },
        ]}
      />
      <Desplegable
        label="Periodo"
        icon="calendar"
        value={filtros.periodo}
        onChange={(v) => cambiar('periodo', v)}
        options={[
          { value: '', label: 'Cualquiera' },
          { value: 'mes', label: 'Este mes' },
          { value: 'anterior', label: 'Mes anterior' },
          { value: 'trimestre', label: 'Últimos 3 meses' },
          { value: 'rango', label: 'Rango' },
        ]}
      />
      {filtros.periodo === 'rango' && (
        <div className="ui-reportes__fechas">
          <label>
            <span>Desde</span>
            <input type="date" value={filtros.desde} onChange={(e) => cambiar('desde', e.target.value)} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={filtros.hasta} onChange={(e) => cambiar('hasta', e.target.value)} />
          </label>
        </div>
      )}
      <label className="ui-editor__casilla">
        <input
          type="checkbox"
          checked={filtros.archivados}
          onChange={(e) => cambiar('archivados', e.target.checked)}
        />
        <span>Ver archivados</span>
      </label>
      <button type="button" className="ui-link" onClick={cerrar}>
        Cerrar filtros
      </button>
    </div>
  )
}

export function ReportesPage() {
  const { organizacion, rol } = useSesion()
  const movil = useEsMovil()
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [panelFiltros, setPanelFiltros] = useState(false)
  const [panelSaliendo, setPanelSaliendo] = useState(false)
  const claveFiltros = JSON.stringify(filtros)
  const { estado, datos, reintentar, recargar, actualizar } = useDatos(
    () => cargar(filtros),
    [claveFiltros],
  )
  const [params] = useSearchParams()
  const [elegido, setElegido] = useState(() => Number(params.get('reporte')) || null)
  const [vistaAbierta, setVistaAbierta] = useState(false)
  const [pestana, setPestana] = useState('reportes')
  const [modal, setModal] = useState(false)
  const [inicial, setInicial] = useState(null)
  const [modalFormato, setModalFormato] = useState(null)
  const [modalFormatoReporte, setModalFormatoReporte] = useState(false)
  const [modalEnvios, setModalEnvios] = useState(null)
  const [areasElegidas, setAreasElegidas] = useState([])
  const [versiones, setVersiones] = useState(null)
  const reportes = datos?.reportes ?? []
  const actual = reportes.find((r) => r.num === elegido) ?? reportes[0]
  const ed = useEdicion(actual)
  const puedeEditar = rol === 'ADMIN' || rol === 'SUPER'
  const edPagina = ed.modo === 'nuevo' ? { ...ed, editando: false } : ed
  const generando = reportes.some((r) => r.estado === 'GENERANDO')
  const [entrando, setEntrando] = useState(false)
  const estadoPrevio = useRef(actual?.estado)
  useEffect(() => {
    const previo = estadoPrevio.current
    estadoPrevio.current = actual?.estado
    if (previo === 'GENERANDO' && ['LISTO', 'ENVIADO'].includes(actual?.estado)) {
      setEntrando(true)
      const timer = setTimeout(() => setEntrando(false), 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [actual?.estado])
  const activos = [
    filtros.area && { clave: 'area', texto: datos?.areas.find((a) => String(a.num) === filtros.area)?.nombre || `Área ${filtros.area}` },
    filtros.formato && { clave: 'formato', texto: ed.formatos.find((f) => String(f.num) === filtros.formato)?.nombre || `Formato ${filtros.formato}` },
    filtros.origen && { clave: 'origen', texto: { MANUAL: 'Manual', PROGRAMADO: 'Programado', AGENTE: 'Nico AI' }[filtros.origen] },
    filtros.periodo && {
      clave: 'periodo',
      texto:
        filtros.periodo === 'rango'
          ? `Rango${filtros.desde ? ` · ${filtros.desde}` : ''}${filtros.hasta ? ` – ${filtros.hasta}` : ''}`
          : ETIQUETA_PERIODO[filtros.periodo],
    },
    filtros.archivados && { clave: 'archivados', texto: 'Archivados' },
  ].filter(Boolean)

  useEffect(() => {
    if (!generando) return undefined
    const timer = setInterval(recargar, 5000)
    return () => clearInterval(timer)
  }, [generando, recargar])

  const cerrarFiltros = () => {
    setPanelSaliendo(true)
    window.setTimeout(() => {
      setPanelFiltros(false)
      setPanelSaliendo(false)
    }, 180)
  }

  useEffect(() => {
    if (!panelFiltros) return undefined
    const fuera = (e) => {
      if (!e.target.closest('.ui-reportes__filtros')) cerrarFiltros()
    }
    const escape = (e) => e.key === 'Escape' && cerrarFiltros()
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [panelFiltros])

  const accionFormato = async (accion) => {
    try {
      await accion()
      await ed.recargar()
      recargar()
    } catch {
      aviso('No se pudo actualizar el formato. Intenta de nuevo.', { tipo: 'error' })
    }
  }
  const hacerPredeterminado = () => accionFormato(() => formatosApi.predeterminado(ed.formato.num))
  const archivarFormato = async () => {
    const ok = await confirmar({
      titulo: 'Archivar formato',
      mensaje: `¿Archivar el formato «${ed.formato.nombre}»? Los reportes ya generados no cambian.`,
      confirmar: 'Archivar',
      peligro: true,
    })
    if (!ok) return
    accionFormato(() => formatosApi.archivar(ed.formato.num))
  }
  const abrirAreas = () => {
    setAreasElegidas(ed.formato.areasPredeterminado ?? [])
    setModalFormato('areas')
  }
  const guardarAreas = async () => {
    await accionFormato(() => formatosApi.areas(ed.formato.num, areasElegidas))
    setModalFormato(null)
  }
  const verVersiones = async () => {
    setVersiones(null)
    setModalFormato('versiones')
    try {
      setVersiones(await formatosApi.versiones(ed.formato.num))
    } catch {
      setVersiones([])
    }
  }
  const archivarReporte = async (r) => {
    const texto = r.archivado ? 'Desarchivar' : 'Archivar'
    const ok = await confirmar({
      titulo: `${texto} reporte`,
      mensaje: `¿${texto} el reporte R-${String(r.num).padStart(4, '0')}?`,
      confirmar: texto,
      peligro: !r.archivado,
    })
    if (!ok) return
    try {
      await (r.archivado ? reportesApi.desarchivar(r.num) : reportesApi.archivar(r.num))
      recargar()
    } catch {
      aviso('No se pudo archivar el reporte. Intenta de nuevo.', { tipo: 'error' })
    }
  }
  const repetir = (r) => {
    setInicial({ area: r.area, areas: r.areas ?? [], formato: r.formato })
    setModal(true)
  }
  const abrirReporte = (r) => {
    setElegido(r.num)
    if (movil) setVistaAbierta(true)
  }
  const quitarFiltro = (clave) =>
    setFiltros((f) =>
      clave === 'archivados'
        ? { ...f, archivados: false }
        : clave === 'periodo'
          ? { ...f, periodo: '', desde: '', hasta: '' }
          : { ...f, [clave]: '' },
    )

  useEffect(() => {
    const alCambiarReporte = () => recargar()
    window.addEventListener('nucleo:reporte', alCambiarReporte)
    return () => window.removeEventListener('nucleo:reporte', alCambiarReporte)
  }, [recargar])

  const divisor = <span className="ui-reportes__divisor" aria-hidden />
  const barraRef = useRef(null)
  // Compactación de la barra por pasos, según lo que de verdad cabe (el ancho depende del
  // nombre del formato): 1 «Opciones» solo ícono, 2 «Duplicar» solo ícono, 3 sin distintivo,
  // 4 sin la etiqueta «Formato» (el selector ya puede angostarse), 5 ambos al menú «⋯».
  // Al cambiar el ancho, el reporte o el formato se vuelve a medir desde el paso 0.
  const [nivelBarra, setNivelBarra] = useState(0)
  // `medida` cambia en cada reinicio para que la revisión corra aunque el nivel ya fuera 0.
  const [medida, setMedida] = useState(0)
  useLayoutEffect(() => {
    const el = barraRef.current
    if (!el) return undefined
    const reiniciar = () => {
      setNivelBarra(0)
      setMedida((m) => m + 1)
    }
    reiniciar()
    let ancho = el.clientWidth
    const observador = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - ancho) < 1) return
      ancho = el.clientWidth
      reiniciar()
    })
    observador.observe(el)
    // Con la fuente ya cargada los textos cambian de ancho: se mide otra vez.
    let vivo = true
    document.fonts?.ready.then(() => vivo && reiniciar())
    return () => {
      vivo = false
      observador.disconnect()
    }
  }, [movil, edPagina.editando, actual?.num, ed.formato.id])
  useLayoutEffect(() => {
    const el = barraRef.current
    if (!el || movil || edPagina.editando || nivelBarra >= 5) return
    // Un grupo que se aprieta por debajo de su contenido se encima con el siguiente sin que la
    // barra se desborde: se revisan la barra y cada grupo.
    const desborda = [el, ...el.querySelectorAll('.ui-reportes__barra-grupo')].some((x) => x.scrollWidth > x.clientWidth + 1)
    if (desborda) setNivelBarra((n) => Math.min(5, n + 1))
  }, [nivelBarra, medida, movil, edPagina.editando])
  const barraAngosta = nivelBarra >= 5
  const opcionesSoloIcono = nivelBarra >= 1
  const duplicarSoloIcono = nivelBarra >= 2
  const ocultarMarca = nivelBarra >= 3
  const ocultarEtiquetaFormato = nivelBarra >= 4
  const listo = (r) => ['LISTO', 'ENVIADO'].includes(r?.estado ?? 'LISTO')
  const badgeEstado = (r) =>
    r?.archivado ? (
      <Badge tone="neutral" icon="circle-x">Archivado</Badge>
    ) : r && !listo(r) ? (
      <Badge tone={estadoDe(r).tone} icon={estadoDe(r).icon}>{estadoDe(r).label}</Badge>
    ) : null
  const accionesFormato = [
    {
      label: 'Hacer predeterminado',
      icon: 'circle-check',
      disabled: ed.formato.esPlantilla || ed.formato.predeterminado,
      nota: ed.formato.esPlantilla ? 'Duplica la plantilla primero' : undefined,
      onClick: hacerPredeterminado,
    },
    { label: 'Predeterminado de áreas…', icon: 'map-pin', disabled: ed.formato.esPlantilla, onClick: abrirAreas },
    { label: 'Archivar formato', icon: 'circle-x', peligro: true, disabled: ed.formato.esPlantilla, onClick: archivarFormato },
    { label: 'Ver versiones', icon: 'history', onClick: verVersiones },
  ]
  const accionEditar = {
    label: ed.formato.esPlantilla ? 'Duplicar para editar' : 'Personalizar',
    icon: ed.formato.esPlantilla ? 'copy' : 'sliders-horizontal',
    onClick: ed.formato.esPlantilla ? ed.duplicar : ed.abrir,
  }
  const accionEstado = actual ? badgeEstado(actual) : null
  const barra = movil ? (
    <div className={`ui-reportes__barra ui-reportes__barra--movil${edPagina.editando ? ' ui-reportes__barra--edicion' : ''}`}>
      <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => setVistaAbierta(false)}>
        Volver
      </Button>
      <div className="ui-reportes__barra-titulo">
        {edPagina.editando ? (
          <>
            <span className="ui-eyebrow">Personalizando el formato</span>
            <strong>{ed.formato.nombre}</strong>
          </>
        ) : actual ? (
          <>
            <strong>{tituloDe(actual)}</strong>
            {accionEstado && <div className="ui-reportes__barra-estado">{accionEstado}</div>}
          </>
        ) : null}
      </div>
      {edPagina.editando ? (
        <div className="ui-reportes__barra-acciones">
          <Button variant="ghost" size="sm" onClick={ed.restablecer}>
            <RotateCcw size={16} /> Restablecer
          </Button>
          <Button variant="secondary" size="sm" onClick={ed.cancelar}>Cancelar</Button>
          <Button size="sm" icon="circle-check" onClick={ed.guardar}>Guardar</Button>
        </div>
      ) : actual ? (
        <div className="ui-reportes__barra-acciones">
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            className="ui-reportes__pdf"
            disabled={!listo(actual)}
            onClick={() =>
              reportesApi
                .descargarArchivo(actual.num, tituloDe(actual))
                .catch(() => aviso('No se pudo descargar el PDF. Intenta de nuevo.', { tipo: 'error' }))
            }
          >
            PDF
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            className="ui-reportes__csv"
            disabled={!listo(actual)}
            onClick={() =>
              reportesApi
                .descargarCsv(actual.num, tituloDe(actual))
                .catch(() => aviso('No se pudo descargar el CSV. Intenta de nuevo.', { tipo: 'error' }))
            }
          >
            CSV
          </Button>
          <MenuAcciones
            label="Más acciones del reporte"
            items={[
              { label: 'Formato…', icon: 'file-text', onClick: () => setModalFormatoReporte(true) },
              { label: 'Historial de envíos', icon: 'send', onClick: () => setModalEnvios(actual) },
              { label: 'Generar de nuevo', icon: 'refresh-cw', onClick: () => repetir(actual) },
              {
                label: actual.archivado ? 'Desarchivar' : 'Archivar',
                icon: 'circle-x',
                peligro: !actual.archivado,
                onClick: () => archivarReporte(actual),
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  ) : (
    <div
      ref={barraRef}
      className={`ui-reportes__barra${edPagina.editando ? ' ui-reportes__barra--edicion' : ''}${nivelBarra >= 4 ? ' is-apretada' : ''}${nivelBarra >= 5 ? ' is-angosta' : ''}`}
    >
      {edPagina.editando ? (
        <>
          <div className="ui-reportes__barra-titulo">
            <span className="ui-eyebrow">Personalizando el formato</span>
            <strong>{ed.formato.nombre}</strong>
          </div>
          {divisor}
          <div className="ui-reportes__barra-grupo ui-reportes__barra-acciones">
            <Button variant="ghost" size="sm" onClick={ed.restablecer}>
              <RotateCcw size={16} /> Restablecer
            </Button>
            <Button variant="secondary" size="sm" onClick={ed.cancelar}>Cancelar</Button>
            <Button size="sm" icon="circle-check" onClick={ed.guardar}>Guardar</Button>
          </div>
        </>
      ) : actual ? (
        <>
          {accionEstado && (
            <>
              <div className="ui-reportes__barra-estado ui-reportes__barra-estado--inicio ui-reportes__barra-grupo">
                {accionEstado}
              </div>
              {divisor}
            </>
          )}
          <div className="ui-reportes__barra-grupo ui-reportes__barra-formato">
            {!ocultarEtiquetaFormato && <span className="ui-reportes__etiqueta">Formato</span>}
            <Desplegable
              value={ed.formato.id}
              onChange={async (v) => ed.asignar(actual.num, v)}
              options={ed.formatos.map((f) => ({ value: f.id, label: f.nombre }))}
            />
            {!ocultarMarca && ed.formato.num && (
              <Badge tone="neutral" className="ui-reportes__marca-formato">
                {ed.formato.esPlantilla ? 'Plantilla' : `Versión ${ed.formato.version ?? 1}`}
              </Badge>
            )}
            {puedeEditar && ed.formato.num && !barraAngosta && (
              <MenuAcciones
                icon="settings"
                label="Opciones del formato"
                className="ui-reportes__opciones"
                texto={opcionesSoloIcono ? undefined : 'Opciones'}
                items={accionesFormato}
              />
            )}
          </div>
          {puedeEditar && !barraAngosta && (
            <>
              {divisor}
              <div className="ui-reportes__barra-grupo ui-reportes__barra-editar">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ed.formato.esPlantilla ? 'copy' : 'sliders-horizontal'}
                  aria-label={ed.formato.esPlantilla ? 'Duplicar para editar' : 'Personalizar'}
                  className="ui-reportes__duplicar"
                  onClick={ed.formato.esPlantilla ? ed.duplicar : ed.abrir}
                >
                  {!duplicarSoloIcono && (
                    <span className="ui-reportes__personalizar-texto">
                      {ed.formato.esPlantilla ? 'Duplicar para editar' : 'Personalizar'}
                    </span>
                  )}
                </Button>
              </div>
            </>
          )}
          {divisor}
          <div className="ui-reportes__barra-grupo ui-reportes__barra-acciones">
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              className="ui-reportes__pdf"
              disabled={!listo(actual)}
              onClick={() =>
                reportesApi
                  .descargarArchivo(actual.num, tituloDe(actual))
                  .catch(() => aviso('No se pudo descargar el PDF. Intenta de nuevo.', { tipo: 'error' }))
              }
            >
              PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              className="ui-reportes__csv"
              disabled={!listo(actual)}
              onClick={() =>
                reportesApi
                  .descargarCsv(actual.num, tituloDe(actual))
                  .catch(() => aviso('No se pudo descargar el CSV. Intenta de nuevo.', { tipo: 'error' }))
              }
            >
              CSV
            </Button>
            <MenuAcciones
              label="Más acciones del reporte"
              items={[
                ...(barraAngosta && puedeEditar ? [accionEditar, ...accionesFormato] : []),
                { label: 'Historial de envíos', icon: 'send', onClick: () => setModalEnvios(actual) },
                { label: 'Generar de nuevo', icon: 'refresh-cw', onClick: () => repetir(actual) },
                {
                  label: actual.archivado ? 'Desarchivar' : 'Archivar',
                  icon: 'circle-x',
                  peligro: !actual.archivado,
                  onClick: () => archivarReporte(actual),
                },
              ]}
            />
          </div>
        </>
      ) : null}
    </div>
  )

  const programadas = (datos?.programaciones ?? []).filter((p) => p.activa !== false).length

  return (
    <Pantalla
      eyebrow={datos ? `${organizacion} · ${reportes.length} reportes · ${programadas} programados` : organizacion}
      titulo="Reportes"
      acciones={
        <Button
          icon="sparkles"
          onClick={() => {
            setInicial(null)
            setModal(true)
          }}
        >
          Generar reporte
        </Button>
      }
    >
      {puedeEditar && (
        <MigracionFormatos
          formatos={ed.formatos}
          alSubir={async () => {
            await ed.recargar()
            recargar()
          }}
        />
      )}
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <div className={`ui-reportes${vistaAbierta ? ' is-vista' : ''}`}>
          <aside className="ui-reportes__lista">
            <Card className="nc-grow">
              {edPagina.editando ? (
                <ListaTarjetas ed={edPagina} areas={datos.areas} r={actual} />
              ) : (
                <>
              <Tabs className="ui-reportes__tabs" items={PESTANAS} value={pestana} onChange={setPestana} />
              {pestana === 'programados' ? (
                <div className="ui-reportes__programados nc-scroll">
                  <Programaciones
                    programaciones={datos.programaciones}
                    areas={datos.areas}
                    formatos={ed.formatos}
                    puedeEditar={puedeEditar}
                    onCambio={recargar}
                  />
                </div>
              ) : (
                <>
                  <div className="ui-reportes__filtros">
                    <div className="ui-reportes__buscador">
                      <Buscador
                        valor={filtros.q}
                        cambiar={(q) => setFiltros({ ...filtros, q })}
                        placeholder="Buscar por título…"
                        ancho="100%"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="sliders-horizontal"
                        onClick={() => (panelFiltros ? cerrarFiltros() : setPanelFiltros(true))}
                      >
                        Filtros{activos.length ? ` · ${activos.length}` : ''}
                      </Button>
                    </div>
                    {panelFiltros && (
                      <Filtros
                        filtros={filtros}
                        setFiltros={setFiltros}
                        areas={datos.areas}
                        formatos={ed.formatos}
                        cerrar={cerrarFiltros}
                        saliendo={panelSaliendo}
                      />
                    )}
                    {activos.length > 0 && (
                      <div className="ui-reportes__chips">
                        {activos.map((f) => (
                          <button key={f.clave} type="button" className="ui-reportes__chip" onClick={() => quitarFiltro(f.clave)}>
                            {f.texto} <span aria-hidden>×</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ui-reportes__items nc-scroll">
                    {reportes.length === 0 ? (
                      <p className="ui-muted" style={{ padding: 12 }}>No hay reportes con esos filtros.</p>
                    ) : reportes.map((r) => {
                      const partes = tituloDe(r).split(' · ')
                      const formatoLugar = partes.length >= 3 ? `${partes[0]} · ${partes[1]}` : tituloDe(r)
                      const estado = estadoDe(r)
                      return (
                        <div
                          key={r.num}
                          role="button"
                          tabIndex={0}
                          className={`ui-item ui-item--boton ui-reciente ui-reciente--compacta${actual?.num === r.num ? ' is-selected' : ''}`}
                          onClick={() => abrirReporte(r)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && abrirReporte(r)}
                        >
                          <div className="ui-reportes__item-texto">
                            <strong className="ui-reciente__formato">{formatoLugar}</strong>
                            <div className="ui-reciente__meta">
                              <span className="ui-reciente__periodo">
                                {periodo(r.periodo_inicio, r.periodo_fin)}
                              </span>
                              {(r.archivado || !['LISTO', 'ENVIADO'].includes(r.estado ?? 'LISTO')) && (
                                <Badge
                                  tone={r.archivado ? 'neutral' : estado.tone}
                                  icon={r.archivado ? 'circle-x' : estado.icon}
                                >
                                  {r.archivado ? 'Archivado' : estado.label}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <span className="ui-reportes__item-menu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                            <MenuAcciones
                              label={`Opciones del reporte R-${String(r.num).padStart(4, '0')}`}
                              items={[
                                { label: 'Historial de envíos', icon: 'send', onClick: () => setModalEnvios(r) },
                                { label: 'Generar de nuevo', icon: 'refresh-cw', onClick: () => repetir(r) },
                                {
                                  label: r.archivado ? 'Desarchivar' : 'Archivar',
                                  icon: 'circle-x',
                                  peligro: !r.archivado,
                                  onClick: () => archivarReporte(r),
                                },
                              ]}
                            />
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
                </>
              )}
            </Card>
          </aside>
          <section className="ui-reportes__vista">
            <ProveedorZoom zoomInicial={1}>
              {barra}
              {actual && ['LISTO', 'ENVIADO'].includes(actual.estado ?? 'LISTO') ? (
                <div className={`ui-reportes__hoja${entrando ? ' is-entrando' : ''}`}>
                  <DashboardReporte r={actual} areas={datos.areas} ed={edPagina} controlZoom />
                </div>
              ) : actual && ['GENERANDO', 'FALLO'].includes(actual.estado ?? '') ? (
                <EsperaReporte reporte={actual} onRepetir={() => repetir(actual)} />
              ) : actual ? (
                <Card className="ui-reportes__pendiente">
                  <Badge tone={estadoDe(actual).tone} icon={estadoDe(actual).icon}>
                    {estadoDe(actual).label}
                  </Badge>
                  <p className="ui-muted">El reporte aparece aquí cuando termine de generarse.</p>
                </Card>
              ) : (
                <Card className="ui-reportes__pendiente">
                  <p className="ui-muted">No hay un reporte seleccionado.</p>
                </Card>
              )}
            </ProveedorZoom>
          </section>
        </div>
      )}
      {modalEnvios && (
        <Modal
          titulo="Historial de envíos"
          tamano="mediano"
          sub={tituloDe(modalEnvios)}
          cerrar={() => setModalEnvios(null)}
          acciones={null}
        >
          {modalEnvios.envios?.length ? (
            <div className="ui-envios">
              {modalEnvios.envios.map((envio) => (
                <div key={envio.num} className="ui-envios__fila">
                  <div className="ui-envios__cuando">
                    <strong>{fechaLarga(envio.fecha)}</strong>
                    <span className="ui-muted">{hora(envio.fecha)}</span>
                  </div>
                  <Badge tone="neutral">{ORIGEN_ENVIO[envio.origen] ?? envio.origen}</Badge>
                  <span className="ui-envios__a">
                    {(envio.destinatarios ?? []).map((d) => d.nombre).join(', ') || 'Sin destinatarios'}
                  </span>
                  <Badge tone={envio.resultado === 'OK' ? 'success' : 'danger'}>
                    {envio.resultado === 'OK' ? 'Enviado' : 'Falló'}
                  </Badge>
                  {envio.error && <span className="ui-envios__error">{envio.error}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="ui-muted">Este reporte no se ha enviado.</p>
          )}
        </Modal>
      )}
      {modal && datos && (
        <AsistenteReporte
          areas={datos.areas}
          reportes={reportes}
          ed={ed}
          puedeEditar={puedeEditar}
          muestra={actual}
          inicial={inicial}
          cerrar={() => {
            setModal(false)
            setInicial(null)
          }}
          creado={(nuevos) => {
            actualizar((d) => ({ ...d, reportes: [...nuevos.reverse(), ...d.reportes] }))
            setElegido(nuevos[0].num)
            setModal(false)
            setInicial(null)
          }}
        />
      )}
      {modalFormato === 'areas' && datos && (
        <Modal
          titulo="Predeterminado de áreas"
          tamano="mediano"
          sub={`Elige en qué áreas se usará «${ed.formato.nombre}» por omisión.`}
          cerrar={() => setModalFormato(null)}
          acciones={<Button onClick={guardarAreas}>Guardar áreas</Button>}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {datos.areas.map((area) => (
              <label key={area.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={areasElegidas.includes(area.num)}
                  onChange={(e) =>
                    setAreasElegidas((actuales) =>
                      e.target.checked
                        ? [...actuales, area.num]
                        : actuales.filter((num) => num !== area.num),
                    )
                  }
                />
                <span>{area.nombre}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}
      {modalFormatoReporte && actual && (
        <Modal
          titulo="Formato del reporte"
          tamano="chico"
          sub={tituloDe(actual)}
          cerrar={() => setModalFormatoReporte(false)}
          acciones={null}
        >
          <div className="ui-formato-lista" role="listbox" aria-label="Formato">
            {ed.formatos.map((f) => {
              const activo = String(f.id) === String(ed.formato.id)
              return (
                <button
                  key={f.id}
                  type="button"
                  role="option"
                  aria-selected={activo}
                  className={`ui-formato-opcion${activo ? ' is-activo' : ''}`}
                  onClick={async () => {
                    await ed.asignar(actual.num, f.id)
                    setModalFormatoReporte(false)
                  }}
                >
                  <span>{etiquetaFormato(f)}</span>
                  {activo && <span aria-hidden>✓</span>}
                </button>
              )
            })}
          </div>
        </Modal>
      )}
      {modalFormato === 'versiones' && (
        <Modal
          titulo="Versiones del formato"
          tamano="mediano"
          sub={ed.formato.nombre}
          cerrar={() => setModalFormato(null)}
          acciones={null}
        >
          {versiones === null ? (
            <p className="ui-muted">Cargando versiones…</p>
          ) : versiones.length === 0 ? (
            <p className="ui-muted">Este formato no tiene versiones.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {versiones.map((version) => (
                <div key={version.numero} className="ui-item" style={{ padding: 10 }}>
                  <strong>Versión {version.numero}</strong>
                  <span className="ui-muted">
                    {' '}· {fechaLarga(version.fecha)} · {version.creada_por_nombre || 'Sistema'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </Pantalla>
  )
}
