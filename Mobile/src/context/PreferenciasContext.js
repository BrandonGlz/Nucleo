import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const CLAVE = 'nucleo.preferencias'
// tema: null sigue al sistema. bajoConsumo consulta la API con menos frecuencia y sin canal en vivo.
export const PREFERENCIAS = { bajoConsumo: false, push: true, sonido: true, tema: null }

const PreferenciasContext = createContext({ prefs: PREFERENCIAS, cambiar: () => {}, listas: true })

// Preferencias del teléfono: se guardan en el dispositivo y sobreviven al cierre de la app.
export function PreferenciasProvider({ children }) {
  const [prefs, setPrefs] = useState(PREFERENCIAS)
  const [listas, setListas] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((texto) => texto && setPrefs({ ...PREFERENCIAS, ...JSON.parse(texto) }))
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
