import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Cabecera } from '../../../components/Cabecera'
import { EstadoError } from '../../../components/EstadoError'
import { Pantalla } from '../../../components/Pantalla'
import { Aparece, Button, Card, Chip, Icon, IconButton, Input, Skeleton, T } from '../../../components/ui'
import { useAnimaciones } from '../../../context/PreferenciasContext'
import { useTema } from '../../../context/TemaContext'
import { useDatos } from '../../../hooks/useDatos'
import { colors } from '../../../theme'
import * as analiticaApi from '../../../services/analitica'
import * as dispositivosApi from '../../../services/dispositivos'
import * as organizacionesApi from '../../../services/organizaciones'
import { escucharPanel } from '../../../services/tiempoReal'
import { pagina } from '../../../utils/convertir'
import { haceCuanto } from '../../../utils/formato'
import { TarjetaTablero } from './Tarjetas'
import { NOMBRE_VARIABLE, PERIODOS, VARIABLES } from './datos'

const NOMBRE_DIMENSION = { area: 'Área', dispositivo: 'Dispositivo', variable: 'Variable', nivel: 'Nivel', estado: 'Estado' }

// Consulta la página en vivo. Al cambiar filtros o página conserva los datos anteriores para que
// las tarjetas no parpadeen; solo la primera carga muestra esqueletos.
function useConsultaPagina({ tarjetas, filtros, cruzado }) {
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: null, actualizando: false })
  const [vuelta, setVuelta] = useState(0)
  const [recargando, setRecargando] = useState(false)
  const clave = JSON.stringify({ tarjetas, filtros, cruzado })

  useEffect(() => {
    let vivo = true
    // eslint-disable-next-line react/set-state-in-effect -- la consulta en vivo se refleja en la pantalla
    setRes((r) => ({ ...r, estado: r.datos ? 'listo' : 'cargando', actualizando: Boolean(r.datos), error: null }))
    analiticaApi
      .consultar({ tarjetas, filtros, cruzado })
      .then((datos) => vivo && setRes({ estado: 'listo', datos, error: null, actualizando: false }))
      .catch((error) => vivo && setRes((r) => ({ ...r, estado: r.datos ? 'listo' : 'error', error, actualizando: false })))
      .finally(() => setRecargando(false))
    return () => {
      vivo = false
    }
    // La clave normalizada reúne tarjetas, filtros y filtro cruzado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, vuelta])

  const refrescar = useCallback((visible = false) => {
    if (visible) setRecargando(true)
    setVuelta((v) => v + 1)
  }, [])

  return { ...res, recargando, refrescar }
}

function OrdenFilas({ tarjetas, datos, propiedades }) {
  const ordenadas = [...tarjetas].sort((a, b) => a.y - b.y || a.x - b.x)
  const filas = []
  for (let i = 0; i < ordenadas.length; i += 1) {
    const actual = ordenadas[i]
    if (actual.tipo === 'kpi' && actual.w <= 3) {
      const siguiente = ordenadas[i + 1]
      if (siguiente?.tipo === 'kpi' && siguiente.w <= 3) {
        filas.push([actual, siguiente])
        i += 1
        continue
      }
    }
    filas.push([actual])
  }
  return (
    <>
      {filas.map((fila, indice) => (
        <Aparece key={fila[0].id} indice={indice}>
          <View style={s.filaTarjetas}>
            {fila.map((tarjeta) => (
              <View key={tarjeta.id} style={{ flex: 1 }}>
                <TarjetaTablero tarjeta={tarjeta} datos={datos?.tarjetas?.[tarjeta.id]} {...propiedades(tarjeta)} />
              </View>
            ))}
          </View>
        </Aparece>
      ))}
    </>
  )
}

// Hoja de filtros: áreas, dispositivos (acotados por las áreas) y variable. Se aplica con «Listo».
function HojaFiltros({ abierto, areas, dispositivos, filtros, alCerrar, alAplicar }) {
  const { c } = useTema()
  const animar = useAnimaciones()
  const inset = useSafeAreaInsets()
  const [borrador, setBorrador] = useState(filtros)
  useEffect(() => {
    if (abierto) setBorrador({ ...filtros, areas: [...filtros.areas], dispositivos: [...filtros.dispositivos] })
    // Solo al abrir: los cambios de la consulta no deben pisar lo que se está eligiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])
  const dispositivosVisibles = dispositivos.filter((d) => !borrador.areas.length || borrador.areas.includes(d.area))
  const alternarArea = (num) => {
    const areasNuevas = borrador.areas.includes(num) ? borrador.areas.filter((x) => x !== num) : [...borrador.areas, num]
    const dispositivosNuevos = borrador.dispositivos.filter((d) => {
      const dispositivo = dispositivos.find((x) => x.num === d)
      return !areasNuevas.length || (dispositivo && areasNuevas.includes(dispositivo.area))
    })
    setBorrador((b) => ({ ...b, areas: areasNuevas, dispositivos: dispositivosNuevos }))
  }
  const alternarDispositivo = (num) => {
    setBorrador((b) => ({ ...b, dispositivos: b.dispositivos.includes(num) ? b.dispositivos.filter((x) => x !== num) : [...b.dispositivos, num] }))
  }
  return (
    <Modal visible={abierto} transparent animationType={animar ? 'slide' : 'none'} statusBarTranslucent onRequestClose={alCerrar}>
      <Pressable style={s.fondo} onPress={alCerrar} accessibilityLabel="Cerrar filtros" />
      <View style={[s.hoja, { backgroundColor: c.background }]}>
        <View style={[s.asa, { backgroundColor: c.border }]} />
        <View style={s.hojaCabeza}>
          <T peso={700} size={18}>Filtros</T>
          <IconButton icon="x" label="Cerrar filtros" variant="ghost" size="sm" onPress={alCerrar} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
          <View style={{ gap: 8 }}>
            <T mayus color={c.textMuted}>Áreas</T>
            <View style={s.filtros}>
              <Chip selected={!borrador.areas.length} onPress={() => setBorrador((b) => ({ ...b, areas: [], dispositivos: [] }))}>Todas</Chip>
              {areas.map((area) => (
                <Chip key={area.num} selected={borrador.areas.includes(area.num)} onPress={() => alternarArea(area.num)}>
                  {area.nombre}
                </Chip>
              ))}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <T mayus color={c.textMuted}>Dispositivos</T>
            <View style={s.filtros}>
              <Chip selected={!borrador.dispositivos.length} onPress={() => setBorrador((b) => ({ ...b, dispositivos: [] }))}>Todos</Chip>
              {dispositivosVisibles.map((dispositivo) => (
                <Chip key={dispositivo.num} selected={borrador.dispositivos.includes(dispositivo.num)} onPress={() => alternarDispositivo(dispositivo.num)}>
                  {dispositivo.nombre}
                </Chip>
              ))}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <T mayus color={c.textMuted}>Variable</T>
            <View style={s.filtros}>
              {VARIABLES.map(([valor, etiqueta]) => (
                <Chip key={valor || 'todas'} selected={(borrador.variable || '') === valor} onPress={() => setBorrador((b) => ({ ...b, variable: valor }))}>
                  {etiqueta}
                </Chip>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={[s.hojaAcciones, { borderTopColor: c.border, paddingBottom: 16 + inset.bottom }]}>
          <Button variant="secondary" size="md" block onPress={() => { alAplicar(borrador); alCerrar() }}>
            Listo
          </Button>
        </View>
      </View>
    </Modal>
  )
}

function HojaPeriodo({ abierto, filtros, alCerrar, alAplicar }) {
  const { c } = useTema()
  const animar = useAnimaciones()
  const inset = useSafeAreaInsets()
  const [desde, setDesde] = useState(filtros.desde || '')
  const [hasta, setHasta] = useState(filtros.hasta || '')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!abierto) return
    // eslint-disable-next-line react/set-state-in-effect -- al abrir la hoja se parte de las fechas actuales
    setDesde(filtros.desde || '')
    setHasta(filtros.hasta || '')
    setError('')
  }, [abierto, filtros.desde, filtros.hasta])
  const valida = /^\d{4}-\d{2}-\d{2}$/
  const aplicar = () => {
    if (!valida.test(desde) || !valida.test(hasta)) {
      setError('Elige las dos fechas (AAAA-MM-DD).')
      return
    }
    const a = new Date(`${desde}T00:00:00`)
    const b = new Date(`${hasta}T00:00:00`)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
      setError('La fecha no es válida.')
      return
    }
    if (desde > hasta) {
      setError('La fecha inicial debe ser anterior a la final.')
      return
    }
    if ((b - a) / 86400000 > 366) {
      setError('El periodo personalizado no puede pasar de 366 días.')
      return
    }
    alAplicar({ periodo: 'personalizado', desde, hasta })
    alCerrar()
  }
  return (
    <Modal visible={abierto} transparent animationType={animar ? 'slide' : 'none'} statusBarTranslucent onRequestClose={alCerrar}>
      <Pressable style={s.fondo} onPress={alCerrar} accessibilityLabel="Cerrar periodo personalizado" />
      <View style={[s.hoja, { backgroundColor: c.background }]}>
        <View style={[s.asa, { backgroundColor: c.border }]} />
        <View style={s.hojaCabeza}>
          <T peso={700} size={18}>Periodo personalizado</T>
          <IconButton icon="x" label="Cerrar periodo" variant="ghost" size="sm" onPress={alCerrar} />
        </View>
        <View style={{ padding: 16, paddingBottom: 16 + inset.bottom, gap: 12 }}>
          <T size={12} color={c.textMuted}>Hasta 366 días. La fecha final incluye el día completo.</T>
          <Input label="Desde" accessibilityLabel="Desde" value={desde} onChangeText={setDesde} placeholder="AAAA-MM-DD" autoCapitalize="none" />
          <Input label="Hasta" accessibilityLabel="Hasta" value={hasta} onChangeText={setHasta} placeholder="AAAA-MM-DD" autoCapitalize="none" />
          {error ? <T size={12} color={c.danger}>{error}</T> : null}
          <Button onPress={aplicar}>Aplicar periodo</Button>
        </View>
      </View>
    </Modal>
  )
}

function ChipCruzado({ etiqueta, onQuitar }) {
  const { c } = useTema()
  return (
    <Pressable
      onPress={onQuitar}
      accessibilityRole="button"
      accessibilityLabel={`Quitar filtro ${etiqueta}`}
      style={({ pressed }) => [s.chipCruzado, { backgroundColor: c.surfaceMuted, borderColor: c.border }, pressed && { opacity: 0.7 }]}
    >
      <T size={12} peso={600} numberOfLines={1}>{etiqueta}</T>
      <Icon name="x" size={13} color={c.textMuted} />
    </Pressable>
  )
}

// Vista de solo lectura de un tablero de Analítica dentro de Reportes: periodo, filtros, páginas y
// tarjetas apiladas en orden y, luego, x.
export function TableroScreen({ navigation, route }) {
  const { c } = useTema()
  const tablero = route?.params?.tablero
  const paginas = tablero?.conf?.paginas || []
  const [paginaId, setPaginaId] = useState(paginas[0]?.id || null)
  const [filtros, setFiltros] = useState({
    periodo: tablero?.conf?.filtros?.periodo || '30d',
    variable: tablero?.conf?.filtros?.variable ?? 'TEMP',
    areas: [],
    dispositivos: [],
    desde: '',
    hasta: '',
  })
  const [cruzado, setCruzado] = useState(null)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [periodoAbierto, setPeriodoAbierto] = useState(false)
  const [hallazgos, setHallazgos] = useState({})
  const [generando, setGenerando] = useState({})
  const [errorHallazgos, setErrorHallazgos] = useState({})
  const [, setLatido] = useState(0)
  const timerEvento = useRef(null)
  const enfocada = useIsFocused()

  const catalogos = useDatos(
    () => Promise.all([organizacionesApi.areas().then(pagina), dispositivosApi.lista().then(pagina)]).then(([areas, dispositivos]) => ({ areas, dispositivos })),
    [],
  )
  const areas = useMemo(() => catalogos.datos?.areas || [], [catalogos.datos])
  const dispositivos = useMemo(() => catalogos.datos?.dispositivos || [], [catalogos.datos])
  const paginaActual = paginas.find((p) => p.id === paginaId) || paginas[0]
  const tarjetas = paginaActual?.tarjetas || []
  const consulta = useConsultaPagina({ tarjetas, filtros, cruzado })
  const incluyeAhora = filtros.periodo !== 'mes_anterior'

  // Texto «Actualizado hace…» sin parpadeos: se refresca cada 5 s.
  useEffect(() => {
    const timer = setInterval(() => setLatido((v) => v + 1), 5000)
    return () => clearInterval(timer)
  }, [])

  // En vivo: el mismo WebSocket de la app, con 5 s para agrupar eventos, y 60 s si el periodo
  // incluye «ahora». Se pausa al salir de la pantalla y con la app en segundo plano.
  useEffect(() => {
    if (!enfocada) return undefined
    const desuscribir = escucharPanel(() => {
      if (AppState.currentState !== 'active') return
      clearTimeout(timerEvento.current)
      timerEvento.current = setTimeout(() => consulta.refrescar(false), 5000)
    })
    const intervalo = incluyeAhora
      ? setInterval(() => {
          if (AppState.currentState === 'active') consulta.refrescar(false)
        }, 60000)
      : null
    const alVolver = (estado) => {
      if (estado === 'active') consulta.refrescar(false)
    }
    const suscripcion = AppState.addEventListener('change', alVolver)
    return () => {
      desuscribir()
      clearTimeout(timerEvento.current)
      clearInterval(intervalo)
      suscripcion.remove()
    }
    // `consulta.refrescar` es estable; solo importa el foco y si el periodo incluye ahora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocada, incluyeAhora])

  const etiquetaCruzado = useMemo(() => {
    if (!cruzado) return ''
    if (cruzado.dimension === 'area') return areas.find((a) => String(a.num) === String(cruzado.valor))?.nombre || `Área ${cruzado.valor}`
    if (cruzado.dimension === 'dispositivo') return dispositivos.find((d) => String(d.num) === String(cruzado.valor))?.nombre || `Dispositivo ${cruzado.valor}`
    if (cruzado.dimension === 'variable') return NOMBRE_VARIABLE[cruzado.valor] || String(cruzado.valor)
    return String(cruzado.valor)
  }, [cruzado, areas, dispositivos])

  if (!tablero) {
    return (
      <Pantalla zona={<Cabecera titulo="Tablero" onVolver={() => navigation.goBack()} />} pestanas={false}>
        <Card padding="sm" style={{ borderRadius: 22, gap: 8 }}>
          <T peso={700}>No se encontró el tablero</T>
          <T size={13} color={c.textSecondary}>Vuelve a la lista de tableros e inténtalo de nuevo.</T>
          <Button variant="secondary" size="sm" onPress={() => navigation.goBack()}>Volver</Button>
        </Card>
      </Pantalla>
    )
  }

  const variablePorDefecto = tablero.conf?.filtros?.variable ?? 'TEMP'
  // Cuenta grupos de filtros activos, como la barra de la web, no cada selección.
  const activos =
    (filtros.areas.length ? 1 : 0) +
    (filtros.dispositivos.length ? 1 : 0) +
    ((filtros.variable || '') !== variablePorDefecto ? 1 : 0)
  const seleccionarCruzado = (tarjeta, seleccion) => {
    if (!seleccion?.dimension || seleccion.valor == null) return
    setCruzado((actual) =>
      actual && actual.dimension === seleccion.dimension && String(actual.valor) === String(seleccion.valor)
        ? null
        : { ...seleccion, origen: tarjeta.id },
    )
  }
  const cambiarPagina = (id) => {
    setPaginaId(id)
    setCruzado(null)
  }
  const aplicarFiltros = (nuevos) => {
    setFiltros((f) => ({ ...f, ...nuevos }))
    setCruzado(null)
  }
  const cambiarPeriodo = (periodo) => {
    if (periodo === 'personalizado') {
      setPeriodoAbierto(true)
      return
    }
    setFiltros((f) => ({ ...f, periodo, desde: '', hasta: '' }))
    setCruzado(null)
  }
  const generarHallazgos = async (tarjeta) => {
    setGenerando((m) => ({ ...m, [tarjeta.id]: true }))
    setErrorHallazgos((m) => ({ ...m, [tarjeta.id]: false }))
    try {
      const respuesta = await analiticaApi.hallazgos({ tarjetas, filtros, cruzado })
      setHallazgos((m) => ({ ...m, [tarjeta.id]: respuesta }))
    } catch {
      setErrorHallazgos((m) => ({ ...m, [tarjeta.id]: true }))
    } finally {
      setGenerando((m) => ({ ...m, [tarjeta.id]: false }))
    }
  }
  const propiedades = (tarjeta) => ({
    cargando: consulta.actualizando || !consulta.datos,
    seleccion: cruzado?.origen === tarjeta.id ? cruzado : null,
    alSeleccionar: (seleccion) => seleccionarCruzado(tarjeta, seleccion),
    alGenerarHallazgos: generarHallazgos,
    generando: generando[tarjeta.id],
    hallazgos: hallazgos[tarjeta.id],
    errorHallazgos: errorHallazgos[tarjeta.id],
    alReintentar: () => consulta.refrescar(false),
  })

  const zona = (
    <>
      <Cabecera titulo={tablero.nombre} onVolver={() => navigation.goBack()} />
      <T size={12} lh={17} color={colors.dark.textSecondary} numberOfLines={2}>
        {tablero.descripcion || 'Tablero de Analítica · solo consulta'}
      </T>
    </>
  )

  return (
    <Pantalla zona={zona} pestanas={false} compacta onRecargar={() => consulta.refrescar(true)} recargando={consulta.recargando}>
      <View style={{ gap: 8 }}>
        <T mayus color={c.textMuted}>Periodo</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtrosHorizontal}>
          {PERIODOS.map(([valor, etiqueta]) => (
            <Chip key={valor} selected={(filtros.periodo || '30d') === valor} onPress={() => cambiarPeriodo(valor)}>
              {etiqueta}
            </Chip>
          ))}
        </ScrollView>
      </View>

      <View style={s.barra}>
        <Button variant="secondary" size="sm" icon="sliders-horizontal" onPress={() => setFiltrosAbiertos(true)}>
          {`Filtros${activos ? ` · ${activos}` : ''}`}
        </Button>
        <T size={11} color={c.textMuted} style={{ flex: 1, textAlign: 'right' }}>
          {consulta.actualizando
            ? 'Actualizando…'
            : consulta.datos?.generado
              ? `Actualizado ${haceCuanto(consulta.datos.generado).toLowerCase()}`
              : consulta.estado === 'error'
                ? 'Sin conexión'
                : 'Cargando…'}
        </T>
        <IconButton icon="history" label="Actualizar" variant="secondary" size="sm" onPress={() => consulta.refrescar(true)} />
      </View>

      {cruzado ? (
        <View style={s.filtros}>
          <ChipCruzado etiqueta={`${NOMBRE_DIMENSION[cruzado.dimension] || 'Filtro'}: ${etiquetaCruzado}`} onQuitar={() => setCruzado(null)} />
        </View>
      ) : null}

      {paginas.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtrosHorizontal}>
          {paginas.map((pagina) => (
            <Chip key={pagina.id} selected={pagina.id === paginaActual?.id} onPress={() => cambiarPagina(pagina.id)}>
              {pagina.nombre}
            </Chip>
          ))}
        </ScrollView>
      ) : null}

      {consulta.error && consulta.datos ? (
        <Pressable onPress={() => consulta.refrescar(false)} accessibilityRole="button" style={[s.aviso, { backgroundColor: c.warningSoft }]}>
          <Icon name="triangle-alert" size={14} color={c.warning} />
          <T size={12} color={c.warning} style={{ flex: 1 }}>No se pudo actualizar. Toca para reintentar.</T>
        </Pressable>
      ) : null}

      {consulta.estado === 'error' && !consulta.datos ? (
        <EstadoError mensaje="Revisa tu conexión a internet e inténtalo de nuevo." onReintentar={() => consulta.refrescar(false)} />
      ) : !paginaActual || !tarjetas.length ? (
        <Card padding="sm" style={{ borderRadius: 22, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="layout-dashboard" size={18} color={c.textMuted} />
            <T peso={700} size={14}>Tablero sin tarjetas</T>
          </View>
          <T size={12} color={c.textSecondary}>Este tablero todavía no tiene tarjetas.</T>
        </Card>
      ) : !consulta.datos ? (
        tarjetas.slice(0, 4).map((tarjeta) => (
          <Card key={tarjeta.id} padding="sm" style={{ borderRadius: 22, gap: 10 }}>
            <View style={s.cabezaCarga}>
              <Skeleton width={32} height={32} round />
              <Skeleton width="55%" height={14} />
            </View>
            <Skeleton height={58} />
          </Card>
        ))
      ) : (
        <OrdenFilas tarjetas={tarjetas} datos={consulta.datos} propiedades={propiedades} />
      )}

      <HojaFiltros
        abierto={filtrosAbiertos}
        areas={areas}
        dispositivos={dispositivos}
        filtros={filtros}
        alCerrar={() => setFiltrosAbiertos(false)}
        alAplicar={aplicarFiltros}
      />
      <HojaPeriodo
        abierto={periodoAbierto}
        filtros={filtros}
        alCerrar={() => setPeriodoAbierto(false)}
        alAplicar={(cambios) => {
          setFiltros((f) => ({ ...f, ...cambios }))
          setCruzado(null)
        }}
      />
    </Pantalla>
  )
}

const s = StyleSheet.create({
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 1 },
  filtrosHorizontal: { flexDirection: 'row', gap: 8, paddingVertical: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipCruzado: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  filaTarjetas: { flexDirection: 'row', gap: 12 },
  cabezaCarga: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  fondo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  hoja: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  hojaCabeza: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  hojaAcciones: { padding: 16, borderTopWidth: 1 },
})
