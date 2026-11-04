import { createContext, useContext, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import { colors } from '../theme'

const TemaContext = createContext(null)

// El tema sigue al sistema; el Perfil puede fijarlo en claro u oscuro mientras la app está abierta.
export function TemaProvider({ children }) {
  const sistema = useColorScheme()
  const [elegido, setTema] = useState(null)
  const tema = elegido ?? (sistema === 'dark' ? 'dark' : 'light')
  const valor = useMemo(() => ({ tema, c: colors[tema], oscuro: tema === 'dark', setTema }), [tema])
  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>
}

export const useTema = () => useContext(TemaContext)

// Fija un tema para una parte de la pantalla (la zona oscura, los mosaicos lima), como
// data-theme en la web, sin cambiar el de la app.
export function TemaFijo({ tema, children }) {
  const padre = useContext(TemaContext)
  const valor = useMemo(() => ({ ...padre, c: colors[tema], oscuro: tema === 'dark' }), [padre, tema])
  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>
}
