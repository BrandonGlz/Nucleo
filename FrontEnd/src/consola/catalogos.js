// Textos fijos de la consola de Nico AI.

export const TIPOS = {
  FIJA: { label: 'Respuesta fija', tone: 'success', ayuda: 'Nico responde exactamente este texto cuando le hacen la pregunta (o una igual sin acentos, signos ni saludos).' },
  RUTA: { label: 'Ruta', tone: 'neutral', ayuda: 'Nico responde la pregunta de la derecha con sus herramientas, como si se la hubieran hecho así. Úsalo para sinónimos: «¿qué onda con el clima?» → «¿cómo está la temperatura?».' },
  TEMP: { label: 'Temperatura', tone: 'warning', ayuda: 'Aprendida de un 👍. Los {espacios} se rellenan con las lecturas del momento.' },
  HUM: { label: 'Humedad', tone: 'warning', ayuda: 'Aprendida de un 👍. Los {espacios} se rellenan con las lecturas del momento.' },
  AIRE: { label: 'Calidad del aire', tone: 'warning', ayuda: 'Aprendida de un 👍. Los {espacios} se rellenan con las lecturas del momento.' },
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
