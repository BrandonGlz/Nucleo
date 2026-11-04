import { Pressable, StyleSheet, View } from 'react-native'
import { useTema } from '../../context/TemaContext'
import { Icon } from './Icon'
import { T } from './Texto'

// Barra flotante oscura de pestañas. items: [{ id, label, icon, count }]; la activa muestra su etiqueta.
export function TabBar({ items, active, onChange }) {
  const { c } = useTema()
  return (
    <View style={[s.barra, { backgroundColor: c.sidebar, borderColor: c.border }]}>
      {items.map((it) => {
        const activo = it.id === active
        const color = activo ? c.accentContrast : c.sidebarTextMuted
        return (
          <Pressable
            key={it.id}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: activo }}
            onPress={() => onChange?.(it.id)}
            style={[s.item, activo && { backgroundColor: c.accent, paddingLeft: 14, paddingRight: 18 }]}
          >
            <View>
              <Icon name={it.icon} size={22} color={color} />
              {it.count ? <View style={[s.punto, { backgroundColor: c.danger, borderColor: c.sidebar }]} /> : null}
            </View>
            {activo && (
              <T peso={700} size={14} color={color}>
                {it.label}
              </T>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  barra: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, padding: 8,
    borderRadius: 999, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, minWidth: 52, paddingHorizontal: 14, borderRadius: 999 },
  punto: { position: 'absolute', top: -1, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
})
