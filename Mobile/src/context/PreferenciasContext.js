import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

const CLAVE = 'nucleo.preferencias'
// tema: null sigue al sistema. reducirAnimaciones quita los movimientos de pantallas, pestañas y menús.
export const PREFERENCIAS = { reducirAnimaciones: false, push: true, sonido: true, tema: null }

const PreferenciasContext = createContext({ prefs: PREFERENCIAS, cambiar: () => {}, listas: true })

// Preferencias del teléfono: se guardan en el dispositivo y sobreviven al cierre de la app.
export function PreferenciasProvider({ children }) {
  const [prefs, setPrefs] = useState(PREFERENCIAS)
  const [listas, setListas] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((texto) => {
        if (!texto) return
        const { bajoConsumo: _viejo, ...guardadas } = JSON.parse(texto) // preferencia que ya no existe
        setPrefs({ ...PREFERENCIAS, ...guardadas })
      })
      .catch(() => {})
      .finally(() => setListas(true))
  }, [])

  const cambiar = useCallback((parcial) => {
    setPrefs((actual) => {
      const nuevas = { ...actual, ...parcial }
      AsyncStorage.setItem(CLAVE, JSON.stringify(nuevas)).catch(() => {})
      return nuevas
    })
  }, [])

  const valor = useMemo(() => ({ prefs, cambiar, listas }), [prefs, cambiar, listas])
  return <PreferenciasContext.Provider value={valor}>{children}</PreferenciasContext.Provider>
}

export const usePreferencias = () => useContext(PreferenciasContext)

// true si la app debe animar: no está activada «Reducir animaciones» ni el ajuste del teléfono equivalente.
export function useAnimaciones() {
  const { prefs } = usePreferencias()
  const [sistema, setSistema] = useState(false)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSistema).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSistema)
    return () => sub.remove()
  }, [])
  return !prefs.reducirAnimaciones && !sistema
}
