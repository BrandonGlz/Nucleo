import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, Image, Keyboard, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { ReporteChat } from '../../components/ReporteChat'
import { SelectorAlcance } from '../../components/SelectorAlcance'
import { Aparece, Icon, T } from '../../components/ui'
import { useAnimaciones, usePreferencias } from '../../context/PreferenciasContext'
import { useSesion } from '../../context/SesionContext'
import { TemaFijo, useTema } from '../../context/TemaContext'
import { useOperador } from '../../hooks/useOperador'
import * as agenteApi from '../../services/agente'
import * as organizacionesApi from '../../services/organizaciones'
import { useResolver } from '../alertas/HojaResolver'
import { puedeResolver } from '../alertas/AlertasScreen'
import { planDe, respuestaRapida, siguientes } from './proceso'
import { ConversacionesScreen } from './ConversacionesScreen'
import { ComparativaChat, GraficaChat } from './Piezas'
import { useDictado } from './dictado'
import { useVozNico } from './voz'
import { diaCorto, hora, miles, periodo } from '../../utils/formato'
import { UNIDAD, VARIABLE } from '../../utils/convertir'
import { font, marca } from '../../theme'

// Cara de Nico (recorte redondo con fondo transparente) para el avatar del encabezado y el saludo.
const CARA_NICO = require('../../../assets/nico-cara.png')

// Tarjetas de inicio (como en la web). Quienes generan reportes también pueden pedírselos al agente.
const SUGERENCIAS = [
  { icono: 'thermometer', titulo: 'Temperatura', texto: '¿Cómo está la temperatura ahora?' },
  { icono: 'droplets', titulo: 'Picos de humedad', texto: '¿Hubo picos de humedad hoy?' },
  { icono: 'wind', titulo: 'Calidad del aire', texto: '¿Cómo está la calidad del aire?' },
]
const SUGERENCIA_ALERTAS = { icono: 'bell', titulo: 'Alertas', texto: '¿Cuántas alertas hubo esta semana?' }
const SUGERENCIA_REPORTE = { icono: 'file-text', titulo: 'Reporte', texto: 'Genera el reporte de esta semana', destacada: true }
const ROLES_REPORTE = ['ADMIN', 'SUPER', 'ANALISTA']
// Conversaciones recientes: se guardan en el teléfono (las 50 últimas de la cuenta).
const MAX_CONVERSACIONES = 50
const claveConversaciones = (usuario) => `nucleo.conversaciones.${usuario}`
// Cada alcance tiene su propio hilo: no se mezclan las respuestas del dispositivo con las del área.
const claveDeConversacion = (conv) =>
  conv.alcance === 'AREA' ? `a:${conv.area ?? ''}` : conv.alcance === 'ORGANIZACION' ? 'org' : `d:${conv.dispositivo}`

// Nico AI en la app: hay un agente por dispositivo. El operador habla con el de su dispositivo;
// las demás cuentas lo eligen en un select. Solo aparece para las cuentas autorizadas.
// Con el teclado abierto el campo sube sobre él y la conversación se recorre al final.
export function AgenteScreen({ navigation }) {
  const { c } = useTema()
  const { usuario } = useSesion()
  const inset = useSafeAreaInsets()
  const hilo = useRef(null)
  const [elegido, setElegido] = useState(null)
  const [alcance, setAlcance] = useState('DISPOSITIVO')
  const [areaElegida, setAreaElegida] = useState(null)
  const [areas, setAreas] = useState([])
  const [texto, setTexto] = useState('')
  // Dictado por voz: `porVoz` indica que el texto del campo salió (al menos en parte) del
  // micrófono; si se envía así, Nico lee su respuesta en voz alta. Al terminar de hablar, el
  // mensaje se envía solo (`enviarDictado`).
  const voz = useVozNico()
  const porVoz = useRef(false)
  const enviarDictado = useRef(null)
  const dictado = useDictado({
    alTexto: (t) => {
      porVoz.current = true
      setTexto(t)
    },
    alTerminar: (t) => enviarDictado.current?.(t),
  })
  // «Leer respuestas»: Nico lee en voz alta también lo que contesta a mensajes escritos. Se consulta
  // al llegar cada respuesta, así activarlo no relee la última ni repite una ya leída.
  const { prefs, cambiar: cambiarPrefs } = usePreferencias()
  const leerSiempre = Boolean(prefs.leerRespuestas)
  const leerRef = useRef(leerSiempre)
  useEffect(() => {
    leerRef.current = leerSiempre
  }, [leerSiempre])
  const cambiarTexto = (t) => {
    if (!t.trim()) porVoz.current = false
    setTexto(t)
  }
  const [mensajes, setMensajes] = useState({})
  const [pensando, setPensando] = useState(false)
  const [sugerenciasInicio, setSugerenciasInicio] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const [verConversaciones, setVerConversaciones] = useState(false)
  // Conversación abierta por dispositivo (su id) y las guardadas.
  const [abierta, setAbierta] = useState({})
  const [guardadas, setGuardadas] = useState([])

  const [teclado, setTeclado] = useState(false)
  // Pasos que se muestran mientras responde (como en la web) y el que va.
  const [plan, setPlan] = useState(null)
  const [paso, setPaso] = useState(0)
  // Con el puente encendido, solo responde el agente cuyo ESP32 está conectado. El servidor
  // decide quién puede usarlo sin él (`disponibles`): el administrador, en modo de pruebas.
  const [puente, setPuente] = useState({ puente: false, activos: [], disponibles: [] })
  const { datos: op, refrescar } = useOperador()
  const dispositivos = op?.dispositivos ?? []
  const d = dispositivos.find((x) => x.num === elegido) ?? op?.dispositivo ?? dispositivos[0]
  const areaActual = areas.find((a) => a.num === areaElegida) ?? areas.find((a) => a.num === (usuario.area ?? d?.area)) ?? null
  const claveHilo = alcance === 'AREA' ? `a:${areaActual?.num ?? ''}` : alcance === 'ORGANIZACION' ? 'org' : `d:${d?.num ?? ''}`
  const lista = d ? (mensajes[claveHilo] ?? []) : []
  const porDispositivo = alcance === 'DISPOSITIVO'
  const enLinea = porDispositivo
    ? !puente.puente || (d && puente.activos.includes(d.num))
    : puente.disponible === true
  // `activo`: se puede preguntar. `modoPruebas`: el ESP32 está sin conexión pero el usuario
  // (administrador) puede usar a Nico igual; supervisores, analistas y operadores, no.
  const activo = porDispositivo
    ? enLinea || (d && (puente.disponibles ?? []).includes(d.num))
    : puente.disponible !== false
  const modoPruebas = Boolean(porDispositivo && activo && !enLinea)
  const motivo = puente.motivo || ''
  const nombreAlcance = alcance === 'AREA' ? areaActual?.nombre ?? 'tu área' : alcance === 'ORGANIZACION' ? 'toda la organización' : d?.nombre ?? 'tu dispositivo'
  const puedeOrganizacion = ['ADMIN', 'SUPER'].includes(usuario.rol)
  const horaActual = new Date().getHours()
  const saludo = `${horaActual < 12 ? 'Buenos días' : horaActual < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${usuario.nombre ?? 'equipo'}`
  const elegirAlcance = ({ alcance: nuevo, area, dispositivo }) => {
    setAlcance(nuevo)
    setAreaElegida(area ?? null)
    if (dispositivo) setElegido(dispositivo)
  }
  // Las sugerencias de `inicio` hablan del área del dispositivo: en otra área o en toda la
  // organización se usan las generales.
  const inicioAplica = porDispositivo || (alcance === 'AREA' && areaActual?.num === d?.area)
  const tarjetasInicio = inicioAplica && sugerenciasInicio?.length
    ? sugerenciasInicio
    : [...SUGERENCIAS, ROLES_REPORTE.includes(usuario.rol) ? SUGERENCIA_REPORTE : SUGERENCIA_ALERTAS]

  useEffect(() => {
    if (usuario.rol === 'OPER') return undefined
    let vivo = true
    organizacionesApi.areas().then((r) => vivo && setAreas(r?.results ?? r ?? [])).catch(() => {})
    return () => {
      vivo = false
    }
  }, [usuario.rol])

  useEffect(() => {
    let vivo = true
    const leer = () =>
      agenteApi
        .estado({ alcance, area: areaActual?.num ?? null })
        .then((r) => vivo && setPuente(r))
        .catch(() => {})
    leer()
    const t = setInterval(leer, 15000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [alcance, areaActual?.num])

  useEffect(() => {
    if (!d?.num) {
      setSugerenciasInicio(null)
      return undefined
    }
    let vivo = true
    agenteApi.sugerencias(d.num).then((r) => vivo && setSugerenciasInicio(r.inicio ?? null)).catch(() => {})
    return () => {
      vivo = false
    }
  }, [d?.num])

  useEffect(() => {
    AsyncStorage.getItem(claveConversaciones(usuario.num))
      .then((t) => t && setGuardadas(JSON.parse(t)))
      .catch(() => {})
  }, [usuario.num])

  // Cada respuesta guarda la conversación abierta (su título es la primera pregunta).
  const guardar = (clave, lista_) => {
    if (!lista_.length || !d) return
    const id = abierta[clave] ?? `${clave.replace(':', '-')}-${Date.now()}`
    if (!abierta[clave]) setAbierta((x) => ({ ...x, [clave]: id }))
    setGuardadas((todas) => {
      const conv = { id, dispositivo: d.num, dispositivo_nombre: d.nombre, alcance, area: areaActual?.num ?? null, area_nombre: areaActual?.nombre ?? '', titulo: lista_.find((m) => m.de === 'yo')?.texto ?? 'Conversación', fecha: new Date().toISOString(), mensajes: lista_ }
      const nuevas = [conv, ...todas.filter((x) => x.id !== id)].slice(0, MAX_CONVERSACIONES)
      AsyncStorage.setItem(claveConversaciones(usuario.num), JSON.stringify(nuevas)).catch(() => {})
      return nuevas
    })
  }
  useEffect(() => {
    if (d && !pensando && lista.length && lista.at(-1).de !== 'yo') guardar(claveHilo, lista)
    // Solo al terminar cada respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.length, pensando])

  const actualizarGuardadas = (fn) => {
    setGuardadas((todas) => {
      const nuevas = fn(todas)
      AsyncStorage.setItem(claveConversaciones(usuario.num), JSON.stringify(nuevas)).catch(() => {})
      return nuevas
    })
  }
  const renombrarGuardada = (id, titulo) => {
    const limpio = String(titulo ?? '').trim().slice(0, 80)
    if (!limpio) return
    actualizarGuardadas((todas) => todas.map((c) => (c.id === id ? { ...c, titulo: limpio } : c)))
  }
  const borrarGuardada = (id) => {
    actualizarGuardadas((todas) => todas.filter((c) => c.id !== id))
  }

  const nuevaConversacion = () => {
    if (!d || pensando) return
    voz.callar()
    setMensajes((x) => ({ ...x, [claveHilo]: [] }))
    setAbierta((x) => ({ ...x, [claveHilo]: null }))
  }
  const abrirConversacion = (conv) => {
    setElegido(conv.dispositivo)
    setAlcance(conv.alcance ?? 'DISPOSITIVO')
    setAreaElegida(conv.area ?? null)
    const clave = claveDeConversacion({ ...conv, alcance: conv.alcance ?? 'DISPOSITIVO' })
    setMensajes((x) => ({ ...x, [clave]: conv.mensajes }))
    setAbierta((x) => ({ ...x, [clave]: conv.id }))
  }
  const recientes = guardadas
    .filter((x) => {
      const deAlcance = (x.alcance ?? 'DISPOSITIVO') === alcance
      const mismo = alcance === 'ORGANIZACION' || (alcance === 'AREA' ? x.area === areaActual?.num : x.dispositivo === d?.num)
      return deAlcance && mismo && x.id !== abierta[claveHilo]
    })
    .slice(0, 4)

  useEffect(() => {
    if (!plan) return undefined
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, plan.pasos.length - 1)), Math.max(260, plan.ms / plan.pasos.length))
    return () => clearInterval(t)
  }, [plan])

  useEffect(() => {
    hilo.current?.scrollToEnd({ animated: true })
  }, [lista.length, pensando, teclado])

  useEffect(() => {
    const abre = Keyboard.addListener('keyboardDidShow', () => setTeclado(true))
    const cierra = Keyboard.addListener('keyboardDidHide', () => setTeclado(false))
    return () => {
      abre.remove()
      cierra.remove()
    }
  }, [])

  const preguntar = async (pregunta, conVoz = false) => {
    const p = pregunta.trim()
    if (!p || pensando || !d || !activo) return
    dictado.cancelar()
    voz.callar()
    if (conVoz || leerRef.current) voz.preparar()
    porVoz.current = false
    const num = d.num
    const clave = claveHilo
    const agregar = (m) => setMensajes((x) => ({ ...x, [clave]: [...(x[clave] ?? []), m] }))
    const anteriores = (mensajes[clave] ?? []).filter((m) => m.de === 'yo')
    setTexto('')
    agregar({ de: 'yo', texto: p })
    // Saludos y ayuda se contestan en el teléfono, sin servidor.
    // Con un reporte preparado, «ok» o «cancela» los responde el servidor (confirma o descarta).
    const rapida = alcance === 'DISPOSITIVO' && !(mensajes[clave] ?? []).at(-1)?.accion
      ? respuestaRapida(p, { nombre: usuario.nombre?.split(' ')[0], dispositivo: d.nombre })
      : null
    if (rapida && !rapida.ir) {
      agregar({ de: 'agente', texto: rapida.texto, hora: hora(new Date().toISOString()) })
      if (conVoz || leerRef.current) voz.hablar(rapida.texto)
      return
    }
    const nuevo = planDe(p, nombreAlcance, anteriores.at(-1)?.texto ?? '')
    setPaso(0)
    setPlan(nuevo)
    setPensando(true)
    const pausa = new Promise((listo) => setTimeout(listo, nuevo.ms))
    try {
      const r = await agenteApi.preguntar(p, num, anteriores.at(-1)?.texto ?? '', { alcance, area: areaActual?.num ?? null })
      await pausa
      agregar({
        de: 'agente',
        texto: r.texto,
        reporte: r.reporte?.variables ? r.reporte : null,
        grafica: r.grafica ?? null,
        comparativa: r.comparativa ?? null,
        registro: r.registro,
        via: r.via,
        pasos: r.pasos ?? [],
        accion: r.accion ?? null,
        fuente: r.fuente ?? null,
        picos: r.picos ?? null,
        serie: r.serie ?? null,
        etiquetas: r.etiquetas ?? null,
        unidad: r.unidad ?? null,
        maximo: r.maximo ?? null,
        alertas: r.alertas ?? null,
        hora: hora(new Date().toISOString()),
      })
      if ((conVoz || leerRef.current) && r.texto) voz.hablar(r.texto)
    } catch (e) {
      await pausa
      if (e.datos?.inactivo)
        setPuente((x) => ({
          ...x,
          activos: x.activos.filter((n) => n !== num),
          disponibles: (x.disponibles ?? []).filter((n) => n !== num),
        }))
      agregar({
        de: 'error',
        texto: e.datos?.motivo || e.datos?.detail || (e.datos?.inactivo
          ? `Nico AI no está disponible: ${d.nombre} no está activo (su ESP32 no está conectado).`
          : e.status === 503
            ? 'El agente no está disponible por ahora.'
            : 'No se pudo obtener la respuesta.'),
      })
    } finally {
      setPensando(false)
      setPlan(null)
    }
  }
  // Lo dictado se envía con la versión actual de `preguntar` (dispositivo y conversación vigentes).
  useEffect(() => {
    enviarDictado.current = (t) => preguntar(t, true)
  })

  // 👍/👎: se guarda en el teléfono y en el servidor, donde Nico AI aprende de ellas.
  const calificar = (i, voto) => {
    const clave = claveHilo
    setMensajes((x) => ({ ...x, [clave]: (x[clave] ?? []).map((m, j) => (j === i ? { ...m, voto } : m)) }))
    const m = lista[i]
    if (m?.registro) agenteApi.calificar(m.registro, voto).catch(() => {})
  }

  const copiar = async (texto, i) => {
    try {
      await Clipboard.setStringAsync(texto)
      setCopiado(i)
      setTimeout(() => setCopiado((x) => (x === i ? null : x)), 1500)
    } catch {
      // Sin permiso de portapapeles no se copia.
    }
  }
  const regenerar = (i) => {
    const previa = lista.slice(0, i).findLast((m) => m.de === 'yo')
    if (previa) preguntar(previa.texto)
  }
  const verHistorico = (m) => {
    if (!m.fuente?.dispositivo) return
    navigation.navigate('Historico', {
      dispositivo: m.fuente.dispositivo,
      desde: m.fuente.desde,
      hasta: m.fuente.hasta,
    })
  }
  const paraHoja = (a) => {
    // La API manda el nombre de la variable («Humedad relativa», «Calidad del aire»).
    const nombreVar = String(a.variable ?? '').toLowerCase()
    const codigo = VARIABLE[a.variable] ? a.variable : Object.keys(VARIABLE).find(
      (k) => nombreVar.startsWith(VARIABLE[k].etiqueta.toLowerCase()) || nombreVar.startsWith(VARIABLE[k].corta.toLowerCase()),
    ) ?? a.variable_codigo ?? 'TEMP'
    return {
      ...a,
      variable: codigo,
      variable_nombre: a.variable_nombre ?? VARIABLE[codigo]?.etiqueta ?? String(a.variable),
      dispositivo_nombre: a.dispositivo_nombre ?? a.dispositivo ?? '',
      lectura_valor: a.lectura_valor ?? a.valor ?? 0,
      fecha_hora: a.fecha_hora ?? a.fecha,
      estado: a.estado ?? 'PENDIENTE',
      tipo: a.tipo ?? 'POR_ENCIMA',
    }
  }
  const resolver = useResolver((pedido, ok) => {
    refrescar()
    if (!ok) return
    const { a, accion } = pedido ?? {}
    if (!a || !d) return
    const estado = accion === 'atender' ? 'ATENDIDA' : 'DESCARTADA'
    setMensajes((x) => {
      const actuales = (x[claveHilo] ?? []).map((m) => m.alertas
        ? { ...m, alertas: m.alertas.map((al) => (al.num === a.num ? { ...al, estado } : al)) }
        : m)
      return {
        ...x,
        [claveHilo]: [...actuales, { de: 'agente', texto: `Listo, la alerta de ${a.variable_nombre} en ${a.dispositivo_nombre} quedó ${estado === 'ATENDIDA' ? 'atendida' : 'descartada'}.`, hora: hora(new Date().toISOString()) }],
      }
    })
  })

  const ultimo = lista.at(-1)
  const sugerencias =
    ultimo?.de === 'agente' && !pensando && activo
      ? siguientes(lista.filter((m) => m.de === 'yo').at(-1)?.texto ?? '', {
          reporte: ROLES_REPORTE.includes(usuario.rol),
          hechas: lista.filter((m) => m.de === 'yo').map((m) => m.texto),
          tema: ultimo.accion ? 'ACCION' : ultimo.reporte ? 'REPORTE' : undefined,
        })
      : []

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: marca.tinta }} behavior="padding">
      <StatusBar style="light" />
      <TemaFijo tema="dark">
        <View style={[s.zona, { paddingTop: inset.top + 16 }]}>
          <View style={s.fila12}>
            <View style={s.marca}>
              <Image source={CARA_NICO} style={s.cara} accessibilityIgnoresInvertColors />
            </View>
            <View style={{ flex: 1 }}>
              <T peso={700} size={22} lh={28} style={{ letterSpacing: -0.5 }}>
                Nico AI
              </T>
              <T size={12} color={marca.tenue} numberOfLines={2}>
                {d ? `Responde con los datos de ${nombreAlcance}` : 'Cargando tu dispositivo…'}
              </T>
            </View>
            <Pressable
              onPress={() => setVerConversaciones(true)}
              accessibilityRole="button"
              accessibilityLabel="Conversaciones"
              hitSlop={6}
              style={({ pressed }) => [s.nueva, { backgroundColor: 'rgba(43,196,122,0.16)' }, pressed && { opacity: 0.6 }]}
            >
              <Icon name="history" size={18} color={marca.verde} />
            </Pressable>
            {lista.length > 0 && (
              <Pressable
                onPress={nuevaConversacion}
                disabled={pensando}
                accessibilityRole="button"
                accessibilityLabel="Nueva conversación"
                hitSlop={6}
                style={({ pressed }) => [s.nueva, (pressed || pensando) && { opacity: 0.6 }]}
              >
                <Icon name="square-pen" size={18} color={marca.tinta} />
              </Pressable>
            )}
          </View>
          {usuario.rol !== 'OPER' && !teclado && (dispositivos.length > 1 || areas.length > 0) && (
            <SelectorAlcance
              dispositivos={dispositivos}
              areas={areas}
              alcance={alcance}
              area={areaActual}
              valor={d?.num}
              onElegir={elegirAlcance}
              puedeOrganizacion={puedeOrganizacion}
            />
          )}
        </View>
      </TemaFijo>
      <View style={[s.hoja, { backgroundColor: c.background }]}>
        <ScrollView ref={hilo} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {lista.length === 0 && !pensando ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={s.insignia}>
                  <Image source={CARA_NICO} style={s.cara} accessibilityIgnoresInvertColors />
                </View>
                <T peso={800} size={24} lh={30} style={{ textAlign: 'center', letterSpacing: -0.6 }}>
                  {saludo}
                </T>
                <T size={14} lh={20} color={c.textMuted} style={{ textAlign: 'center' }}>
                  {d ? `Pregunta sobre lecturas, alertas y reportes de ${nombreAlcance}` : ' '}
                </T>
              </View>
              {porDispositivo && d && <ResumenInicio lecturas={op?.lecturas} alertas={op?.alertas} d={d} />}
              <View style={s.rejilla}>
                {tarjetasInicio.map((x, i) => (
                  <Aparece key={x.texto} indice={i} style={s.celda}>
                    <Pressable
                      onPress={() => preguntar(x.texto)}
                      accessibilityRole="button"
                      accessibilityLabel={x.texto}
                      style={({ pressed }) => [s.tarjeta, { backgroundColor: x.destacada ? marca.tinta : c.surface, borderColor: x.destacada ? marca.tinta : c.border }, pressed && { opacity: 0.75 }]}
                    >
                      <View style={[s.icono, { backgroundColor: x.destacada ? marca.verde : c.accentSoft }]}>
                        <Icon name={x.icono} size={15} color={x.destacada ? marca.tinta : c.success} />
                      </View>
                      <T peso={700} size={13} color={x.destacada ? marca.claro : undefined}>
                        {x.titulo}
                      </T>
                      <T size={12} lh={16} color={x.destacada ? marca.tenue : c.textMuted}>
                        {x.texto}
                      </T>
                    </Pressable>
                  </Aparece>
                ))}
              </View>
              {recientes.length > 0 && (
                <View style={{ gap: 8 }}>
                  <T mayus color={c.textMuted}>
                    Recientes
                  </T>
                  {recientes.map((conv) => (
                    <Pressable
                      key={conv.id}
                      onPress={() => abrirConversacion(conv)}
                      accessibilityRole="button"
                      style={({ pressed }) => [s.reciente, { backgroundColor: c.surface }, pressed && { opacity: 0.7 }]}
                    >
                      <Icon name="message-square" size={15} color={c.textMuted} />
                      <T peso={600} size={13} numberOfLines={1} style={{ flex: 1 }}>
                        {conv.titulo}
                      </T>
                      <T size={11} color={c.textMuted}>
                        {diaCorto(conv.fecha)}
                      </T>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            lista.map((m, i) =>
              m.de === 'yo' ? (
                <Aparece key={i} style={[s.mio, { backgroundColor: c.surfaceMuted }]}>
                  <T size={14} lh={21}>
                    {m.texto}
                  </T>
                </Aparece>
              ) : (
                <Aparece
                  key={i}
                  style={[s.suyo, (m.reporte || m.grafica || m.comparativa) && s.conReporte, { backgroundColor: c.surface, borderColor: m.de === 'error' ? c.danger : c.border }]}
                >
                  <T size={14} lh={21} color={m.de === 'error' ? c.danger : undefined}>
                    {m.texto}
                  </T>
                  {m.reporte && <ReporteChat r={m.reporte} />}
                  {m.grafica && <GraficaChat g={m.grafica} />}
                  {m.comparativa && <ComparativaChat c={m.comparativa} />}
                  {m.pasos?.length > 0 && <Pasos pasos={m.pasos} />}
                  {m.hora && (
                    <T size={11} color={c.textMuted}>
                      {`Nico AI · ${alcance === 'AREA' ? areaActual?.nombre ?? 'Área' : alcance === 'ORGANIZACION' ? 'Toda la organización' : d?.nombre} · ${m.hora}`}
                    </T>
                  )}
                  <FuenteRespuesta m={m} />
                  {m.alertas?.length > 0 && (
                    <View style={{ gap: 6 }}>
                      {m.alertas.map((a) => (
                        <View key={a.num} style={[s.alerta, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <T peso={700} size={12} numberOfLines={2}>{`${a.variable_nombre ?? a.variable} · ${a.dispositivo ?? a.dispositivo_nombre}`}</T>
                            <T size={11} color={c.textMuted} numberOfLines={1}>
                              {[
                                a.nivel === 'PELIGRO' ? 'Peligro' : 'Advertencia',
                                a.valor != null ? `${Number(a.valor).toFixed(1)} ${a.unidad ?? ''}`.trim() : null,
                                hora(a.fecha ?? a.fecha_hora),
                                { ATENDIDA: 'Atendida', DESCARTADA: 'Descartada' }[a.estado],
                              ].filter(Boolean).join(' · ')}
                            </T>
                          </View>
                          {(a.estado ?? 'PENDIENTE') === 'PENDIENTE' && puedeResolver(usuario) && (
                            <View style={s.alertaBotones}>
                              <Pressable accessibilityRole="button" onPress={() => resolver.abrir(paraHoja(a), 'atender')} style={[s.alertaBoton, { borderColor: c.accent }]}>
                                <T size={11} peso={700} color={c.accent}>Atender</T>
                              </Pressable>
                              <Pressable accessibilityRole="button" onPress={() => resolver.abrir(paraHoja(a), 'descartar')} style={[s.alertaBoton, { borderColor: c.border }]}>
                                <T size={11} peso={700} color={c.textSecondary}>Descartar</T>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                  {m.de === 'agente' && (
                    <>
                      {(m.via === 'IA' || m.via === 'ENRUTADA' || m.via === 'BANCO') && (
                        <View style={s.viaFila}>
                          <T size={11} peso={600} color={c.accent} style={[s.via, { backgroundColor: c.accentSoft }]}>
                            {m.via === 'IA' ? 'Redactada con IA' : m.via === 'ENRUTADA' ? 'Interpretada con IA' : 'Aprendida de tus reacciones'}
                          </T>
                        </View>
                      )}
                      <View style={s.acciones}>
                        <Pressable accessibilityRole="button" accessibilityLabel={copiado === i ? 'Copiado' : 'Copiar respuesta'} hitSlop={8} onPress={() => copiar(m.texto, i)} style={s.voto}>
                          <Icon name={copiado === i ? 'check' : 'copy'} size={15} color={copiado === i ? c.accent : c.textMuted} />
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel="Volver a generar" hitSlop={8} onPress={() => regenerar(i)} style={s.voto}>
                          <Icon name="rotate-ccw" size={15} color={c.textMuted} />
                        </Pressable>
                        {[
                          ['si', 'thumbs-up', 'Buena respuesta'],
                          ['no', 'thumbs-down', 'Mala respuesta'],
                        ].map(([v, icono, etiqueta]) => (
                          <Pressable
                            key={v}
                            accessibilityRole="button"
                            accessibilityLabel={etiqueta}
                            accessibilityState={{ selected: m.voto === v, disabled: Boolean(m.voto) }}
                            disabled={Boolean(m.voto)}
                            hitSlop={8}
                            onPress={() => calificar(i, v)}
                            style={[s.voto, m.voto === v && { backgroundColor: c.accentSoft }]}
                          >
                            <Icon name={icono} size={15} color={m.voto === v ? c.accent : c.textMuted} />
                          </Pressable>
                        ))}
                        {m.fuente?.dispositivo && m.fuente?.desde && (
                          <>
                            <View style={[s.accionDivisor, { backgroundColor: c.border }]} />
                            <Pressable accessibilityRole="button" onPress={() => verHistorico(m)} style={s.accionTexto}>
                              <Icon name="history" size={13} color={c.textSecondary} />
                              <T size={11} peso={700} color={c.textSecondary}>Ver en Histórico</T>
                            </Pressable>
                          </>
                        )}
                      </View>
                      {copiado === i && <T size={10} color={c.accent}>Copiado</T>}
                      {m.voto && <T size={10} color={c.textMuted}>La mejora de Nico AI se basa en tus reacciones.</T>}
                    </>
                  )}
                </Aparece>
              ),
            )
          )}
          {pensando && (
            <Aparece style={[s.suyo, s.fila12, { backgroundColor: c.surface, borderColor: c.border }]}>
              <ActivityIndicator size="small" color={c.textSecondary} />
              <T size={13} color={c.textMuted}>
                {plan ? `${plan.pasos[paso]}…` : 'Consultando las lecturas…'}
              </T>
            </Aparece>
          )}
        </ScrollView>
        {sugerencias.length > 0 && !teclado && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.seguir} keyboardShouldPersistTaps="handled">
            {sugerencias.map((x) => (
              <Pressable
                key={x.texto}
                onPress={() => preguntar(x.texto)}
                style={({ pressed }) => [s.chip, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.7 }]}
              >
                <Icon name={x.icono} size={13} color={c.accent} />
                <T size={13}>{x.texto}</T>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {dictado.error && (
          <View style={[s.aviso, { backgroundColor: c.dangerSoft }]} accessibilityRole="alert">
            <Icon name="mic-off" size={15} color={c.danger} />
            <T size={12} lh={17} style={{ flex: 1 }}>
              {dictado.error.texto}
            </T>
            {dictado.error.ajustes && (
              <Pressable onPress={() => Linking.openSettings().catch(() => {})} accessibilityRole="button" hitSlop={6}>
                <T size={12} peso={700} color={c.accent}>
                  Ajustes
                </T>
              </Pressable>
            )}
            <Pressable onPress={dictado.limpiarError} accessibilityRole="button" accessibilityLabel="Cerrar aviso" hitSlop={8}>
              <Icon name="x" size={15} color={c.textMuted} />
            </Pressable>
          </View>
        )}
        {!activo && motivo ? (
          <View style={[s.aviso, { backgroundColor: c.warningSoft }]} accessibilityRole="alert">
            <Icon name="triangle-alert" size={15} color={c.warning} />
            <T size={12} lh={17} color={c.warning} style={{ flex: 1 }}>{motivo}</T>
          </View>
        ) : null}
        {modoPruebas && (
          <View style={s.pruebas} accessibilityLabel={`${d.nombre}: ESP32 sin conexión, modo de pruebas del administrador`}>
            <Icon name="wifi-off" size={13} color={c.textMuted} />
            <T size={12} color={c.textMuted}>
              ESP32 sin conexión · modo de pruebas del administrador
            </T>
          </View>
        )}
        <View
          style={[
            s.compositor,
            { backgroundColor: c.surface, borderColor: dictado.escuchando ? c.accent : c.border, marginBottom: teclado ? 10 : 104 + inset.bottom },
          ]}
        >
          <TextInput
            value={texto}
            onChangeText={cambiarTexto}
            placeholder={
              !activo ? 'Nico AI no disponible para este alcance' : dictado.escuchando ? 'Te escucho… habla ahora' : `Pregunta sobre ${nombreAlcance}…`
            }
            placeholderTextColor={c.textMuted}
            style={[s.entrada, { color: c.textPrimary, fontFamily: font[500] }]}
            multiline
            editable={!!d && activo}
            onSubmitEditing={() => preguntar(texto, porVoz.current)}
          />
          {voz.hablando && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Callar a Nico"
              onPress={voz.callar}
              style={({ pressed }) => [s.enviar, { backgroundColor: c.accentSoft }, pressed && { opacity: 0.7 }]}
            >
              <Icon name="volume-x" size={18} color={c.accent} />
            </Pressable>
          )}
          {!voz.hablando && (
            <BotonLeer
              activo={leerSiempre}
              alTocar={() => cambiarPrefs({ leerRespuestas: !leerSiempre })}
            />
          )}
          {dictado.soportado && (
            <BotonMicrofono
              escuchando={dictado.escuchando}
              deshabilitado={pensando || !d || !activo}
              alTocar={() => {
                if (dictado.escuchando) return dictado.detener()
                voz.callar()
                // Quien dicta casi siempre espera la respuesta en voz: la voz se va cargando.
                voz.preparar()
                dictado.iniciar(texto)
              }}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar pregunta"
            disabled={!texto.trim() || pensando || !d || !activo}
            onPress={() => preguntar(texto, porVoz.current)}
            style={[s.enviar, { backgroundColor: texto.trim() && !pensando ? c.accent : c.surfaceMuted }]}
          >
            <Icon name="send" size={18} color={texto.trim() && !pensando ? c.accentContrast : c.textMuted} />
          </Pressable>
        </View>
      </View>
      {resolver.hoja}
      <ConversacionesScreen
        visible={verConversaciones}
        conversaciones={guardadas}
        onCerrar={() => setVerConversaciones(false)}
        onAbrir={abrirConversacion}
        onRenombrar={renombrarGuardada}
        onBorrar={borrarGuardada}
      />
    </KeyboardAvoidingView>
  )
}

// Resumen compacto del inicio, solo con alcance de dispositivo.
function ResumenInicio({ lecturas, alertas, d }) {
  const { c } = useTema()
  const ultimas = ['TEMP', 'HUM', 'AIRE'].map((v) => [v, (lecturas ?? []).find((l) => l.variable === v)])
  const pendientes = (alertas ?? []).filter((a) => a.dispositivo === d.num && a.estado === 'PENDIENTE').length
  const estado = { LINEA: 'En línea', SINCONEX: 'Sin conexión', CALENT: 'Calentando' }[d.estado_dispositivo] ?? 'Sin conexión'
  return (
    <View style={{ gap: 8 }} accessibilityLabel="Resumen del equipo">
      <View style={[s.resumen, { backgroundColor: c.surface, borderColor: c.border }]}>
        <T mayus color={c.textMuted} size={10}>Últimas lecturas</T>
        {ultimas.some(([, l]) => l) ? (
          <View style={s.resumenFila}>
            {ultimas.map(([v, l]) => (
              <View key={v} style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <T size={10} color={c.textMuted}>{VARIABLE[v].corta}</T>
                <T peso={700} size={14} num numberOfLines={1}>
                  {l ? `${Number(l.valor).toFixed(VARIABLE[v].decimales)} ${UNIDAD[v]}` : '—'}
                </T>
                <T size={10} color={c.textMuted}>{l ? hora(l.fecha_hora) : 'Sin lectura'}</T>
              </View>
            ))}
          </View>
        ) : (
          <T peso={700} size={13} color={c.textMuted}>Sin lecturas recientes</T>
        )}
      </View>
      <View style={s.resumenFila}>
        <View style={[s.resumenMitad, { backgroundColor: c.surface, borderColor: c.border }]}>
          <T mayus color={c.textMuted} size={10}>Pendientes · este dispositivo</T>
          <T peso={800} size={20} num>{pendientes}</T>
        </View>
        <View style={[s.resumenMitad, { backgroundColor: c.surface, borderColor: c.border }]}>
          <T mayus color={c.textMuted} size={10}>Conexión</T>
          <T peso={800} size={15} color={estado === 'En línea' ? c.success : c.warning} numberOfLines={1}>{estado}</T>
        </View>
      </View>
    </View>
  )
}

// «Leer respuestas»: con la bocina encendida, Nico lee en voz alta también lo que contesta a los
// mensajes escritos (a los dictados siempre contesta con voz).
function BotonLeer({ activo, alTocar }) {
  const { c } = useTema()
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Leer las respuestas en voz alta"
      accessibilityHint={activo ? 'Nico lee todas sus respuestas. Toca para desactivarlo.' : 'A los mensajes de voz siempre contesta con voz.'}
      accessibilityState={{ checked: activo }}
      onPress={alTocar}
      hitSlop={4}
      style={({ pressed }) => [
        s.enviar,
        activo ? { backgroundColor: c.accentSoft } : { borderWidth: 1, borderColor: c.border },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Icon name={activo ? 'volume-2' : 'volume-x'} size={18} color={activo ? c.accent : c.textSecondary} />
    </Pressable>
  )
}

// Micrófono a la izquierda de enviar: al escuchar se pinta de acento con un halo que late
// (fijo si está activada «Reducir animaciones» o el ajuste equivalente del teléfono).
function BotonMicrofono({ escuchando, deshabilitado, alTocar }) {
  const { c } = useTema()
  const animar = useAnimaciones()
  const [p] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (!escuchando || !animar) return undefined
    p.setValue(0)
    const ciclo = Animated.loop(Animated.timing(p, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }))
    ciclo.start()
    return () => ciclo.stop()
  }, [escuchando, animar, p])
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={escuchando ? 'Dejar de escuchar' : 'Dictar por voz'}
      accessibilityState={{ selected: escuchando, disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={alTocar}
      style={({ pressed }) => [
        s.enviar,
        escuchando ? { backgroundColor: c.accent } : { borderWidth: 1, borderColor: c.border },
        (pressed || deshabilitado) && { opacity: deshabilitado ? 0.45 : 0.75 },
      ]}
    >
      {escuchando && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.halo,
            { borderColor: c.accent },
            animar
              ? {
                  opacity: p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0, 0] }),
                  transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
                }
              : { opacity: 0.35, transform: [{ scale: 1.15 }] },
          ]}
        />
      )}
      <Icon name="mic" size={18} color={escuchando ? c.accentContrast : c.textSecondary} />
    </Pressable>
  )
}

// Fila única «Basado en»: lecturas y rango primero, luego promedios y umbral si vienen.
function FuenteRespuesta({ m }) {
  const { c } = useTema()
  // `fuente` puede venir vacía ({}) cuando no hubo lecturas: entonces no hay chip.
  const fuente = m.fuente?.lecturas != null ? m.fuente : null
  if (!fuente && !m.picos) return null
  return (
    <View style={s.fuenteFila} accessibilityLabel="Basado en">
      <T size={11} color={c.textMuted}>Basado en</T>
      {fuente && (
        <View style={[s.fuenteChip, { backgroundColor: c.surfaceMuted }]}>
          <Icon name="activity" size={11} color={c.textSecondary} />
          <T size={11} peso={600} color={c.textSecondary} numberOfLines={1}>
            {`${miles(fuente.lecturas)} lecturas · ${periodo(fuente.desde, fuente.hasta)}${fuente.alcance ? ` · ${fuente.alcance}` : ''}`}
          </T>
        </View>
      )}
      {m.picos && (
        <View style={[s.fuenteChip, { backgroundColor: c.surfaceMuted }]}>
          <T size={11} peso={600} color={c.textSecondary}>
            {`${m.serie?.length ?? m.picos.length} ${m.etiquetas ? 'máximos diarios' : 'promedios'}`}
          </T>
        </View>
      )}
      {m.picos && m.maximo != null && (
        <View style={[s.fuenteChip, { backgroundColor: c.surfaceMuted }]}>
          <T size={11} peso={600} color={c.textSecondary} numberOfLines={1}>
            {`Umbral máx ${m.maximo} ${m.unidad ?? ''}`}
          </T>
        </View>
      )}
    </View>
  )
}

// «Cómo lo resolví»: pasos reales que siguió el agente (los arma el backend), plegados.
function Pasos({ pasos }) {
  const { c } = useTema()
  const [abierto, setAbierto] = useState(false)
  return (
    <View style={{ marginTop: 6 }}>
      <Pressable hitSlop={6} onPress={() => setAbierto((x) => !x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={abierto ? 'chevron-down' : 'chevron-right'} size={13} color={c.textMuted} />
        <T size={12} color={c.textMuted}>
          Cómo lo resolví
        </T>
      </Pressable>
      {abierto &&
        pasos.map((p, i) => (
          <T key={p} size={12} lh={18} color={c.textMuted} style={{ paddingLeft: 17 }}>
            {`${i + 1}. ${p}`}
          </T>
        ))}
    </View>
  )
}

const s = StyleSheet.create({
  zona: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  fila12: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  marca: { width: 44, height: 44, borderRadius: 22, padding: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(43,196,122,0.14)' },
  cara: { width: '100%', height: '100%', borderRadius: 999 },
  hoja: { flex: 1, marginTop: -4, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  nueva: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: marca.verde },
  insignia: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: marca.tinta, borderWidth: 4, borderColor: 'rgba(43,196,122,0.22)' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  celda: { width: '48.5%' },
  tarjeta: { gap: 6, padding: 12, borderRadius: 18, borderWidth: 1, minHeight: 112 },
  icono: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  reciente: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  mio: { alignSelf: 'flex-end', maxWidth: '85%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderBottomRightRadius: 6 },
  conReporte: { alignSelf: 'stretch', maxWidth: '100%' },
  suyo: { alignSelf: 'flex-start', maxWidth: '90%', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, borderBottomLeftRadius: 6, borderWidth: 1 },
  compositor: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 16, padding: 6, paddingLeft: 16, borderRadius: 26, borderWidth: 1 },
  entrada: { flex: 1, minHeight: 40, maxHeight: 110, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  acciones: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 4, marginTop: 2 },
  accionTexto: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, height: 30 },
  accionDivisor: { width: 1, height: 18, marginHorizontal: 3 },
  viaFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  fuenteFila: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 2 },
  fuenteChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, maxWidth: '100%' },
  alerta: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, borderWidth: 1 },
  alertaBotones: { flexDirection: 'row', gap: 4 },
  alertaBoton: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  resumen: { gap: 7, padding: 12, borderRadius: 16, borderWidth: 1 },
  resumenFila: { flexDirection: 'row', gap: 8 },
  resumenMitad: { flex: 1, minWidth: 0, gap: 3, padding: 10, borderRadius: 14, borderWidth: 1 },
  voto: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  via: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  seguir: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  enviar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  pruebas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginBottom: 6 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
})
