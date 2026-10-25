import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { HealthStatusCard } from '../components/HealthStatusCard'
import { useHealthCheck } from '../hooks/useHealthCheck'
import { API_BASE_URL } from '../services/api/client'
import { modulos } from '../modules'
import { colors, radius } from '../theme'

export function HomeScreen({ navigation }) {
  const { status, data, error, refresh } = useHealthCheck()

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>N</Text>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.brandName}>Núcleo</Text>
            <Text style={styles.brandSubtitle}>
              Gestión y monitoreo del ambiente
            </Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>App móvil</Text>
          <Text style={styles.heading}>Núcleo está funcionando</Text>
          <Text style={styles.lead}>
            Esqueleto base: cada módulo ya tiene su pantalla y su carpeta
            para empezar a trabajar.
          </Text>
        </View>

        <HealthStatusCard
          status={status}
          data={data}
          error={error}
          onRefresh={refresh}
        />

        <View style={styles.infoCard}>
          <Text style={styles.eyebrow}>Módulos</Text>
          {modulos.map(({ nombre, titulo }) => (
            <Pressable
              key={nombre}
              style={styles.moduleLink}
              onPress={() => navigation.navigate(nombre)}
            >
              <Text style={styles.moduleLinkText}>{titulo}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.eyebrow}>Configuración</Text>
          <Text style={styles.cardTitle}>Endpoint de la API</Text>
          <Text style={styles.endpoint}>{API_BASE_URL}</Text>
          <Text style={styles.infoText}>
            La URL se define con EXPO_PUBLIC_API_BASE_URL. La app consulta
            /health/ al abrir esta pantalla.
          </Text>
          <View style={styles.tip}>
            <Text style={styles.tipText}>
              En el emulador Android usa http://10.0.2.2:8000/api/v1. En un
              teléfono físico usa la IP local de la computadora.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Núcleo · Entorno inicial de desarrollo
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  moduleLink: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    backgroundColor: colors.accentSoft,
  },
  moduleLinkText: {
    color: colors.accentStrong,
    fontSize: 15,
    fontWeight: '700',
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 28 : 0,
    backgroundColor: colors.background,
  },
  content: {
    gap: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandMark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.accentStrong,
  },
  brandMarkText: {
    color: colors.surface,
    fontSize: 22,
    fontWeight: '700',
  },
  brandText: {
    flex: 1,
  },
  brandName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 12,
  },
  intro: {
    gap: 8,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heading: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1.4,
    lineHeight: 40,
  },
  lead: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  infoCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    marginTop: 2,
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  endpoint: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 12,
  },
  infoText: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  tip: {
    marginTop: 14,
    padding: 12,
    borderRadius: radius.control,
    backgroundColor: colors.accentSoft,
  },
  tipText: {
    color: colors.accentStrong,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
})
