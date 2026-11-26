// Cifras de la API en la forma resumida de la hoja. Vive aparte para que los mocks puedan
// armar la misma hoja que la vista previa sin importar el servicio completo.
const ORDEN = ['TEMP', 'HUM', 'AIRE']
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function cifrasHoja(c, { area = 'todas las áreas', nombres = {}, variable } = {}) {
  const porVariable = c.alertas?.por_variable ?? {}
  const codigos = ORDEN.filter((v) => c.variables?.[v])
  const principal =
    (variable && c.variables?.[variable] ? variable : null) ??
    [...codigos].sort((a, b) => (porVariable[b] ?? 0) - (porVariable[a] ?? 0))[0] ??
    'TEMP'
  const info = c.variables?.[principal]
  const alcance = c.alcance ?? area
  const lugar = alcance === 'Toda la organización' ? 'toda la organización' : alcance
  const porDia = c.intervalo_serie !== 'hora'
  const puntos = (c.series?.[principal] ?? []).map((p) => {
    const f = new Date(p.t)
    const etiqueta = porDia
      ? (c.series[principal].length <= 7 ? DIAS[f.getDay()] : `${f.getDate()}/${f.getMonth() + 1}`)
      : `${String(f.getHours()).padStart(2, '0')}:00`
    return [etiqueta, p.promedio]
  })
  return {
    titulo: info
      ? `${info.nombre.replace(/ \(.*\)$/, '')} en ${lugar}`
      : `Monitoreo en ${lugar}`,
    alcance,
    lecturas: codigos.reduce((s, v) => s + (c.variables[v].muestras ?? 0), 0),
    dispositivos: Object.keys(c.dispositivos ?? {}).map((codigo) => nombres[codigo] ?? codigo),
    por_dispositivo: Object.entries(c.dispositivos ?? {}).map(([codigo, valores]) => {
      const detalle = {
        codigo,
        nombre: valores.nombre ?? nombres[codigo] ?? codigo,
        area: valores.area ?? '',
      }
      for (const variable of ORDEN) {
        if (valores[variable]) detalle[variable] = valores[variable]
      }
      return detalle
    }),
    cumplimiento: c.cumplimiento ?? null,
    comparativo: c.comparativo ?? null,
    gestion_alertas: c.gestion_alertas ?? null,
    disponibilidad: c.disponibilidad ?? null,
    incidentes: c.incidentes ?? null,
    observaciones: c.observaciones ?? null,
    variables: codigos.map((v) => ({
      variable: v,
      minimo: c.variables[v].minimo,
      promedio: c.variables[v].promedio,
      maximo: c.variables[v].maximo,
      alertas: porVariable[v] ?? 0,
    })),
    serie: puntos.length
      ? {
          variable: principal,
          etiqueta: `${info.nombre.replace(/ \(.*\)$/, '')} promedio por ${porDia ? 'día' : 'hora'}`,
          puntos,
        }
      : null,
  }
}
