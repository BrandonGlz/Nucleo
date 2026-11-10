import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { AUTH_TELEFONO } from '../api'
import { UNIDAD, VARIABLE } from '../utils/convertir'
import { USAR_MOCKS, pedir } from './config'

// Canales de Android: el sonido se fija al crear el canal, así que hay uno con sonido (el que usan
// los push del backend, `alertas`) y otro sin sonido.
const CON_SONIDO = 'alertas'
const SIN_SONIDO = 'alertas-silencio'
const PLATAFORMA = Platform.OS === 'ios' ? 'IOS' : 'ANDROID'
// Proyecto de Expo con el que se emiten los tokens de push (EAS). Sin él, solo hay avisos locales.
const PROYECTO = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()

let preparado = false
let tokenActual = null
// Mientras el canal en vivo está abierto, él avisa de las alertas: el push que llegue a la vez
// se omite para no avisar dos veces.
let canalAbierto = false
export const marcarCanal = (abierto) => {
  canalAbierto = abierto
}

// Con la app abierta las notificaciones también se muestran, con su sonido si el canal lo tiene.
export async function preparar() {
  if (preparado || Platform.OS === 'web') return
  preparado = true
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const mostrar = !(canalAbierto && n.request.trigger?.type === 'push')
      return { shouldShowBanner: mostrar, shouldShowList: mostrar, shouldPlaySound: mostrar, shouldSetBadge: false }
    },
  })
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CON_SONIDO, {
      name: 'Alertas críticas',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
    })
    await Notifications.setNotificationChannelAsync(SIN_SONIDO, {
      name: 'Alertas',
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
    })
  }
}

export async function pedirPermiso() {
  if (Platform.OS === 'web') return false
  await preparar()
  const actual = await Notifications.getPermissionsAsync()
  if (actual.granted) return true
  if (!actual.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

// Token de Expo del teléfono, o null si no hay permiso, proyecto de EAS o servicio de push
// (por ejemplo, un APK sin Firebase). Nunca tarda más de 8 s para no frenar el inicio de sesión.
export async function tokenExpo() {
  if (USAR_MOCKS || !PROYECTO || Platform.OS === 'web') return null
  try {
    if (!(await pedirPermiso())) return null
    const token = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId: PROYECTO }).then((t) => t.data),
      new Promise((resolver) => setTimeout(() => resolver(null), 8000)),
    ])
    tokenActual = token
    return token
  } catch {
    return null
  }
}
export const telefono = (token) => (token ? { token_expo: token, plataforma: PLATAFORMA } : {})
export const tokenDeSesion = () => tokenActual
export const olvidarToken = () => {
  tokenActual = null
}

// Interruptor «Notificaciones push» del perfil: registra o quita el teléfono sin cerrar sesión.
export async function activarPush(activo) {
  if (activo) {
    const token = await tokenExpo()
    if (token) await pedir(AUTH_TELEFONO, { metodo: 'POST', cuerpo: telefono(token) }).catch(() => {})
    return
  }
  const token = tokenActual
  if (token) await pedir(AUTH_TELEFONO, { metodo: 'DELETE', cuerpo: { token_expo: token } }).catch(() => {})
}

// Aviso en el teléfono de una alerta que llega por el canal en vivo. Las de peligro suenan y vibran
// si el perfil lo permite; las de advertencia, sin sonido.
export async function avisarAlerta(alerta, { sonido }) {
  if (Platform.OS === 'web' || !(await pedirPermiso())) return
  const peligro = alerta.nivel === 'PELIGRO'
  const sentido = alerta.tipo === 'POR_ENCIMA' ? 'por encima' : 'por debajo'
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${peligro ? 'Peligro' : 'Advertencia'}: ${VARIABLE[alerta.variable]?.etiqueta ?? alerta.variable} ${sentido} del límite`,
      body: `${alerta.dispositivo_nombre}: ${Number(alerta.valor)} ${UNIDAD[alerta.variable] ?? ''}`.trim(),
      data: { alerta: alerta.num },
      sound: peligro && sonido ? 'default' : undefined,
    },
    trigger: Platform.OS === 'android' ? { channelId: peligro && sonido ? CON_SONIDO : SIN_SONIDO } : null,
  })
}

// Al tocar una notificación (local o push) se abre el detalle de la alerta.
export function alTocar(abrir) {
  if (Platform.OS === 'web') return () => {}
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const num = r.notification.request.content.data?.alerta
    if (num) abrir(Number(num))
  })
  return () => sub.remove()
}
