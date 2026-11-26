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

// Mismas tarjetas nuevas que la migración 0011.
const NUEVAS = [
  { id: 'cumplimiento', fuente: 'cumplimiento', nombre: 'Cumplimiento' },
  { id: 'comparativo', fuente: 'comparativo', nombre: 'Comparativo' },
  { id: 'dispositivos', fuente: 'dispositivos', nombre: 'Dispositivos' },
  { id: 'gestion_alertas', fuente: 'gestion_alertas', nombre: 'Gestión de alertas' },
  { id: 'disponibilidad', fuente: 'disponibilidad', nombre: 'Disponibilidad' },
  { id: 'incidentes', fuente: 'incidentes', nombre: 'Incidentes' },
  { id: 'observaciones', fuente: 'observaciones', nombre: 'Observaciones' },
]
const idsBase = [...base.orden, ...NUEVAS.map((tarjeta) => tarjeta.id)]
const baseAmpliada = {
  ...base,
  orden: idsBase,
  personalizadas: NUEVAS,
}

const conVisibles = (visibles, opciones = {}) => ({
  ...baseAmpliada,
  orden: [...visibles, ...idsBase.filter((id) => !visibles.includes(id))],
  ocultos: idsBase.filter((id) => !visibles.includes(id)),
  opciones,
})

const ahora = '2026-11-20T10:00:00Z'
const versiones = [
  { numero: 1, fecha: ahora, creada_por_nombre: 'Sistema' },
  { numero: 2, fecha: ahora, creada_por_nombre: 'Sistema' },
  { numero: 3, fecha: ahora, creada_por_nombre: 'Sistema' },
]

export const formatos = [
  {
    num: 1,
    nombre: 'Ejecutivo',
    plantilla: 'EJECUTIVO',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 3,
    conf: conVisibles(['cifras', 'cumplimiento', 'comparativo', 'serie', 'analisis'], {
      cumplimiento: { grafica: 'cifra', ancho: '12' },
      comparativo: { grafica: 'lista', ancho: '6' },
      serie: { grafica: 'linea', ancho: '6' },
      analisis: { ancho: '12' },
    }),
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones,
  },
  {
    num: 2,
    nombre: 'Cumplimiento',
    plantilla: 'CUMPLIMIENTO',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 3,
    conf: conVisibles(
      [
        'cumplimiento',
        'disponibilidad',
        'incidentes',
        'gestion_alertas',
        'observaciones',
        'analisis',
      ],
      {
        cumplimiento: { grafica: 'tabla', ancho: '8' },
        disponibilidad: { grafica: 'barras', ancho: '4' },
        incidentes: { grafica: 'tabla', ancho: '12' },
        gestion_alertas: { grafica: 'dona', ancho: '4' },
        observaciones: { grafica: 'lista', ancho: '8' },
        analisis: { ancho: '12' },
      },
    ),
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones,
  },
  {
    num: 3,
    nombre: 'Operativo detallado',
    plantilla: 'OPERATIVO',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 3,
    conf: {
      ...conVisibles(
        [
          'cifras',
          'var:TEMP',
          'var:HUM',
          'var:AIRE',
          'serie',
          'alertas',
          'dispositivos',
          'gestion_alertas',
          'disponibilidad',
          'analisis',
        ],
        {
          serie: { grafica: 'linea', ancho: '6' },
          alertas: { grafica: 'barras', ancho: '6' },
          dispositivos: { grafica: 'tabla', ancho: '6' },
          gestion_alertas: { grafica: 'dona', ancho: '3' },
          disponibilidad: { grafica: 'barras', ancho: '3' },
          analisis: { ancho: '12' },
        },
      ),
      hoja: { analisis_largo: 'breve' },
    },
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones,
  },
  {
    num: 4,
    nombre: 'Incidentes',
    plantilla: 'INCIDENTES',
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 3,
    conf: conVisibles(['incidentes', 'alertas', 'gestion_alertas', 'observaciones'], {
      incidentes: { grafica: 'tabla', ancho: '12' },
      alertas: { grafica: 'barras', ancho: '6' },
      gestion_alertas: { grafica: 'barras', ancho: '6' },
      observaciones: { grafica: 'lista', ancho: '12' },
    }),
    creado_por_nombre: 'Sistema',
    areas_predeterminado: [],
    versiones,
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
