// Formatos de prueba con la misma forma que /formatos-reporte/ (plantillas + uno de la organización).
const base = {
  version_esquema: 1,
  base: true,
  orden: ['cifras', 'var:TEMP', 'var:HUM', 'var:AIRE', 'serie', 'alertas', 'analisis'],
  ocultos: [],
  opciones: {},
  personalizadas: [],
  hoja: {},
}

const conVisibles = (visibles, opciones = {}) => ({
  ...base,
  orden: [...visibles, ...base.orden.filter((id) => !visibles.includes(id))],
  ocultos: base.orden.filter((id) => !visibles.includes(id)),
  opciones,
})

const ahora = '2026-11-20T10:00:00Z'

export const formatos = [
  {
    num: 1,
    nombre: 'Ejecutivo',
    plantilla: 'EJECUTIVO',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 1,
    conf: conVisibles(['cifras', 'serie', 'analisis'], { serie: { grafica: 'linea' } }),
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones: [{ numero: 1, fecha: ahora, creada_por_nombre: 'Sistema' }],
  },
  {
    num: 2,
    nombre: 'Cumplimiento',
    plantilla: 'CUMPLIMIENTO',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 1,
    conf: conVisibles(
      ['cifras', 'alertas', 'var:TEMP', 'var:HUM', 'var:AIRE', 'analisis'],
      {
        alertas: { grafica: 'dona', ancho: '12' },
        'var:TEMP': { datos: ['minmax', 'alertas'] },
        'var:HUM': { datos: ['minmax', 'alertas'] },
        'var:AIRE': { datos: ['minmax', 'alertas'] },
      },
    ),
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones: [{ numero: 1, fecha: ahora, creada_por_nombre: 'Sistema' }],
  },
  {
    num: 3,
    nombre: 'Operativo detallado',
    plantilla: 'OPERATIVO',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 1,
    conf: { ...base },
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones: [{ numero: 1, fecha: ahora, creada_por_nombre: 'Sistema' }],
  },
  {
    num: 4,
    nombre: 'Incidentes',
    plantilla: 'INCIDENTES',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 1,
    conf: conVisibles(['alertas', 'serie', 'analisis'], {
      alertas: { grafica: 'barras' },
      serie: { grafica: 'columnas' },
    }),
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones: [{ numero: 1, fecha: ahora, creada_por_nombre: 'Sistema' }],
  },
  {
    num: 5,
    nombre: 'Formato de la organización',
    plantilla: '',
    predeterminado: true,
    activo: true,
    es_plantilla: false,
    version: 1,
    conf: { ...base },
    creado_por_nombre: 'Ana López',
    areas_predeterminado: [1],
    versiones: [{ numero: 1, fecha: ahora, creada_por_nombre: 'Ana López' }],
  },
]

export const formatoPredeterminado = () =>
  formatos.find((f) => f.predeterminado && f.activo && !f.es_plantilla) ?? formatos[0]
