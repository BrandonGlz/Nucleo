import { ICONS } from './icons'
import { useTema } from '../../context/TemaContext'

// Ícono de Lucide por nombre en kebab-case, igual que <Icon name="bell" /> de la web.
export function Icon({ name, size = 20, color, strokeWidth = 2 }) {
  const { c } = useTema()
  const Componente = ICONS[name] ?? ICONS.info
  return <Componente size={size} color={color ?? c.textPrimary} strokeWidth={strokeWidth} />
}
