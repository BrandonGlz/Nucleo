# Herramientas de Nico AI

Nico AI responde con herramientas de consulta del backend (`apps/reportes/herramientas.py`).
El intérprete (`interprete.interpretar`) identifica la intención y llama a la herramienta; la IA
local no explora datos ni calcula: solo redacta con los hechos que devuelve la herramienta, y
solo en conversación (comentarios, dudas). Todas las cifras salen de consultas a `nucleo_db`
(alertas, umbrales, reportes) y `nucleo_iot` (lecturas) con los mismos servicios que usa la
plataforma (`servicios.calcular_cifras`, `common.scoping`).

Las herramientas no dependen del canal: la web y la app móvil usan el mismo `POST /agente/`.
Fechas en America/Tijuana (`TIME_ZONE`); los periodos relativos (hoy, ayer, esta semana,
octubre, últimos N días) se resuelven en el servidor con `agente.periodo_de`.

## Catálogo

| Herramienta | Qué devuelve | Roles | Escribe | Reutiliza |
|---|---|---|---|---|
| `variable` | Promedio, mínimo, máximo con hora, lecturas fuera de rango y picos de un periodo | ADMIN, SUPER, ANALISTA, OPER* | No | `agente.responder` (lecturas estabilizadas) |
| `ultima` | Última medición de una o todas las variables, con nivel | ídem | No | `agente.ultima_medicion` |
| `resumen` | Las tres variables del periodo | ídem | No | `agente.responder` |
| `alertas` | Alertas del dispositivo en el periodo, por nivel y variable | ídem | No | `Alerta` |
| `detalle_alerta` | Lectura que la disparó, límite, estado, quién la atendió y cuándo, tiempo de la primera notificación | ídem | No | `Alerta`, `Notificacion` |
| `pendientes` | Alertas pendientes por nivel y dispositivos sin conexión o calentando, en todo su alcance | ídem | No | `dispositivos_visibles` |
| `conexion` | Estado, última conexión, batería, muestreo, calentamiento del CCS811 | ídem | No | `agente._conexion` |
| `sensores` | Sensores, estado y calibración | ídem | No | `Sensor` |
| `umbrales` | Límites de advertencia y peligro por variable | ídem | No | `Umbral` |
| `reportes` | Últimos reportes generados del área | ídem | No | `Reporte` |
| `programaciones` | Programaciones vigentes (frecuencia, área, destinatarios, próxima) | ADMIN (organización), SUPER y ANALISTA (propias) | No | `ProgramacionReporte` |
| `areas` | Áreas que puede consultar y sus dispositivos | ídem | No | `areas_visibles` |
| `grafica` / `comparativa` | Gráfica o comparación de periodos o dispositivos | ídem | No | `graficas`, `calcular_cifras` |
| `reporte` | Preparar: dispositivos, lecturas válidas y alertas del periodo. Confirmar: genera y guarda | ADMIN, SUPER, ANALISTA | Sí, solo al confirmar | `servicios.calcular_cifras` y `servicios.generar_reporte` |
| `banco` | Textos fijos: niveles, calentamiento, «Sin conexión», rangos físicos, normas, capacidades por rol, cambios fuera de alcance | todos | No | `banco_memoria.json` |

OPER*: solo con `acceso_agente` y sobre su dispositivo asignado. SUPER y ANALISTA con área
solo ven su área; sin área, la organización. El alcance se aplica dentro de cada herramienta
(`common.scoping`); el agente nunca recibe ids de otra organización.

## Reporte en dos pasos

1. «Hazme un reporte» sin periodo → `codigo: datos_faltantes`, `faltan: ["periodo"]` y la
   pregunta fija del banco. La respuesta del usuario («de esta semana») completa la petición.
2. Con periodo → `preparar_reporte` calcula las cifras (sin guardar) y responde
   `accion: {id, vence}` (vigencia de 10 min, guardada en `PreguntaAgente.datos`).
3. «Sí» (o `accion` con el id) → `confirmar_reporte` genera el texto con IA y guarda el
   reporte. «No» o «cancela» lo descartan. Vencida → `accion_vencida` y un «sí» la prepara de
   nuevo. Sin IA → `ia_no_disponible` y no se guarda nada.

```json
POST /api/v1/agente/ {"pregunta": "genera el reporte de esta semana", "dispositivo": 5}
→ {"texto": "Voy a generar el reporte del área Almacén de esta semana (09/11/2026 – 12/11/2026): 3 dispositivos, 4,212 lecturas válidas y 2 alertas. ¿Lo genero? Responde «sí» o «cancela».",
   "accion": {"id": "9f2c41ab03d1", "vence": "2026-11-11T14:32:00-08:00"}, "via": "PREDEFINIDA", "pasos": [...]}
POST /api/v1/agente/ {"pregunta": "sí", "dispositivo": 5}
→ {"texto": "Listo: generé el reporte de Almacén de esta semana …", "reporte": {"num": 31, ...}}
```

## Códigos de error

`sin_permiso`, `datos_faltantes`, `periodo_invalido`, `sin_datos`, `fuera_de_alcance`,
`accion_vencida`, `ia_no_disponible`. Sus textos están en `banco_memoria.json` (`errores`).

## Banco de memoria

`apps/reportes/banco_memoria.json` (versionado) se consulta sin modelo con
`herramientas.consultar_banco_memoria(intencion=…, texto=…, rol=…)`: campos obligatorios y
opcionales por intención, valores permitidos, la pregunta por cada dato faltante, explicaciones
fijas, capacidades por rol, matriz de permisos, textos de error y de cambios fuera de alcance.
Sus textos se devuelven tal cual.

## Pruebas

`HerramientasAgenteTests` (banco, cambios fuera de alcance, pendientes con aislamiento entre
organizaciones y áreas, detalle de alerta, programaciones, reporte con dato faltante,
cancelación, acción vencida y sin datos) y los casos de `casos_agente.py`.

## Pendiente

- Reporte de toda la organización desde el chat (hoy es del área del dispositivo del agente).
- Crear o cambiar programaciones y enviar reportes por correo desde el chat (hoy solo se consultan).
- Consultas de varios dispositivos a la vez (cada agente responde por su dispositivo; los
  pendientes sí cubren todo el alcance).
