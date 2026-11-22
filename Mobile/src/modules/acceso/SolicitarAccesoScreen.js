import { useEffect, useState } from 'react'
import { Animated, Dimensions, Easing, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnimaciones } from '../../context/PreferenciasContext'
import { useTema } from '../../context/TemaContext'
import { Alerta } from '../../components/Alerta'
import { Button, Icon, Input, T } from '../../components/ui'
import * as solicitudes from '../../services/solicitudes'
import { radius } from '../../theme'
import { MarcoAcceso } from './MarcoAcceso'

const VACIO = { organizacion: '', area: '', nombre: '', primer_apellido: '', segundo_apellido: '', correo: '', sitio: '' }

// Sin sesión: la persona pide una cuenta para su organización y área, igual que /solicitar-acceso
// en la web. Nico avisa por correo a los administradores, que la dan de alta desde la web.
export function SolicitarAccesoScreen({ navigation }) {
  const [orgs, setOrgs] = useState(null)
  const [f, setF] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [estado, setEstado] = useState('inicio')
  const [aviso, setAviso] = useState(null)
  const [hoja, setHoja] = useState(null)

  useEffect(() => {
    solicitudes
      .opciones()
      .then(setOrgs)
      .catch(() => {
        setOrgs([])
        setAviso('No pudimos cargar las organizaciones. Intenta de nuevo en unos minutos.')
      })
  }, [])

  const org = orgs?.find((o) => String(o.num) === f.organizacion)
  const area = org?.areas.find((a) => String(a.num) === f.area)
  const campo = (k) => (valor) => {
    setF((prev) => ({ ...prev, [k]: valor, ...(k === 'organizacion' && valor !== prev.organizacion ? { area: '' } : {}) }))
    setErrores((prev) => ({ ...prev, [k]: undefined }))
  }
  const volver = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Acceso'))

  const validar = () => {
    const e = {}
    if (!f.organizacion) e.organizacion = 'Elige tu organización.'
    if (!f.area) e.area = 'Elige tu área.'
    if (!f.nombre.trim()) e.nombre = 'Escribe tu nombre.'
    if (!f.primer_apellido.trim()) e.primer_apellido = 'Escribe tu primer apellido.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim())) e.correo = 'Escribe un correo válido.'
    setErrores(e)
    return !Object.keys(e).length
  }

  const enviar = async () => {
    setAviso(null)
    if (!validar()) return
    setEstado('enviando')
    try {
      await solicitudes.solicitar({ ...f, organizacion: Number(f.organizacion), area: Number(f.area), correo: f.correo.trim() })
      setEstado('enviada')
    } catch (err) {
      setEstado('inicio')
      if (err.status === 429) setAviso('Ya enviaste varias solicitudes. Espera una hora e intenta de nuevo.')
      else if (err.status === 400 && err.datos) {
        const e = Object.fromEntries(Object.entries(err.datos).map(([k, v]) => [k, [].concat(v).join(' ')]))
        setErrores(e)
        // Errores que no son de un campo del formulario (non_field_errors, detail).
        const otros = Object.entries(e).filter(([k]) => !(k in VACIO) || k === 'sitio').map(([, v]) => v)
        if (otros.length) setAviso(otros.join(' '))
      } else setAviso('No pudimos conectar con Núcleo. Intenta de nuevo en unos minutos.')
    }
  }

  if (estado === 'enviada') {
    return (
      <MarcoAcceso>
        <Encabezado
          titulo="Solicitud enviada"
          texto={`Nico le avisó al administrador de ${org?.nombre ?? 'tu organización'}. Cuando apruebe tu cuenta, te llegará a ${f.correo.trim()} un correo de bienvenida con tus credenciales.`}
        />
        <Button size="lg" variant="secondary" icon="log-in" block onPress={volver}>
          Volver a iniciar sesión
        </Button>
      </MarcoAcceso>
    )
  }

  return (
    <MarcoAcceso>
      <Encabezado
        titulo="Solicita tu acceso"
        texto="Elige tu organización y tu área y escribe tus datos. El administrador revisará tu solicitud."
      />
      {aviso && <Alerta tono="danger" titulo={aviso} />}
      <View style={{ gap: 16 }}>
        <Selector
          label="Organización"
          icon="building-2"
          valor={org?.nombre}
          vacio={orgs ? 'Elige una organización' : 'Cargando…'}
          disabled={!orgs?.length}
          error={errores.organizacion}
          onPress={() => setHoja('organizacion')}
        />
        <Selector
          label="Área"
          icon="map-pin"
          valor={area?.nombre}
          vacio={org ? 'Elige un área' : 'Primero la organización'}
          disabled={!org}
          error={errores.area}
          onPress={() => setHoja('area')}
        />
        <Input label="Nombre" value={f.nombre} onChangeText={campo('nombre')} autoComplete="given-name" autoCapitalize="words" error={errores.nombre} />
        <Input
          label="Primer apellido"
          value={f.primer_apellido}
          onChangeText={campo('primer_apellido')}
          autoComplete="family-name"
          autoCapitalize="words"
          error={errores.primer_apellido}
        />
        <Input
          label="Segundo apellido (opcional)"
          value={f.segundo_apellido}
          onChangeText={campo('segundo_apellido')}
          autoCapitalize="words"
          error={errores.segundo_apellido}
        />
        <Input
          label="Correo"
          icon="mail"
          value={f.correo}
          onChangeText={campo('correo')}
          placeholder="nombre@empresa.mx"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          onSubmitEditing={enviar}
          error={errores.correo}
        />
        {/* Campo trampa para bots, como en la web: invisible y fuera del alcance de los lectores de pantalla. */}
        <TextInput
          value={f.sitio}
          onChangeText={campo('sitio')}
          autoComplete="off"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={s.trampa}
        />
      </View>
      <Button size="lg" icon="send" block disabled={estado === 'enviando' || !orgs} onPress={enviar}>
        {estado === 'enviando' ? 'Enviando…' : 'Enviar solicitud'}
      </Button>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={volver}>
        <T peso={600} size={14}>
          Volver a iniciar sesión
        </T>
      </Pressable>
      <HojaOpciones
        visible={hoja != null}
        titulo={hoja === 'area' ? 'Elige tu área' : 'Elige tu organización'}
        opciones={(hoja === 'area' ? org?.areas : orgs) ?? []}
        valor={hoja === 'area' ? f.area : f.organizacion}
        icono={hoja === 'area' ? 'map-pin' : 'building-2'}
        onElegir={(num) => campo(hoja)(String(num))}
        onCerrar={() => setHoja(null)}
      />
    </MarcoAcceso>
  )
}

function Encabezado({ titulo, texto }) {
  const { c } = useTema()
  return (
    <View style={{ gap: 8 }}>
      <T peso={700} size={30} lh={36} style={{ letterSpacing: -0.75 }}>
        {titulo}
      </T>
      <T size={15} lh={24} color={c.textSecondary}>
        {texto}
      </T>
    </View>
  )
}

// Campo tipo «select» con el mismo aspecto que Input: muestra lo elegido y abre la hoja de opciones.
function Selector({ label, icon, valor, vacio, disabled, error, onPress }) {
  const { c } = useTema()
  return (
    <View style={{ gap: 6 }}>
      <T peso={600} size={13} lh={18} color={c.textSecondary}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${valor ?? vacio}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          s.selector,
          { backgroundColor: c.surfaceMuted, borderColor: error ? c.danger : c.borderStrong, opacity: disabled ? 0.6 : pressed ? 0.85 : 1 },
        ]}
      >
        <Icon name={icon} size={18} color={c.textMuted} />
        <T size={15} color={valor ? c.textPrimary : c.textMuted} numberOfLines={1} style={{ flex: 1 }}>
          {valor ?? vacio}
        </T>
        <Icon name="chevron-down" size={18} color={c.textMuted} />
      </Pressable>
      {error ? (
        <View style={s.fila6}>
          <Icon name="circle-x" size={14} color={c.danger} />
          <T size={12} lh={16} color={c.danger} style={{ flex: 1 }}>
            {error}
          </T>
        </View>
      ) : null}
    </View>
  )
}

// Hoja que sube desde abajo con las opciones (como la de dispositivos); respeta «Reducir animaciones».
function HojaOpciones({ visible, titulo, opciones, valor, icono, onElegir, onCerrar }) {
  const { c } = useTema()
  const inset = useSafeAreaInsets()
  const animar = useAnimaciones()
  const [montada, setMontada] = useState(visible)
  const [p] = useState(() => new Animated.Value(0))
  if (visible && !montada) setMontada(true)
  useEffect(() => {
    if (!montada) return
    Animated.timing(p, {
      toValue: visible ? 1 : 0,
      duration: animar ? (visible ? 320 : 280) : 0,
      easing: visible ? Easing.bezier(0.2, 0, 0, 1) : Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(({ finished }) => finished && !visible && setMontada(false))
  }, [visible, montada, animar, p])
  const subida = p.interpolate({ inputRange: [0, 1], outputRange: [Dimensions.get('window').height * 0.6, 0] })
  return (
    <Modal visible={montada} transparent animationType="none" statusBarTranslucent onRequestClose={onCerrar}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: p }]}>
        <Pressable style={s.fondo} onPress={onCerrar} accessibilityLabel="Cerrar" />
      </Animated.View>
      <Animated.View style={[s.hoja, { backgroundColor: c.background, paddingBottom: 16 + inset.bottom, transform: [{ translateY: subida }] }]}>
        <View style={[s.asa, { backgroundColor: c.border }]} />
        <T peso={700} size={18} style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          {titulo}
        </T>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {opciones.map((o) => {
            const activa = String(o.num) === valor
            return (
              <Pressable
                key={o.num}
                accessibilityRole="button"
                accessibilityState={{ selected: activa }}
                onPress={() => {
                  onElegir(o.num)
                  onCerrar()
                }}
                style={({ pressed }) => [
                  s.opcion,
                  { backgroundColor: c.surface, borderColor: activa ? c.accent : c.border },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Icon name={icono} size={18} color={activa ? c.accent : c.textMuted} />
                <T peso={activa ? 700 : 500} size={15} style={{ flex: 1 }}>
                  {o.nombre}
                </T>
                {activa && <Icon name="check" size={18} color={c.accent} />}
              </Pressable>
            )
          })}
          {!opciones.length && (
            <T size={14} color={c.textMuted} style={{ paddingHorizontal: 4, paddingVertical: 12 }}>
              No hay opciones disponibles.
            </T>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const s = StyleSheet.create({
  selector: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingLeft: 16, paddingRight: 12, borderRadius: radius.sm, borderWidth: 1.5 },
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trampa: { position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  hoja: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 8 },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1.5 },
})
