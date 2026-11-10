import { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { colors } from '../theme'
import { usePreferencias } from './PreferenciasContext'

const TemaContext = createContext(null)

// El tema sigue al sistema hasta que el Perfil lo fija en claro u oscuro; la elección se guarda.
export function TemaProvider({ children }) {
  const sistema = useColorScheme()
  const { prefs, cambiar } = usePreferencias()
  const tema = prefs.tema ?? (sistema === 'dark' ? 'dark' : 'light')
  const valor = useMemo(
    () => ({ tema, c: colors[tema], oscuro: tema === 'dark', setTema: (t) => cambiar({ tema: t }) }),
    [tema, cambiar],
  )
  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>
}

export const useTema = () => useContext(TemaContext)

// Fija un tema para una parte de la pantalla (la zona oscura, los mosaicos verdes), como
// data-theme en la web, sin cambiar el de la app.
export function TemaFijo({ tema, children }) {
  const padre = useContext(TemaContext)
  const valor = useMemo(() => ({ ...padre, c: colors[tema], oscuro: tema === 'dark' }), [padre, tema])
  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>
}
