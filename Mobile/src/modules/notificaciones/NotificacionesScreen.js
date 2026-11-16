import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { Pantalla } from '../../components/Pantalla'
import { Aparece, Chip, IconCircle, T } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { useAvisos } from '../../hooks/useAvisos'
import { tituloAlerta, valorAlerta } from '../../utils/convertir'
import { esAyer, esHoy, fechaCorta, haceCuanto } from '../../utils/formato'
import { colors } from '../../theme'

const DEL_TIPO = {
  nueva: (a) => ({
    icono: a.nivel === 'PELIGRO' ? 'octagon-alert' : 'triangle-alert',
    tono: a.nivel === 'PELIGRO' ? 'danger' : 'warning',
    titulo: tituloAlerta(a),
    texto: `${a.dispositivo_nombre} marcó ${valorAlerta(a)}`,
  }),
  atendida: (a) => ({ icono: 'circle-check', tono: 'success', titulo: 'Alerta atendida', texto: `${tituloAlerta(a)} · ${a.dispositivo_nombre}` }),
  descartada: (a) => ({ icono: 'circle-x', tono: 'offline', titulo: 'Alerta descartada', texto: `${tituloAlerta(a)} · ${a.dispositivo_nombre}` }),
}
const grupo = (iso) => (esHoy(iso) ? 'Hoy' : esAyer(iso) ? 'Ayer' : fechaCorta(iso))

// Centro de avisos (campana del Panel): alertas nuevas y cambios de estado de las alertas a la
// vista, como las notificaciones de la web. Tocar uno abre la alerta.
export function NotificacionesScreen({ navigation }) {
  const { c } = useTema()
  const { avisos, sinLeer, marcarTodo } = useAvisos()
  const [filtro, setFiltro] = useState('todas')
  const visibles = avisos.filter((x) => filtro === 'todas' || (filtro === 'sinleer' ? x.nuevo : x.tipo === 'nueva'))
  const grupos = []
  for (const x of visibles) {
    const g = grupo(x.fecha)
    if (grupos.at(-1)?.g !== g) grupos.push({ g, items: [] })
    grupos.at(-1).items.push(x)
  }

  const zona = (
    <>
      <Cabecera titulo="Notificaciones" onVolver={() => navigation.goBack()} />
      <View style={s.entre}>
        <T size={13} color={colors.dark.textSecondary}>
          {sinLeer ? `${sinLeer} sin leer` : 'Todo leído'}
        </T>
        {sinLeer > 0 && (
          <Pressable onPress={marcarTodo} hitSlop={8} accessibilityRole="button">
            <T peso={600} size={13} color={colors.dark.accent}>
              Marcar todo como leído
            </T>
          </Pressable>
        )}
      </View>
    </>
  )

  return (
    <Pantalla zona={zona} pestanas={false} compacta>
      <View style={s.chips}>
        {[
          ['todas', 'Todas'],
          ['sinleer', 'Sin leer'],
          ['alertas', 'Alertas nuevas'],
        ].map(([k, etiqueta]) => (
          <Chip key={k} selected={filtro === k} count={k === 'sinleer' && sinLeer ? sinLeer : undefined} onPress={() => setFiltro(k)}>
            {etiqueta}
          </Chip>
        ))}
      </View>
      {grupos.length === 0 ? (
        <View style={[s.vacio, { backgroundColor: c.surface }]}>
          <IconCircle name="bell" size="sm" />
          <T size={14} lh={20} color={c.textSecondary} style={{ flex: 1 }}>
            {filtro === 'sinleer' ? 'No tienes avisos sin leer.' : 'Aún no hay avisos. Aquí verás cada alerta y quién la atendió.'}
          </T>
        </View>
      ) : (
        grupos.map(({ g, items }) => (
          <View key={g} style={{ gap: 8 }}>
            <T mayus color={c.textMuted}>
              {g}
            </T>
            {items.map((x, i) => {
              const v = DEL_TIPO[x.tipo](x.alerta)
              return (
                <Aparece key={x.id} indice={i}>
                  <Pressable
                    onPress={() => navigation.navigate('DetalleAlerta', { num: x.alerta.num })}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.aviso, { backgroundColor: c.surface }, !x.nuevo && { opacity: 0.78 }, pressed && { opacity: 0.6 }]}
                  >
                    <IconCircle name={v.icono} size="sm" tone={v.tono} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <T peso={700} size={14} lh={19}>
                        {v.titulo}
                      </T>
                      <T size={12} lh={17} color={c.textSecondary}>
                        {v.texto}
                      </T>
                      <T size={11} color={c.textMuted}>
                        {haceCuanto(x.fecha).replace(/^hace/, 'Hace')}
                      </T>
                    </View>
                    {x.nuevo && <View style={[s.punto, { backgroundColor: c.accent }]} accessibilityLabel="Sin leer" />}
                  </Pressable>
                </Aparece>
              )
            })}
          </View>
        ))
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vacio: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 22 },
  aviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 20 },
  punto: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
})
