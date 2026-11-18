#!/usr/bin/env python3
"""Genera los diagramas de avance contra el SRS y el bloque de avance del README.

Cada criterio sale de una sección del SRS (Docs/PDFs/SRS.pdf). Para actualizar el avance se cambia
su estado en CRITERIOS y se ejecuta: python3 Docs/progreso/generar.py
"""
from pathlib import Path
from xml.sax.saxutils import escape

CARPETA = Path(__file__).resolve().parent
README = CARPETA.parent.parent / "README.md"
H, P, N = "hecho", "parcial", "pendiente"

# (versión, fecha, hito, commit de referencia)
VERSIONES = [
    ("0.1.0", "2026-10-24", "Base: API, modelo de datos, broker y firmware", "6359af7"),
    ("0.2.0", "2026-11-04", "Interfaces web y móvil con datos simulados", "cc3b3e0"),
    ("0.3.0", "2026-11-08", "Web y app conectadas a la API, en vivo y con agente", "f61062c"),
    ("0.4.0", "2026-11-09", "Primer despliegue en servidor y APK publicado", "f1b731c"),
    ("0.5.0", "2026-11-10", "Notificaciones push y avisos en el teléfono", "68a9b8f"),
    ("0.6.0", "2026-11-11", "Producción en bynucleo.com con HTTPS", "764b883"),
    ("0.7.0", "2026-11-15", "Seguridad reforzada y respaldos cifrados", "e514afd"),
    ("0.8.0", "2026-11-16", "ESP32 físico midiendo en producción", "24f5648"),
    ("0.9.0", "2026-11-18", "CCS811 real, avisos a responsables y landing", "ddbcf05"),
]

GRUPOS = ["Interfaces (SRS 3.1)", "Requisitos funcionales (SRS 3.2)", "No funcionales y otros (SRS 3.3 y 3.4)"]

# (grupo, sección, criterio, estado, versión en que se cumplió, nota)
CRITERIOS = [
    (0, "3.1.1", "Web en modo claro y oscuro", H, "0.2.0", ""),
    (0, "3.1.1", "Panel web con datos en tiempo real", H, "0.3.0", ""),
    (0, "3.1.1", "Gráficas con filtros de fecha, ubicación y sensor", H, "0.3.0", ""),
    (0, "3.1.1", "Panel de alertas por severidad y estado", H, "0.3.0", ""),
    (0, "3.1.1", "Formularios de parámetros y umbrales", H, "0.3.0", ""),
    (0, "3.1.1", "Reportes e históricos con IA", H, "0.3.0", ""),
    (0, "3.1.1", "Agente de IA en la web", H, "0.3.0", ""),
    (0, "3.1.1", "App en modo claro y oscuro", H, "0.8.0", ""),
    (0, "3.1.1", "App con lecturas actuales", H, "0.3.0", ""),
    (0, "3.1.1", "App con dispositivos del área para el supervisor", H, "0.5.0", ""),
    (0, "3.1.1", "App con alertas visuales, sonoras y push", H, "0.5.0", ""),
    (0, "3.1.1", "App con tendencias de 24 horas", H, "0.3.0", ""),
    (0, "3.1.1", "App adaptable a distintas pantallas", H, "0.3.0", ""),
    (0, "3.1.1", "Modo de bajo consumo en la app", P, "", "Solo existe «Reducir animaciones»"),
    (0, "3.1.1", "Pantalla OLED en la unidad física", H, "0.8.0", ""),
    (0, "3.1.1", "LED RGB de nivel en la unidad física", P, "", "Programado; falta confirmarlo en la placa"),
    (0, "3.1.1", "LED de estado Wi-Fi", P, "", "Programado; falta confirmarlo en la placa"),
    (0, "3.1.1", "Zumbador de alertas", P, "", "Programado; falta confirmarlo en la placa"),
    (0, "3.1.2", "Sensores DHT22 y CCS811 en el ESP32", H, "0.9.0", ""),
    (0, "3.1.2", "Batería de litio con módulo de carga", P, "", "Programada; falta conectarla y probarla"),
    (0, "3.1.2", "Carcasa impresa en 3D", P, "", "Diseño beta; falta la pieza final"),
    (0, "3.1.3", "PostgreSQL y TimescaleDB separadas", H, "0.1.0", ""),
    (0, "3.1.4", "MQTT con TLS y sin acceso anónimo", H, "0.1.0", ""),
    (0, "3.1.4", "Configuración retenida para el dispositivo", H, "0.1.0", ""),
    (0, "3.1.4", "Consulta de lecturas cada 30 segundos", H, "0.3.0", ""),
    (0, "3.1.4", "Canal en vivo autenticado con token", H, "0.3.0", ""),
    (0, "3.1.4", "App en segundo plano recibe alertas por push", H, "0.5.0", ""),
    (1, "3.2.1", "Lectura automática con intervalo configurable", H, "0.8.0", ""),
    (1, "3.2.1", "Calentamiento del CCS811 de 20 minutos", H, "0.8.0", ""),
    (1, "3.2.1", "Acondicionamiento inicial de 48 horas", N, "", "Falta registrarlo por sensor"),
    (1, "3.2.2", "Clasificación normal, advertencia y peligro", H, "0.1.0", ""),
    (1, "3.2.2", "Respuesta con LED RGB y alarma sonora", P, "", "Programada; falta confirmarla en la placa"),
    (1, "3.2.2", "Registro de nivel, estado, responsable y hora", H, "0.1.0", ""),
    (1, "3.2.2", "Sin alertas repetidas y con escalamiento", H, "0.1.0", ""),
    (1, "3.2.2", "Correo a los responsables", H, "0.3.0", ""),
    (1, "3.2.2", "Push a los responsables", H, "0.5.0", ""),
    (1, "3.2.3", "Datos en web, app y dispositivo", H, "0.8.0", ""),
    (1, "3.2.4", "Cinco roles con funciones definidas", H, "0.1.0", ""),
    (1, "3.2.4", "Aislamiento de datos por organización", H, "0.1.0", ""),
    (1, "3.2.4", "Administración de organizaciones", H, "0.3.0", ""),
    (1, "3.2.4", "Alcance por área y dispositivo asignado", H, "0.1.0", ""),
    (1, "3.2.5", "Validación del orden de los umbrales", H, "0.1.0", ""),
    (1, "3.2.5", "Rangos físicos y descarte de lecturas inválidas", H, "0.1.0", ""),
    (1, "3.2.6", "Flujo completo del sensor a las aplicaciones", H, "0.8.0", ""),
    (1, "3.2.7", "Dispositivo sigue alertando sin conexión", H, "0.8.0", ""),
    (1, "3.2.7", "Estado «Sin conexión» tras 3 intervalos", H, "0.1.0", ""),
    (1, "3.2.8", "Salidas en PDF y correo programado", H, "0.3.0", ""),
    (1, "3.2.9", "Respuesta automática ante condiciones inseguras", H, "0.3.0", ""),
    (1, "3.2.10", "Almacenamiento completo de cada medición", H, "0.1.0", ""),
    (1, "3.2.11", "Histórico y gráficas de tendencia", H, "0.3.0", ""),
    (1, "3.2.12", "Reportes con cifras del backend y texto de IA", H, "0.3.0", ""),
    (1, "3.2.12", "Reportes programados por frecuencia y área", H, "0.3.0", ""),
    (1, "3.2.12", "Respuesta 503 sin servicio de IA", H, "0.1.0", ""),
    (1, "3.2.12", "Agente de solo lectura en lenguaje natural", H, "0.3.0", ""),
    (2, "3.3.1", "Varios dispositivos y organizaciones sin cambiar código", H, "0.3.0", ""),
    (2, "3.3.1", "Tiempos e índices para comprobar los 2 minutos", H, "0.1.0", ""),
    (2, "3.3.2", "Comunicación por HTTPS y TLS", H, "0.6.0", ""),
    (2, "3.3.2", "Bases privadas y contraseñas cifradas", H, "0.4.0", ""),
    (2, "3.3.2", "Usuario propio para cada base de datos", H, "0.1.0", ""),
    (2, "3.3.2", "Límite de intentos y caducidad del token", H, "0.1.0", ""),
    (2, "3.3.3", "100 horas continuas sin fallas", N, "", "Falta la prueba de duración"),
    (2, "3.3.3", "Restricciones de integridad en la base de datos", H, "0.1.0", ""),
    (2, "3.3.4", "Disponibilidad del 99 %", P, "", "Hay vigía externo; falta medirla en un periodo"),
    (2, "3.3.5", "Estado y calibración de cada sensor", H, "0.1.0", ""),
    (2, "3.3.6", "Chrome, Edge, Firefox y Safari", P, "", "Falta la prueba formal en los cuatro navegadores"),
    (2, "3.3.6", "App disponible para Android", H, "0.4.0", ""),
    (2, "3.3.6", "Hardware completamente portátil", P, "", "Depende de la batería"),
    (2, "3.4", "Reportes y respuestas sin capacitación previa", H, "0.3.0", ""),
]

TEMAS = {
    "claro": dict(fondo="#FFFFFF", tarjeta="#F3F4F0", borde="#DEE1D8", texto="#121413", texto2="#4A4F4B",
                  vacio="#E3E6DE", hecho="#2BC47A", parcial="#F5B53D", linea="#DEE1D8", plan="#62675F"),
    "oscuro": dict(fondo="#1A1C1C", tarjeta="#232626", borde="#2C302F", texto="#F3F5F2", texto2="#B4BAB6",
                   vacio="#2F3332", hecho="#2BC47A", parcial="#F5B53D", linea="#2C302F", plan="#8C928E"),
}
FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def texto(x, y, contenido, color, tam=14, peso=400, ancla="start"):
    return (f'<text x="{x}" y="{y}" fill="{color}" font-size="{tam}" font-weight="{peso}" '
            f'text-anchor="{ancla}">{escape(contenido)}</text>')


def lienzo(ancho, alto, t, cuerpo, titulo):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{ancho}" height="{alto}" viewBox="0 0 {ancho} {alto}" '
            f'role="img" aria-label="{escape(titulo)}" font-family="{FUENTE}"><title>{escape(titulo)}</title>'
            f'<rect x="1" y="1" width="{ancho - 2}" height="{alto - 2}" rx="20" fill="{t["fondo"]}" '
            f'stroke="{t["borde"]}"/>{"".join(cuerpo)}</svg>\n')


def cuenta(lista):
    return {e: sum(1 for c in lista if c[3] == e) for e in (H, P, N)}


def porcentaje(n, total):
    return round(n * 100 / total)


def diagrama_srs(t):
    total, c = len(CRITERIOS), cuenta(CRITERIOS)
    color = {H: t["hecho"], P: t["parcial"], N: t["vacio"]}
    ancho, m, lado, sep, por_fila = 920, 28, 40, 8, 18
    o = [texto(m, 44, "Avance contra el SRS", t["texto"], 21, 700),
         texto(m, 68, "Cada cuadro es un criterio verificable del documento de requisitos", t["texto2"], 14)]
    tarjetas = [("Cumplido", c[H], t["hecho"]), ("En progreso", c[P], t["parcial"]), ("Pendiente", c[N], t["plan"])]
    w = (ancho - 2 * m - 2 * 12) / 3
    for i, (nombre, n, tono) in enumerate(tarjetas):
        x = m + i * (w + 12)
        o.append(f'<rect x="{x:.1f}" y="88" width="{w:.1f}" height="84" rx="14" fill="{t["tarjeta"]}"/>')
        o.append(texto(round(x + 18, 1), 116, nombre, t["texto2"], 14, 600))
        o.append(texto(round(x + 18, 1), 152, f"{porcentaje(n, total)} %", t["texto"], 28, 800))
        o.append(texto(round(x + w - 18, 1), 152, f"{n} de {total}", tono if nombre != "Pendiente" else t["texto2"], 14, 700, "end"))
    y = 206
    for g, nombre in enumerate(GRUPOS):
        del_grupo = sorted((c for c in CRITERIOS if c[0] == g), key=lambda c: (H, P, N).index(c[3]))
        hechos = cuenta(del_grupo)[H]
        o.append(texto(m, y, nombre, t["texto"], 15, 700))
        o.append(texto(ancho - m, y, f"{hechos} de {len(del_grupo)}", t["texto2"], 14, 600, "end"))
        y += 14
        for i, cr in enumerate(del_grupo):
            x = m + (i % por_fila) * (lado + sep)
            fy = y + (i // por_fila) * (lado + sep)
            o.append(f'<rect x="{x}" y="{fy}" width="{lado}" height="{lado}" rx="8" fill="{color[cr[3]]}"/>')
        filas = (len(del_grupo) + por_fila - 1) // por_fila
        y += filas * (lado + sep) + 26
    x = m
    for nombre, tono in (("Cumplido", t["hecho"]), ("En progreso", t["parcial"]), ("Pendiente", t["vacio"])):
        o.append(f'<rect x="{x}" y="{y - 12}" width="14" height="14" rx="4" fill="{tono}"/>')
        o.append(texto(x + 22, y, nombre, t["texto2"], 14))
        x += 130
    return lienzo(ancho, y + 26, t, o, f"Avance contra el SRS: {c[H]} de {total} criterios cumplidos")


def acumulado(version):
    orden = [v[0] for v in VERSIONES]
    return sum(1 for c in CRITERIOS if c[3] == H and orden.index(c[4]) <= orden.index(version))


def diagrama_versiones(t):
    total = len(CRITERIOS)
    ancho, m, fila = 920, 28, 58
    o = [texto(m, 44, "Plan de versiones", t["texto"], 21, 700),
         texto(m, 68, "Hitos del proyecto y criterios del SRS cumplidos en cada versión", t["texto2"], 14)]
    filas = [(v, f, h, acumulado(v), False) for v, f, h, _ in VERSIONES] + [("1.0.0", "Planeada", "Todos los criterios del SRS cumplidos y probados", total, True)]
    y0, xlinea, xbarra, wbarra = 104, m + 8, 620, 200
    o.append(f'<line x1="{xlinea}" y1="{y0}" x2="{xlinea}" y2="{y0 + fila * (len(filas) - 1)}" stroke="{t["linea"]}" stroke-width="2"/>')
    for i, (v, f, h, n, plan) in enumerate(filas):
        y = y0 + i * fila
        actual = i == len(VERSIONES) - 1
        if plan:
            o.append(f'<circle cx="{xlinea}" cy="{y}" r="7" fill="{t["fondo"]}" stroke="{t["plan"]}" stroke-width="2" stroke-dasharray="3 3"/>')
        else:
            o.append(f'<circle cx="{xlinea}" cy="{y}" r="7" fill="{t["hecho"]}"/>')
        o.append(texto(m + 30, y - 2, f"v{v}" + ("  · actual" if actual else ""), t["texto"], 15, 700))
        o.append(texto(m + 30, y + 18, f, t["texto2"], 13))
        o.append(texto(m + 170, y + 6, h, t["texto"] if not plan else t["texto2"], 14, 500))
        o.append(f'<rect x="{xbarra}" y="{y - 5}" width="{wbarra}" height="10" rx="5" fill="{t["vacio"]}"/>')
        if not plan:
            o.append(f'<rect x="{xbarra}" y="{y - 5}" width="{max(10, round(wbarra * n / total))}" height="10" rx="5" fill="{t["hecho"]}"/>')
        o.append(texto(ancho - m, y + 5, f"{porcentaje(n, total)} %", t["texto"] if not plan else t["texto2"], 14, 700, "end"))
    return lienzo(ancho, y0 + fila * (len(filas) - 1) + 40, t, o, "Plan de versiones de Núcleo según el avance del SRS")


def bloque_readme():
    total, c = len(CRITERIOS), cuenta(CRITERIOS)
    img = lambda nombre, alt: (f'<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="Docs/progreso/{nombre}-oscuro.svg">\n'
                               f'  <img src="Docs/progreso/{nombre}-claro.svg" alt="{alt}" width="100%">\n</picture>')
    r = ["<!-- avance:inicio (generado con Docs/progreso/generar.py) -->", "## Avance contra el SRS", "",
         f"Núcleo cumple **{c[H]} de {total} criterios ({porcentaje(c[H], total)} %)** de la "
         f"[especificación de requisitos](Docs/PDFs/SRS.pdf); {c[P]} están en progreso y {c[N]} pendientes.", "",
         img("srs", f"Avance contra el SRS: {c[H]} de {total} criterios cumplidos"), "",
         "| Área del SRS | Cumplido | En progreso | Pendiente |", "| --- | ---: | ---: | ---: |"]
    for g, nombre in enumerate(GRUPOS):
        k = cuenta([x for x in CRITERIOS if x[0] == g])
        r.append(f"| {nombre} | {k[H]} | {k[P]} | {k[N]} |")
    r += [f"| **Total** | **{c[H]}** | **{c[P]}** | **{c[N]}** |", "", "**Lo que falta para cumplir el SRS:**", ""]
    r += [f"- {'En progreso' if x[3] == P else 'Pendiente'} · {x[2]} (SRS {x[1]}): {x[5]}." for x in CRITERIOS if x[3] != H]
    r += ["", "<details>", "<summary>Ver los criterios cumplidos</summary>", "", "| SRS | Criterio | Versión |", "| --- | --- | --- |"]
    r += [f"| {x[1]} | {x[2]} | {x[4]} |" for x in CRITERIOS if x[3] == H]
    r += ["", "</details>", "", "## Plan de versiones", "",
          f"La versión actual del proyecto es **{VERSIONES[-1][0]}**. Cada versión marca un avance real contra el SRS y "
          "el detalle está en el **[CHANGELOG](CHANGELOG.md)**.", "",
          img("versiones", "Plan de versiones de Núcleo según el avance del SRS"), "", "<!-- avance:fin -->"]
    return "\n".join(r) + "\n"


def main():
    for tema, t in TEMAS.items():
        (CARPETA / f"srs-{tema}.svg").write_text(diagrama_srs(t), encoding="utf-8")
        (CARPETA / f"versiones-{tema}.svg").write_text(diagrama_versiones(t), encoding="utf-8")
    actual = README.read_text(encoding="utf-8")
    if "<!-- avance:inicio" in actual:
        actual = actual[:actual.index("<!-- avance:inicio")].rstrip() + "\n"
    README.write_text(actual.rstrip() + "\n\n" + bloque_readme(), encoding="utf-8")
    c = cuenta(CRITERIOS)
    print(len(CRITERIOS), c, [(v[0], acumulado(v[0]), porcentaje(acumulado(v[0]), len(CRITERIOS))) for v in VERSIONES])


if __name__ == "__main__":
    main()
