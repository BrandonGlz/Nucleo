import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, radius } from '../theme'
import { formatDateTime } from '../utils/formatDate'

const statusContent = {
  checking: {
    title: 'Comprobando la API…',
    description: 'Consultando el endpoint de salud del backend.',
  },
  online: {
    title: 'API disponible',
    description: 'La app móvil se comunicó correctamente con el backend.',
  },
  offline: {
    title: 'API no disponible',
    description: 'Revisa que Django esté ejecutándose y que la URL sea correcta.',
  },
}

const statusColors = {
  checking: colors.textMuted,
  online: colors.accent,
  offline: colors.danger,
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

export function HealthStatusCard({ status, data, error, onRefresh }) {
  const content = statusContent[status] ?? statusContent.checking
  const isChecking = status === 'checking'
  const indicatorColor = statusColors[status] ?? colors.textMuted

  return (
    <View
      style={[styles.card, { borderColor: indicatorColor }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.heading}>
        <View style={[styles.indicator, { backgroundColor: indicatorColor }]} />
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>Backend</Text>
          <Text style={styles.title}>{content.title}</Text>
        </View>
      </View>

      <Text style={styles.description}>{content.description}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data ? (
        <View style={styles.details}>
          <DetailRow label="Servicio" value={data.service} />
          <DetailRow label="Versión" value={data.version} />
          <DetailRow
            label="Última respuesta"
            value={formatDateTime(data.timestamp)}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={isChecking}
        onPress={onRefresh}
        style={({ pressed }) => [
          styles.button,
          pressed && !isChecking && styles.buttonPressed,
          isChecking && styles.buttonDisabled,
        ]}
      >
        {isChecking ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : null}
        <Text style={styles.buttonText}>
          {isChecking ? 'Comprobando…' : 'Volver a comprobar'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderWidth: 1,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: '#173220',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headingText: {
    flex: 1,
  },
  indicator: {
    width: 12,
    height: 12,
    marginTop: 7,
    borderRadius: 6,
  },
  eyebrow: {
    marginBottom: 3,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  description: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.control,
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 14,
  },
  details: {
    gap: 10,
    marginTop: 18,
    padding: 14,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  detailValue: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.control,
    backgroundColor: colors.accentStrong,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
})
