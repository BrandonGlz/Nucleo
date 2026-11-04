import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

// Medidor circular de 270° (la pieza conic-gradient del diseño): pista tenue y avance en color.
function arco(cx, cy, r, a0, a1) {
  const punto = (a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)]
  const [x0, y0] = punto(a0)
  const [x1, y1] = punto(a1)
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

export function Medidor({ size = 236, grosor = 18, avance = 0, color, children }) {
  const r = (size - grosor) / 2
  const c = size / 2
  const fin = 225 + 270 * Math.max(0.001, Math.min(1, avance))
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Path d={arco(c, c, r, 225, 495)} stroke="rgba(243,245,242,0.1)" strokeWidth={grosor} fill="none" />
        <Path d={arco(c, c, r, 225, fin)} stroke={color} strokeWidth={grosor} fill="none" />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {children}
      </View>
    </View>
  )
}
