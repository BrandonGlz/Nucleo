import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

// Contenido provisional de cada módulo. Al implementar un módulo se reemplaza por su pantalla real.
export function ModuloBase({ titulo, descripcion, carpeta }) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Módulo</Text>
      <Text style={styles.title}>{titulo}</Text>
      <Text style={styles.greeting}>Hola mundo, este es el módulo de {titulo}.</Text>
      <Text style={styles.description}>{descripcion}</Text>
      <Text style={styles.folder}>Carpeta de trabajo: {carpeta}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
    padding: 24,
    backgroundColor: colors.background,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
  },
  greeting: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  folder: {
    color: colors.textMuted,
    fontSize: 12,
  },
})
