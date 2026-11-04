import { Text } from 'react-native'
import { useTema } from '../../context/TemaContext'
import { font } from '../../theme'

// Texto con Plus Jakarta Sans. `peso` elige la familia (400–800); `color` por defecto es textPrimary.
// `num` usa cifras de ancho fijo y `mayus` el estilo de etiqueta (11 px, mayúsculas, espaciado).
export function T({ peso = 500, size = 14, lh, color, num, mayus, style, children, ...rest }) {
  const { c } = useTema()
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: font[peso], fontSize: size, color: color ?? c.textPrimary },
        lh != null && { lineHeight: lh },
        num && { fontVariant: ['tabular-nums'] },
        mayus && { fontSize: 11, lineHeight: 16, letterSpacing: 0.9, textTransform: 'uppercase', fontFamily: font[600] },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
