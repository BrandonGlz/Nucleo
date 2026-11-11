"""Banco de casos de Nico AI.

Preguntas reales (incluidas las que fallaron en pruebas con usuarios) con lo que se espera de
cada una. Se usan en dos lugares:

- ``tests.py`` (``CasosAgenteTests``): cada cambio al agente debe seguir cumpliéndolos.
- ``manage.py evaluar_agente --dispositivo NC-0501``: los corre contra los datos reales de un
  dispositivo y da el porcentaje de aciertos, sin guardar nada.

Campos de cada caso:
- ``pregunta`` y, si es un seguimiento, ``anterior``.
- ``intencion``: la herramienta que debe elegir el intérprete.
- ``variables``: las variables que debe entender (opcional).
- ``contiene`` / ``no_contiene``: frases (sin acentos, minúsculas) que la respuesta debe tener o
  no tener. Solo se usan frases que no dependen de los datos del dispositivo.

Para agregar un caso nuevo, toma la pregunta del registro (``evaluar_agente --fallas`` lista las
👎 y las no entendidas) y escribe lo que se esperaba.
"""

CASOS = [
    # ── Variables ────────────────────────────────────────────────────────────────────────
    {"pregunta": "¿Hubo picos de temperatura?", "intencion": "variable", "variables": ["TEMP"]},
    {"pregunta": "¿cómo está la humedad?", "intencion": "variable", "variables": ["HUM"]},
    {"pregunta": "¿qué tal el aire?", "intencion": "variable", "variables": ["AIRE"]},
    {
        "pregunta": "¿cuál fue la temperatura máxima de ayer?",
        "intencion": "variable",
        "variables": ["TEMP"],
        "no_contiene": ["humedad"],
    },
    {"pregunta": "¿hace mucho calor?", "intencion": "variable", "variables": ["TEMP"]},
    # ── Última medición (falló: devolvía 7 días o la humedad) ─────────────────────────────
    {
        "pregunta": "la última medición del aire",
        "intencion": "ultima",
        "variables": ["AIRE"],
        "no_contiene": ["humedad", "ultimos 7 dias"],
    },
    {
        "pregunta": "te pedí la última medición, no de los últimos 7 días",
        "anterior": "gráfica de la última medición del aire",
        "intencion": "grafica",
        "variables": ["AIRE"],
        "contiene": ["la ultima medicion"],
        "no_contiene": ["humedad", "los ultimos 7 dias"],
    },
    # ── Resumen sin variable (falló: elegía la humedad) ───────────────────────────────────
    {
        "pregunta": "dame las medidas del sensor",
        "intencion": "resumen",
        "contiene": ["pregunta"],
    },
    # ── Texto al azar y fuera de alcance (fallaron con las capturas) ──────────────────────
    {
        "pregunta": "anskjndiaidsbajswdbjBK",
        "intencion": "no_entendida",
        "contiene": ["no entendi"],
        "no_contiene": ["humedad"],
    },
    {
        "pregunta": "anskjndiaidsbajswdbjBK PRIMER SENSOR",
        "intencion": "sensores",
        "contiene": ["ignore", "sensor"],
        "no_contiene": ["humedad relativa promedio"],
    },
    {
        "pregunta": "PUEDES DARME MEDIDAS DE UN SENSOR DE EL AREA DE VENTAS",
        "intencion": "resumen",
        "contiene": ["no hay un area llamada «ventas»"],
        "no_contiene": ["promedio"],
    },
    {
        "pregunta": "PERO NO TENGO AREA DE VENTAS",
        "anterior": "PUEDES DARME MEDIDAS DE UN SENSOR DE EL AREA DE VENTAS",
        "intencion": "no_entendida",
        "contiene": ["ventas"],
        "no_contiene": ["promedio"],
    },
    {
        "pregunta": "¿cómo está Núcleo A-99?",
        "contiene": ["solo responde sobre"],
    },
    # «Sí la tengo» tras un área que no existe (falló: se juntó con la anterior y dio la
    # temperatura de A-01).
    {
        "pregunta": "si si tengo uno",
        "anterior": "como esta la temperatura del departamento de ventas",
        "contiene": ["revise de nuevo", "ventas", "empresa y areas"],
        "no_contiene": ["promedio", "se mantuvo"],
    },
    {
        "pregunta": "como esta la temperatura del departamento de ventas",
        "contiene": ["no hay un area llamada «ventas»", "las areas que puedes consultar"],
    },
    {
        "pregunta": "¿y la humedad?",
        "anterior": "como esta la temperatura del departamento de ventas",
        "variables": ["HUM"],
        "no_contiene": ["ventas"],
    },
    {"pregunta": "¿qué áreas tengo?", "intencion": "areas", "contiene": ["esta en el area"]},
    # Seguimiento sin variable (falló: «Solo puedo responder…»).
    {
        "pregunta": "bueno, entonces dame acerca de lo ultimo que tienes registrado",
        "anterior": "¿Cómo estuvo la temperatura esta semana?",
        "intencion": "ultima",
        "contiene": ["ultima medicion"],
        "no_contiene": ["solo puedo responder"],
    },
    {
        "pregunta": "bueno, entonces dame acerca de lo ultimo que tienes registrado",
        "anterior": "¿cómo está la temperatura del área de ventas?",
        "contiene": ["ultima medicion"],
        "no_contiene": ["no estoy seguro"],
    },
    {
        "pregunta": "dame lo último que tienes registrado",
        "intencion": "ultima",
        "contiene": ["ultima medicion"],
    },
    # ── Catálogo del SRS ────────────────────────────────────────────────────────────────
    {"pregunta": "¿qué sensores tiene?", "intencion": "sensores", "contiene": ["dht22"]},
    {"pregunta": "el segundo sensor", "intencion": "sensores", "contiene": ["ccs811"]},
    {
        "pregunta": "¿cuál es el límite de temperatura?",
        "intencion": "umbrales",
        "variables": ["TEMP"],
        "contiene": ["solo los consulto"],
    },
    {"pregunta": "¿cuáles son los umbrales?", "intencion": "umbrales"},
    {"pregunta": "¿qué reportes hay?", "intencion": "reportes", "contiene": ["reportes"]},
    {"pregunta": "¿sigue conectado?", "intencion": "conexion", "contiene": ["muestreo"]},
    {"pregunta": "¿hubo alertas hoy?", "intencion": "alertas"},
    {"pregunta": "gráfica de la temperatura", "intencion": "grafica", "variables": ["TEMP"]},
    {
        "pregunta": "compara la humedad de esta semana con la pasada",
        "intencion": "comparativa",
        "variables": ["HUM"],
    },
    # ── Solo lectura (SRS 3.2.12: no modifica umbrales, usuarios ni dispositivos) ─────────
    {
        "pregunta": "cambia el umbral de temperatura a 30",
        "intencion": "umbrales",
        "contiene": ["no puedo hacer cambios"],
        "no_contiene": ["listo", "cambie", "actualice"],
    },
    # ── Banco de memoria, pendientes, detalle de alertas y programaciones ────────────────
    {"pregunta": "¿por qué dice calentando?", "intencion": "banco", "contiene": ["20 minutos"]},
    {"pregunta": "¿qué significa nivel de advertencia?", "intencion": "banco"},
    {"pregunta": "¿qué puedes hacer?", "intencion": "banco", "contiene": ["no modifico"]},
    {
        "pregunta": "atiende la alerta",
        "intencion": "modificar",
        "contiene": ["panel de alertas"],
        "no_contiene": ["listo"],
    },
    {"pregunta": "¿qué hay pendiente?", "intencion": "pendientes"},
    {"pregunta": "¿algo está en peligro?", "intencion": "pendientes"},
    {"pregunta": "¿quién atendió la alerta de ayer?", "intencion": "detalle_alerta"},
    {"pregunta": "¿qué reportes tengo programados?", "intencion": "programaciones"},
    {
        "pregunta": "hazme un reporte",
        "intencion": "reporte",
        "contiene": ["de que periodo"],
        "no_contiene": ["listo"],
    },
    # ── Envíos y programaciones (dos pasos: nada se guarda ni se envía sin «sí») ──────────
    {
        "pregunta": "programa un reporte semanal",
        "intencion": "programar",
        "contiene": ["a quien"],
        "no_contiene": ["listo"],
    },
    {
        "pregunta": "programa un reporte para mí",
        "intencion": "programar",
        "contiene": ["cada cuando"],
    },
    {"pregunta": "cancela la programación semanal", "intencion": "cancelar_programacion"},
    {"pregunta": "cambia la programación semanal a mensual", "intencion": "editar_programacion"},
    {
        "pregunta": "envía el último reporte a mi correo",
        "intencion": "enviar",
        "no_contiene": ["listo", "envie"],
    },
    # ── Saludos y estado general (fallaron: «Solo puedo responder…» a un saludo) ─────────
    {
        "pregunta": "hola nico como estas",
        "intencion": "comentario",
        "contiene": ["muy bien", "soy nico ai"],
        "no_contiene": ["solo puedo responder"],
    },
    {
        "pregunta": "pero tu estas bien",
        "anterior": "hola nico como estas",
        "contiene": ["muy bien"],
        "no_contiene": ["no estoy seguro"],
    },
    {
        "pregunta": "y tu?",
        "anterior": "¿cómo está la temperatura?",
        "contiene": ["muy bien"],
        "no_contiene": ["promedio"],
    },
    {
        "pregunta": "como esta el nucleo",
        "intencion": "estado",
        "contiene": ["muestreo"],
        "no_contiene": ["solo puedo responder"],
    },
    {"pregunta": "el nucleo en el que estoy como esta", "intencion": "estado"},
    {"pregunta": "¿cómo están los sensores?", "intencion": "sensores", "contiene": ["dht22"]},
    {"pregunta": "¿cómo está el dispositivo ahorita?", "intencion": "estado"},
    # ── Fuera de la burbuja (fallaron: «Solo puedo responder…» o datos que no se pidieron) ─
    {"pregunta": "cuéntame un chiste", "contiene": ["solo puedo responder"]},
    {"pregunta": "¿cuál es la capital de Francia?", "contiene": ["solo puedo responder"]},
    {"pregunta": "¿quién eres?", "contiene": ["soy nico ai"]},
    {"pregunta": "¿eres un robot?", "contiene": ["no soy una persona"]},
    {
        "pregunta": "¿qué hora es?",
        "contiene": ["hora de tijuana"],
        "no_contiene": ["no estoy seguro"],
    },
    {"pregunta": "¿qué día es hoy?", "contiene": ["hoy es"], "no_contiene": ["no estoy seguro"]},
    {"pregunta": "me siento triste hoy", "contiene": ["lamento"]},
    {"pregunta": "adiós nico", "contiene": ["hasta luego"]},
    {"pregunta": "necesito ayuda", "contiene": ["que quieres revisar"]},
    {"pregunta": "eres tonto", "contiene": ["lamento"]},
    {"pregunta": "jaja", "no_contiene": ["solo puedo responder"]},
    {
        "pregunta": "puedes encender el aire acondicionado",
        "contiene": ["no puedo encender"],
        "no_contiene": ["ppm"],
    },
    {"pregunta": "apaga el dispositivo", "contiene": ["no puedo encender"]},
    {
        "pregunta": "¿cómo está el clima afuera?",
        "contiene": ["no tengo el clima de afuera"],
        "no_contiene": ["bateria"],
    },
    {"pregunta": "¿hablas inglés?", "contiene": ["solo respondo en espanol"]},
    # ── Conversación ────────────────────────────────────────────────────────────────────
    {"pregunta": "gracias", "intencion": "comentario", "contiene": ["con gusto"]},
    {"pregunta": "sí", "intencion": "comentario", "contiene": ["que mas quieres saber"]},
    {"pregunta": "no gracias", "intencion": "comentario", "contiene": ["aqui estoy"]},
    {
        "pregunta": "aquí hace mucho calor",
        "intencion": "ultima",
        "variables": ["TEMP"],
        "contiene": ["lo reviso", "ultima medicion"],
    },
    {
        "pregunta": "el sensor está fallando",
        "intencion": "conexion",
        "contiene": ["reviso el equipo", "sensores"],
    },
    {"pregunta": "hola", "intencion": "comentario", "contiene": ["soy nico ai"]},
    {"pregunta": "pues solo dame eso cuando te lo pida", "intencion": "comentario"},
    {
        "pregunta": "¿quién ganó el partido?",
        "intencion": "no_entendida",
        "contiene": ["solo puedo responder"],
    },
]
