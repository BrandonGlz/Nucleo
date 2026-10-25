export function formatDateTime(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}
