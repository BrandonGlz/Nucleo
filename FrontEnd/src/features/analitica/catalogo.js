// Catálogo de tarjetas de Analítica. Debe coincidir con BackEnd/apps/analitica/catalogo.py:
// una prueba del backend lee este archivo y compara tipos, opciones y valores.

export const LIMITES = {
  columnas: 12,
  filas: 6,
  paginas: 8,
  tarjetas: 12,
  titulo: 60,
  nombrePagina: 30,
  nota: 200,
  id: 32,
  tolerancia: 50,
  toleranciaPorOmision: 5,
}

export const PERIODOS = [
  ['hoy', 'Hoy'],
  ['24h', 'Últimas 24 horas'],
  ['7d', 'Últimos 7 días'],
  ['30d', 'Últimos 30 días'],
  ['mes', 'Este mes'],
  ['mes_anterior', 'Mes anterior'],
  ['90d', 'Últimos 90 días'],
  ['personalizado', 'Personalizado'],
]

export const VARIABLES = [
  ['', 'Todas'],
  ['TEMP', 'Temperatura'],
  ['HUM', 'Humedad'],
  ['AIRE', 'Calidad del aire'],
]

export const FAMILIAS = [
  { id: 'kpis', nombre: 'KPIs y tendencias' },
  { id: 'comparativos', nombre: 'Comparativos' },
  { id: 'patrones', nombre: 'Patrones' },
  { id: 'alertas', nombre: 'Alertas y operación' },
  { id: 'otras', nombre: 'Otras' },
]

export const METAS_SUGERIDAS = {
  cumplimiento: { valor: 95, sentido: 'mayor', tolerancia: 5 },
  disponibilidad: { valor: 98, sentido: 'mayor', tolerancia: 5 },
  tiempo_atencion: { valor: 30, sentido: 'menor', tolerancia: 5 },
  alertas: { valor: 10, sentido: 'menor', tolerancia: 5 },
}

export const TIPOS = {
  kpi: {
    nombre: 'KPI',
    familia: 'kpis',
    descripcion: 'Un valor grande con variación, tendencia y semáforo.',
    minimo: [2, 1],
    meta: true,
    opciones: [
      { clave: 'indicador', tipo: 'uno', etiqueta: 'Indicador', porOmision: 'cumplimiento', valores: [['lecturas', 'Lecturas'], ['promedio', 'Promedio'], ['minimo', 'Mínimo'], ['maximo', 'Máximo'], ['cumplimiento', 'Cumplimiento'], ['disponibilidad', 'Disponibilidad'], ['alertas', 'Alertas'], ['alertas_pendientes', 'Alertas pendientes'], ['tiempo_atencion', 'Tiempo de atención'], ['dispositivos_en_linea', 'Dispositivos en línea']] },
      { clave: 'variable', tipo: 'uno', etiqueta: 'Variable', porOmision: 'filtro', valores: [['filtro', 'La del filtro'], ['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
      { clave: 'nivel', tipo: 'uno', etiqueta: 'Nivel de alerta', porOmision: '', valores: [['', 'Todos'], ['ADVERTENCIA', 'Advertencia'], ['PELIGRO', 'Peligro']] },
      { clave: 'comparar', tipo: 'booleano', etiqueta: 'Comparar con el periodo anterior', porOmision: true },
      { clave: 'sparkline', tipo: 'booleano', etiqueta: 'Mostrar tendencia', porOmision: true },
    ],
  },
  tendencia: {
    nombre: 'Tendencia',
    familia: 'kpis',
    descripcion: 'Serie de tiempo con comparación y bandas de umbral.',
    minimo: [4, 2],
    meta: false,
    opciones: [
      { clave: 'variable', tipo: 'uno', etiqueta: 'Variable', porOmision: 'filtro', valores: [['filtro', 'La del filtro'], ['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
      { clave: 'estadistico', tipo: 'uno', etiqueta: 'Estadístico', porOmision: 'promedio', valores: [['promedio', 'Promedio'], ['maximo', 'Máximo'], ['minimo', 'Mínimo']] },
      { clave: 'agrupar', tipo: 'uno', etiqueta: 'Agrupar por', porOmision: 'total', valores: [['total', 'Total'], ['area', 'Área'], ['dispositivo', 'Dispositivo']] },
      { clave: 'estilo', tipo: 'uno', etiqueta: 'Estilo', porOmision: 'linea', valores: [['linea', 'Línea'], ['area', 'Área']] },
      { clave: 'comparar', tipo: 'booleano', etiqueta: 'Comparar con el periodo anterior', porOmision: true },
      { clave: 'umbrales', tipo: 'booleano', etiqueta: 'Bandas de umbral', porOmision: true },
    ],
  },
  medidor: {
    nombre: 'Medidor',
    familia: 'kpis',
    descripcion: 'Medio aro con el valor y la marca de la meta.',
    minimo: [2, 2],
    meta: true,
    opciones: [
      { clave: 'indicador', tipo: 'uno', etiqueta: 'Indicador', porOmision: 'cumplimiento', valores: [['cumplimiento', 'Cumplimiento'], ['disponibilidad', 'Disponibilidad']] },
      { clave: 'variable', tipo: 'uno', etiqueta: 'Variable', porOmision: 'filtro', valores: [['filtro', 'La del filtro'], ['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
    ],
  },
  barras: {
    nombre: 'Barras',
    familia: 'comparativos',
    descripcion: 'Compara categorías con una línea de meta.',
    minimo: [3, 2],
    meta: true,
    opciones: [
      { clave: 'metrica', tipo: 'uno', etiqueta: 'Métrica', porOmision: 'cumplimiento', valores: [['promedio', 'Promedio'], ['maximo', 'Máximo'], ['minimo', 'Mínimo'], ['cumplimiento', 'Cumplimiento'], ['disponibilidad', 'Disponibilidad'], ['alertas', 'Alertas'], ['lecturas', 'Lecturas'], ['tiempo_atencion', 'Tiempo de atención']] },
      { clave: 'variable', tipo: 'uno', etiqueta: 'Variable', porOmision: 'filtro', valores: [['filtro', 'La del filtro'], ['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
      { clave: 'por', tipo: 'uno', etiqueta: 'Agrupar por', porOmision: 'area', valores: [['area', 'Área'], ['dispositivo', 'Dispositivo'], ['variable', 'Variable']] },
      { clave: 'orientacion', tipo: 'uno', etiqueta: 'Orientación', porOmision: 'vertical', valores: [['vertical', 'Vertical'], ['horizontal', 'Horizontal']] },
      { clave: 'orden', tipo: 'uno', etiqueta: 'Orden', porOmision: 'desc', valores: [['desc', 'Mayor a menor'], ['asc', 'Menor a mayor'], ['nombre', 'Por nombre']] },
      { clave: 'limite', tipo: 'numero', etiqueta: 'Límite', porOmision: 10, minimo: 5, maximo: 20 },
    ],
  },
  barras_apiladas: {
    nombre: 'Barras apiladas',
    familia: 'comparativos',
    descripcion: 'Composición por categoría, en cantidades o 100 %.',
    minimo: [4, 2],
    meta: false,
    opciones: [
      { clave: 'serie', tipo: 'uno', etiqueta: 'Serie', porOmision: 'alertas_estado', valores: [['alertas_estado', 'Alertas por estado'], ['alertas_nivel', 'Alertas por nivel'], ['lecturas_rango', 'Lecturas por rango']] },
      { clave: 'por', tipo: 'uno', etiqueta: 'Agrupar por', porOmision: 'dia', valores: [['area', 'Área'], ['dispositivo', 'Dispositivo'], ['dia', 'Día'], ['semana', 'Semana']] },
      { clave: 'porcentaje', tipo: 'booleano', etiqueta: 'Mostrar porcentaje', porOmision: false },
    ],
  },
  ranking: {
    nombre: 'Ranking',
    familia: 'comparativos',
    descripcion: 'Los mejores o peores, con barra fina y variación.',
    minimo: [3, 2],
    meta: false,
    opciones: [
      { clave: 'metrica', tipo: 'uno', etiqueta: 'Métrica', porOmision: 'cumplimiento', valores: [['promedio', 'Promedio'], ['maximo', 'Máximo'], ['minimo', 'Mínimo'], ['cumplimiento', 'Cumplimiento'], ['disponibilidad', 'Disponibilidad'], ['alertas', 'Alertas'], ['lecturas', 'Lecturas'], ['tiempo_atencion', 'Tiempo de atención']] },
      { clave: 'variable', tipo: 'uno', etiqueta: 'Variable', porOmision: 'filtro', valores: [['filtro', 'La del filtro'], ['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
      { clave: 'por', tipo: 'uno', etiqueta: 'Agrupar por', porOmision: 'dispositivo', valores: [['dispositivo', 'Dispositivo'], ['area', 'Área']] },
      { clave: 'sentido', tipo: 'uno', etiqueta: 'Sentido', porOmision: 'peores', valores: [['mejores', 'Mejores'], ['peores', 'Peores']] },
      { clave: 'n', tipo: 'uno', etiqueta: 'Cantidad', porOmision: 5, valores: [[5, '5'], [10, '10']] },
    ],
  },
  matriz: {
    nombre: 'Matriz',
    familia: 'comparativos',
    descripcion: 'Filas por variable, con celdas coloreadas.',
    minimo: [4, 2],
    meta: false,
    opciones: [
      { clave: 'filas', tipo: 'uno', etiqueta: 'Filas', porOmision: 'area', valores: [['area', 'Área'], ['dispositivo', 'Dispositivo']] },
      { clave: 'valor', tipo: 'uno', etiqueta: 'Valor', porOmision: 'promedio', valores: [['promedio', 'Promedio'], ['cumplimiento', 'Cumplimiento'], ['alertas', 'Alertas']] },
    ],
  },
  mapa_calor: {
    nombre: 'Mapa de calor',
    familia: 'patrones',
    descripcion: 'Hora del día por día de la semana.',
    minimo: [4, 2],
    meta: false,
    opciones: [
      { clave: 'variable', tipo: 'uno', etiqueta: 'Variable', porOmision: 'filtro', valores: [['filtro', 'La del filtro'], ['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
      { clave: 'estadistico', tipo: 'uno', etiqueta: 'Estadístico', porOmision: 'promedio', valores: [['promedio', 'Promedio'], ['maximo', 'Máximo'], ['minimo', 'Mínimo']] },
      { clave: 'alertas', tipo: 'booleano', etiqueta: 'Contar alertas en vez de lecturas', porOmision: false },
    ],
  },
  dispersion: {
    nombre: 'Dispersión',
    familia: 'patrones',
    descripcion: 'Dos variables, un punto por hora y dispositivo.',
    minimo: [4, 3],
    meta: false,
    opciones: [
      { clave: 'x', tipo: 'uno', etiqueta: 'Variable X', porOmision: 'TEMP', valores: [['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
      { clave: 'y', tipo: 'uno', etiqueta: 'Variable Y', porOmision: 'HUM', valores: [['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
    ],
  },
  histograma: {
    nombre: 'Histograma',
    familia: 'patrones',
    descripcion: 'Distribución de una variable en cubetas.',
    minimo: [3, 2],
    meta: false,
    opciones: [
      { clave: 'variable', tipo: 'uno', etiqueta: 'Variable', porOmision: 'filtro', valores: [['filtro', 'La del filtro'], ['TEMP', 'Temperatura'], ['HUM', 'Humedad'], ['AIRE', 'Calidad del aire']] },
    ],
  },
  alertas_dona: {
    nombre: 'Dona de alertas',
    familia: 'alertas',
    descripcion: 'Dona con el total de alertas al centro.',
    minimo: [2, 2],
    meta: false,
    opciones: [
      { clave: 'por', tipo: 'uno', etiqueta: 'Agrupar por', porOmision: 'estado', valores: [['estado', 'Estado'], ['nivel', 'Nivel'], ['variable', 'Variable'], ['tipo', 'Tipo']] },
    ],
  },
  tiempo_atencion: {
    nombre: 'Tiempo de atención',
    familia: 'alertas',
    descripcion: 'Minutos promedio hasta atender o descartar.',
    minimo: [3, 2],
    meta: true,
    opciones: [
      { clave: 'por', tipo: 'uno', etiqueta: 'Agrupar por', porOmision: 'area', valores: [['area', 'Área'], ['dispositivo', 'Dispositivo'], ['responsable', 'Responsable']] },
    ],
  },
  disponibilidad: {
    nombre: 'Disponibilidad',
    familia: 'alertas',
    descripcion: 'Tiempo con datos por dispositivo y sus huecos.',
    minimo: [4, 2],
    meta: true,
    opciones: [
      { clave: 'limite', tipo: 'numero', etiqueta: 'Límite', porOmision: 10, minimo: 5, maximo: 20 },
      { clave: 'orden', tipo: 'uno', etiqueta: 'Orden', porOmision: 'asc', valores: [['desc', 'Mayor a menor'], ['asc', 'Menor a mayor'], ['nombre', 'Por nombre']] },
    ],
  },
  texto: {
    nombre: 'Texto',
    familia: 'otras',
    descripcion: 'Un título de sección y una nota.',
    minimo: [2, 1],
    meta: false,
    opciones: [
      { clave: 'nota', tipo: 'texto', etiqueta: 'Nota', porOmision: '', max: 200 },
    ],
  },
  hallazgos: {
    nombre: 'Hallazgos de Nico AI',
    familia: 'otras',
    descripcion: 'Hallazgos redactados por Nico AI sobre la página.',
    minimo: [3, 2],
    meta: false,
    opciones: [],
  },
}

export const metaSugerida = (tipo, opciones = {}) => {
  const definicion = TIPOS[tipo]
  if (!definicion || !definicion.meta) return null
  let clave = null
  if (tipo === 'kpi' || tipo === 'medidor') clave = opciones.indicador
  else if (tipo === 'barras') clave = opciones.metrica
  else if (tipo === 'tiempo_atencion') clave = 'tiempo_atencion'
  else if (tipo === 'disponibilidad') clave = 'disponibilidad'
  const meta = METAS_SUGERIDAS[clave]
  return meta ? { ...meta } : null
}
