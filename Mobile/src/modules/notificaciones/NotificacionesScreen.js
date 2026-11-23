import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { Pantalla } from '../../components/Pantalla'
import { Aparece, Chip, IconCircle, T } from '../../components/ui'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import { useAvisos } from '../../hooks/useAvisos'
import { useOperador } from '../../hooks/useOperador'
import { puedeUsarAgente, tituloAlerta, valorAlerta } from '../../utils/convertir'
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
// Avisos del sistema: ícono por tipo y color por nivel (como en la web).
const ICONO_AVISO = { DISPOSITIVO: 'cpu', USUARIO: 'user', REPORTE: 'file-text', NICO: 'sparkles' }
const TONO_NIVEL = { PELIGRO: 'danger', ADVERTENCIA: 'warning', INFO: 'success' }
const vistaAviso = (v) => ({ icono: ICONO_AVISO[v.tipo] ?? 'info', tono: TONO_NIVEL[v.nivel] ?? 'neutral', titulo: v.titulo, texto: v.detalle })
const vista = (x) => (x.aviso ? vistaAviso(x.aviso) : DEL_TIPO[x.tipo](x.alerta))
const grupo = (iso) => (esHoy(iso) ? 'Hoy' : esAyer(iso) ? 'Ayer' : fechaCorta(iso))

// Centro de avisos (campana del Panel), como las notificaciones de la web: alertas nuevas y cambios
// de estado de las alertas a la vista, más los avisos de dispositivos, usuarios, reportes y Nico AI.
// Tocar uno lo marca como leído y abre lo equivalente en la app: la alerta, el dispositivo en el
// Panel o Nico AI. Usuarios y reportes no tienen pantalla en la app: solo se marcan.
export function NotificacionesScreen({ navigation }) {
  const { c } = useTema()
  const { usuario } = useSesion()
  const { datos: op, elegir } = useOperador()
  const { avisos, sinLeer, marcarLeido, marcarTodo } = useAvisos()
  const [filtro, setFiltro] = useState('todas')
  const visibles = avisos.filter(
    (x) => filtro === 'todas' || (filtro === 'sinleer' ? x.nuevo : filtro === 'sistema' ? !!x.aviso : !x.aviso),
  )
  const destino = (x) => {
    if (!x.aviso) return () => navigation.navigate('DetalleAlerta', { num: x.alerta.num })
    const v = x.aviso
    if (v.tipo === 'DISPOSITIVO') {
      const num = Number(/^\/dispositivos\/(\d+)/.exec(v.ruta ?? '')?.[1])
      if (!op?.dispositivos?.some((d) => d.num === num)) return null
      return () => {
        elegir(num)
        navigation.navigate('Principal', { screen: 'Inicio' })
      }
    }
    if (v.tipo === 'NICO' && puedeUsarAgente(usuario)) return () => navigation.navigate('Principal', { screen: 'Agente' })
    return null
  }
  const tocar = (x) => {
    marcarLeido(x)
    destino(x)?.()
  }
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
              Marcar todas como leídas
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
          ['alertas', 'Alertas'],
          ['sistema', 'Sistema'],
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
            {filtro === 'sinleer' ? 'No tienes avisos sin leer.' : 'Aún no hay avisos. Aquí verás cada alerta, quién la atendió y los avisos de tus dispositivos, reportes y Nico AI.'}
          </T>
        </View>
      ) : (
        grupos.map(({ g, items }) => (
          <View key={g} style={{ gap: 8 }}>
            <T mayus color={c.textMuted}>
              {g}
            </T>
            {items.map((x, i) => {
              const v = vista(x)
              const ir = !!destino(x)
              return (
                <Aparece key={x.id} indice={i}>
                  <Pressable
                    onPress={() => tocar(x)}
                    accessibilityRole="button"
                    accessibilityHint={ir ? undefined : 'Marca el aviso como leído'}
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
