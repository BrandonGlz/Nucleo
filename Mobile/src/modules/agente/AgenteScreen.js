import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ReporteChat } from '../../components/ReporteChat'
import { SelectorDispositivo } from '../../components/SelectorDispositivo'
import { Aparece, Icon, T } from '../../components/ui'
import { useSesion } from '../../context/SesionContext'
import { TemaFijo, useTema } from '../../context/TemaContext'
import { useOperador } from '../../hooks/useOperador'
import * as agenteApi from '../../services/agente'
import { planDe, respuestaRapida, siguientes } from './proceso'
import { ComparativaChat, GraficaChat } from './Piezas'
import { diaCorto, hora } from '../../utils/formato'
import { font, marca } from '../../theme'

// Tarjetas de inicio (como en la web). Quienes generan reportes también pueden pedírselos al agente.
const SUGERENCIAS = [
  { icono: 'thermometer', titulo: 'Temperatura', texto: '¿Cómo está la temperatura ahora?' },
  { icono: 'droplets', titulo: 'Picos de humedad', texto: '¿Hubo picos de humedad hoy?' },
  { icono: 'wind', titulo: 'Calidad del aire', texto: '¿Cómo está la calidad del aire?' },
]
const SUGERENCIA_ALERTAS = { icono: 'bell', titulo: 'Alertas', texto: '¿Cuántas alertas hubo esta semana?' }
const SUGERENCIA_REPORTE = { icono: 'file-text', titulo: 'Reporte', texto: 'Genera el reporte de esta semana', destacada: true }
const ROLES_REPORTE = ['ADMIN', 'SUPER', 'ANALISTA']
// Conversaciones recientes: se guardan en el teléfono (las 12 últimas de la cuenta).
const MAX_CONVERSACIONES = 12
const claveConversaciones = (usuario) => `nucleo.conversaciones.${usuario}`

// Nico AI en la app: hay un agente por dispositivo. El operador habla con el de su dispositivo;
// las demás cuentas lo eligen en un select. Solo aparece para las cuentas autorizadas.
// Con el teclado abierto el campo sube sobre él y la conversación se recorre al final.
export function AgenteScreen() {
  const { c } = useTema()
  const { usuario } = useSesion()
  const inset = useSafeAreaInsets()
  const hilo = useRef(null)
  const [elegido, setElegido] = useState(null)
  const [texto, setTexto] = useState('')
  const [mensajes, setMensajes] = useState({})
  const [pensando, setPensando] = useState(false)
  // Conversación abierta por dispositivo (su id) y las guardadas.
  const [abierta, setAbierta] = useState({})
  const [guardadas, setGuardadas] = useState([])

  const [teclado, setTeclado] = useState(false)
  // Pasos que se muestran mientras responde (como en la web) y el que va.
  const [plan, setPlan] = useState(null)
  const [paso, setPaso] = useState(0)
  // Con el puente encendido, solo responde el agente cuyo ESP32 está conectado.
  const [puente, setPuente] = useState({ puente: false, activos: [] })
  const { datos: op } = useOperador()
  const dispositivos = op?.dispositivos ?? []
  const d = dispositivos.find((x) => x.num === elegido) ?? op?.dispositivo ?? dispositivos[0]
  const lista = d ? (mensajes[d.num] ?? []) : []
  const activo = !puente.puente || (d && puente.activos.includes(d.num))

  useEffect(() => {
    let vivo = true
    const leer = () =>
      agenteApi
        .estado()
        .then((r) => vivo && setPuente(r))
        .catch(() => {})
    leer()
    const t = setInterval(leer, 15000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    AsyncStorage.getItem(claveConversaciones(usuario.num))
      .then((t) => t && setGuardadas(JSON.parse(t)))
      .catch(() => {})
  }, [usuario.num])

  // Cada respuesta guarda la conversación abierta (su título es la primera pregunta).
  const guardar = (num, lista_) => {
    if (!lista_.length) return
    const id = abierta[num] ?? `${num}-${Date.now()}`
    if (!abierta[num]) setAbierta((x) => ({ ...x, [num]: id }))
    setGuardadas((todas) => {
      const conv = { id, dispositivo: num, titulo: lista_.find((m) => m.de === 'yo')?.texto ?? 'Conversación', fecha: new Date().toISOString(), mensajes: lista_ }
      const nuevas = [conv, ...todas.filter((x) => x.id !== id)].slice(0, MAX_CONVERSACIONES)
      AsyncStorage.setItem(claveConversaciones(usuario.num), JSON.stringify(nuevas)).catch(() => {})
      return nuevas
    })
  }
  useEffect(() => {
    if (d && !pensando && lista.length && lista.at(-1).de !== 'yo') guardar(d.num, lista)
    // Solo al terminar cada respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.length, pensando])

  const nuevaConversacion = () => {
    if (!d || pensando) return
    setMensajes((x) => ({ ...x, [d.num]: [] }))
    setAbierta((x) => ({ ...x, [d.num]: null }))
  }
  const abrirConversacion = (conv) => {
    setElegido(conv.dispositivo)
    setMensajes((x) => ({ ...x, [conv.dispositivo]: conv.mensajes }))
    setAbierta((x) => ({ ...x, [conv.dispositivo]: conv.id }))
  }
  const recientes = guardadas.filter((x) => x.dispositivo === d?.num && x.id !== abierta[d?.num]).slice(0, 4)

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

  const preguntar = async (pregunta) => {
    const p = pregunta.trim()
    if (!p || pensando || !d || !activo) return
    const num = d.num
    const agregar = (m) => setMensajes((x) => ({ ...x, [num]: [...(x[num] ?? []), m] }))
    const anteriores = (mensajes[num] ?? []).filter((m) => m.de === 'yo')
    setTexto('')
    agregar({ de: 'yo', texto: p })
    // Saludos y ayuda se contestan en el teléfono, sin servidor.
    // Con un reporte preparado, «ok» o «cancela» los responde el servidor (confirma o descarta).
    const rapida = (mensajes[num] ?? []).at(-1)?.accion ? null : respuestaRapida(p, { nombre: usuario.nombre?.split(' ')[0], dispositivo: d.nombre })
    if (rapida && !rapida.ir) {
      agregar({ de: 'agente', texto: rapida.texto, hora: hora(new Date().toISOString()) })
      return
    }
    const nuevo = planDe(p, d.nombre, anteriores.at(-1)?.texto ?? '')
    setPaso(0)
    setPlan(nuevo)
    setPensando(true)
    const pausa = new Promise((listo) => setTimeout(listo, nuevo.ms))
    try {
      const r = await agenteApi.preguntar(p, num, anteriores.at(-1)?.texto ?? '')
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
        hora: hora(new Date().toISOString()),
      })
    } catch (e) {
      await pausa
      if (e.datos?.inactivo) setPuente((x) => ({ ...x, activos: x.activos.filter((n) => n !== num) }))
      agregar({
        de: 'error',
        texto: e.datos?.inactivo
          ? `Nico AI no está disponible: ${d.nombre} no está activo (su ESP32 no está conectado).`
          : e.status === 503
            ? 'El agente no está disponible por ahora.'
            : 'No se pudo obtener la respuesta.',
      })
    } finally {
      setPensando(false)
      setPlan(null)
    }
  }

  // 👍/👎: se guarda en el teléfono y en el servidor, donde Nico AI aprende de ellas.
  const calificar = (i, voto) => {
    const num = d.num
    setMensajes((x) => ({ ...x, [num]: x[num].map((m, j) => (j === i ? { ...m, voto } : m)) }))
    const m = lista[i]
    if (m?.registro) agenteApi.calificar(m.registro, voto).catch(() => {})
  }

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
              <Icon name="sparkles" size={20} color={marca.verde} />
            </View>
            <View style={{ flex: 1 }}>
              <T peso={700} size={22} lh={28} style={{ letterSpacing: -0.5 }}>
                Nico AI
              </T>
              <T size={12} color={marca.tenue}>
                {d ? `Responde con los datos de ${d.nombre}` : 'Cargando tu dispositivo…'}
              </T>
            </View>
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
          {dispositivos.length > 1 && !teclado && (
            <SelectorDispositivo dispositivos={dispositivos} valor={d?.num} onElegir={setElegido} etiqueta="Preguntar sobre" />
          )}
        </View>
      </TemaFijo>
      <View style={[s.hoja, { backgroundColor: c.background }]}>
        <ScrollView ref={hilo} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {lista.length === 0 && !pensando ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={s.insignia}>
                  <Icon name="sparkles" size={24} color={marca.verde} />
                </View>
                <T peso={800} size={24} lh={30} style={{ textAlign: 'center', letterSpacing: -0.6 }}>
                  Hola, <T peso={800} size={24} color={c.success}>{usuario.nombre}</T>
                </T>
                <T size={14} lh={20} color={c.textMuted} style={{ textAlign: 'center' }}>
                  {d ? `¿Qué quieres saber hoy de ${d.nombre}?` : ' '}
                </T>
              </View>
              <View style={s.rejilla}>
                {[...SUGERENCIAS, ROLES_REPORTE.includes(usuario.rol) ? SUGERENCIA_REPORTE : SUGERENCIA_ALERTAS].map((x, i) => (
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
                      {`Nico AI · ${d?.nombre} · ${m.hora}`}
                    </T>
                  )}
                  {m.de === 'agente' && (
                    <View style={s.acciones}>
                      {[
                        ['si', 'thumbs-up', 'Buena respuesta'],
                        ['no', 'thumbs-down', 'Mala respuesta'],
                      ].map(([v, icono, etiqueta]) => (
                        <Pressable
                          key={v}
                          accessibilityRole="button"
                          accessibilityLabel={etiqueta}
                          accessibilityState={{ selected: m.voto === v }}
                          hitSlop={8}
                          onPress={() => calificar(i, m.voto === v ? null : v)}
                          style={[s.voto, m.voto === v && { backgroundColor: c.accentSoft }]}
                        >
                          <Icon name={icono} size={15} color={m.voto === v ? c.accent : c.textMuted} />
                        </Pressable>
                      ))}
                      {m.via === 'IA' && <T size={11} peso={600} color={c.accent} style={[s.via, { backgroundColor: c.accentSoft }]}>Redactada con IA</T>}
                      {m.via === 'ENRUTADA' && (
                        <T size={11} peso={600} color={c.accent} style={[s.via, { backgroundColor: c.accentSoft }]}>
                          Interpretada con IA
                        </T>
                      )}
                      {m.via === 'BANCO' && (
                        <T size={11} peso={600} color={c.accent} style={[s.via, { backgroundColor: c.accentSoft }]}>
                          Aprendida de tus reacciones
                        </T>
                      )}
                      {i === lista.length - 1 && (
                        <T size={11} color={c.textMuted} style={{ flexBasis: '100%' }}>
                          {m.voto ? '¡Gracias! Nico AI mejora con tus reacciones.' : 'La mejora de Nico AI se basa en tus reacciones.'}
                        </T>
                      )}
                    </View>
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
        <View style={[s.compositor, { backgroundColor: c.surface, borderColor: c.border, marginBottom: teclado ? 10 : 104 + inset.bottom }]}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder={d && !activo ? `Nico AI no disponible: ${d.nombre} no está activo` : 'Pregunta sobre tu dispositivo…'}
            placeholderTextColor={c.textMuted}
            style={[s.entrada, { color: c.textPrimary, fontFamily: font[500] }]}
            multiline
            editable={!!d && activo}
            onSubmitEditing={() => preguntar(texto)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar pregunta"
            disabled={!texto.trim() || pensando || !d || !activo}
            onPress={() => preguntar(texto)}
            style={[s.enviar, { backgroundColor: texto.trim() && !pensando ? c.accent : c.surfaceMuted }]}
          >
            <Icon name="send" size={18} color={texto.trim() && !pensando ? c.accentContrast : c.textMuted} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  marca: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(43,196,122,0.14)' },
  hoja: { flex: 1, marginTop: -4, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  nueva: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: marca.verde },
  insignia: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: marca.tinta },
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
  acciones: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  voto: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  via: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  seguir: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  enviar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
