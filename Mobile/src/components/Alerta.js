import { View } from 'react-native'
import { useTema } from '../context/TemaContext'
import { Icon, T, tono } from './ui'

// Aviso en línea (nc-alert): ícono, título y texto opcional.
export function Alerta({ tono: t = 'neutral', icono, titulo, texto }) {
  const { c } = useTema()
  const [bg, fg] = tono(c, t)
  const ico = icono ?? { danger: 'octagon-alert', warning: 'triangle-alert', success: 'circle-check' }[t] ?? 'info'
  return (
    <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: bg }}>
      <Icon name={ico} size={18} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <T peso={600} size={14} lh={20} color={fg}>
          {titulo}
        </T>
        {texto ? (
          <T size={13} lh={18} color={c.textSecondary}>
            {texto}
          </T>
        ) : null}
      </View>
    </View>
  )
}
