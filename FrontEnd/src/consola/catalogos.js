// Textos fijos de la consola de Nico AI.

export const TIPOS = {
  FIJA: { label: 'Respuesta fija', tone: 'success', ayuda: 'Nico responde exactamente este texto cuando le hacen la pregunta (o una igual sin acentos, signos ni saludos).' },
  RUTA: { label: 'Ruta', tone: 'neutral', ayuda: 'Nico responde la pregunta de la derecha con sus herramientas, como si se la hubieran hecho así. Úsalo para sinónimos: «¿qué onda con el clima?» → «¿cómo está la temperatura?».' },
  TEMP: { label: 'Temperatura', tone: 'warning', ayuda: 'Aprendida de una respuesta bien calificada. Los {espacios} se rellenan con las lecturas del momento.' },
  HUM: { label: 'Humedad', tone: 'warning', ayuda: 'Aprendida de una respuesta bien calificada. Los {espacios} se rellenan con las lecturas del momento.' },
  AIRE: { label: 'Calidad del aire', tone: 'warning', ayuda: 'Aprendida de una respuesta bien calificada. Los {espacios} se rellenan con las lecturas del momento.' },
}

export const NOMBRES = {
  variable: 'Variable',
  ultima: 'Última medición',
  resumen: 'Resumen',
  alertas: 'Alertas',
  conexion: 'Conexión',
  sensores: 'Sensores',
  umbrales: 'Umbrales',
  reportes: 'Reportes generados',
  areas: 'Áreas',
  grafica: 'Gráfica',
  comparativa: 'Comparativa',
  reporte: 'Generar reporte',
  detalle_alerta: 'Detalle de alerta',
  pendientes: 'Pendientes',
  programaciones: 'Programaciones',
  banco: 'Explicaciones fijas',
  programar: 'Programar reporte',
  editar_programacion: 'Cambiar programación',
  cancelar_programacion: 'Cancelar programación',
  enviar: 'Enviar reporte',
}

// Cómo se resolvió cada pregunta del registro: etiqueta, tono e ícono.
export const VIAS = {
  PREDEFINIDA: { label: 'Reglas', tone: 'neutral', icono: 'list', color: 'var(--text-muted)' },
  BANCO: { label: 'Banco', tone: 'success', icono: 'book-open', color: 'var(--accent)' },
  IA: { label: 'IA', tone: 'accent', icono: 'sparkles', color: '#7C9CF5' },
  ENRUTADA: { label: 'Interpretada por IA', tone: 'accent', icono: 'sparkles', color: '#A88BEB' },
  REPETIDA: { label: 'Repetida', tone: 'neutral', icono: 'rotate-ccw', color: 'var(--warning)' },
  NO_ENTENDIDA: { label: 'No entendida', tone: 'danger', icono: 'circle-x', color: 'var(--danger)' },
}

// Respuestas que Nico ya trae en código, por tipo.
export const INCLUIDAS = {
  explicacion: { label: 'Explicación', icono: 'info', ayuda: 'Textos fijos que explican conceptos de Núcleo.' },
  charla: { label: 'Conversación', icono: 'message-square-text', ayuda: 'Saludos, identidad y lo que queda fuera de su alcance.' },
  capacidades: { label: 'Capacidades', icono: 'user', ayuda: 'Lo que contesta a «¿qué puedes hacer?», según el rol.' },
  consulta: { label: 'Consulta con datos', icono: 'activity', ayuda: 'Preguntas que responde con las lecturas del momento.' },
}

export const NOMBRES_CHARLA = {
  identidad: 'Identidad',
  ayuda: 'Pide ayuda',
  gracias: 'Agradecimiento',
  despedida: 'Despedida',
  hora: 'Hora',
  fecha: 'Fecha',
  control: 'Controlar equipos',
  clima_exterior: 'Clima exterior',
  emocion_mal: 'Ánimo bajo',
  emocion_bien: 'Buen ánimo',
  afecto: 'Halago',
  molestia: 'Molestia',
  risa: 'Risa',
  acuse: 'Enterado',
  idioma: 'Otro idioma',
  general: 'Tema ajeno',
}
