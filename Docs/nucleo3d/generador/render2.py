"""Dibuja las hojas SVG de Núcleo beta a partir de modelo2.py. Todas las medidas salen del modelo."""
import sys, copy, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Camara, dibujar, Caja
import modelo2 as m

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = 'font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"'
DEFS = ('<defs><marker id="fl" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L10 5 L0 9 z" fill="#0f172a"/></marker></defs>')
W, D, H, P = m.W, m.D, m.H, m.P
def n(mm): return '%g' % round(mm / 10, 2)
def cm(mm): return n(mm) + ' cm'
def cm3(a, b, c): return f'{n(a)} × {n(b)} × {n(c)} cm'
def bb(cajas):
    return (min(c.b[0] for c in cajas), min(c.b[1] for c in cajas), min(c.b[2] for c in cajas),
            max(c.b[3] for c in cajas), max(c.b[4] for c in cajas), max(c.b[5] for c in cajas))
def tam(b): return cm3(b[3] - b[0], b[4] - b[1], b[5] - b[2])

PIEZAS = m.piezas()
HILOS = m.cables()
PLUGS = m.conectores_placa()
SOPORTES = m.esqueleto_extra()
POR_NOMBRE = {p.nombre: p for p in PIEZAS}
NOMBRE_PARTE = {'A': 'Base', 'B': 'Separador', 'C': 'Tapa frontal', 'D': 'Tapa de la cámara'}
COLOR_PARTE = {'A': '#e5e9ef', 'B': '#c7d2fe', 'C': '#fde7c2', 'D': '#bbf7d0'}
def grupos_soporte(parte=None):
    g = {}
    for c in SOPORTES:
        if parte and c.parte != parte: continue
        g.setdefault(c.soporte, []).append(c)
    return g

# ── Orden de dibujo y escenas ───────────────────────────────────────────
def caja_vista(c, fantasma=False, destacar=False, tinte=False):
    k = copy.copy(c)
    if fantasma:
        k.opacidad = 0.13; k.borde = '#94a3b8'; k.punteada = True; k.deco = {}; return k
    if destacar: k.borde = '#7c3aed'
    if tinte and hasattr(c, 'parte'): k.color = COLOR_PARTE[c.parte]
    return k

def clave(cam, bb_, tipo):
    """Orden de dibujo: zona (cámara / puente / cuerpo) y, dentro del cuerpo, capas de fondo."""
    x0, y0, z0, x1, y1, z1 = bb_
    cen = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    prof = cam.prof(cen)
    der = cam.d[0] >= 0
    if x1 <= m.TX1 + 0.01: zona = 'torre'
    elif x0 < 0 - 0.01: zona = 'puente'
    else: zona = 'cuerpo'
    orden_zona = {'torre': 1, 'puente': 2, 'cuerpo': 3} if der else {'cuerpo': 1, 'puente': 2, 'torre': 3}
    piso = tipo == 'pared' and (z1 <= P + 0.01 or (z0 == m.TZ0 and z1 == m.TZ0 + 2))
    if piso:
        return (0 if cam.d[2] >= 0 else 9, 0, prof)
    if abs(cam.d[1]) < 0.3 or zona == 'torre':
        return (orden_zona[zona], 0, prof)
    frente_cam = cam.d[1] < 0
    if tipo == 'pared' and zona == 'cuerpo':
        if x1 <= P + 0.01: sub = -1e3 if der else 1e3
        elif x0 >= W - P - 0.01: sub = 1e3 if der else -1e3
        elif y0 >= D - P - 0.01: sub = -1e3 if frente_cam else 1e3
        elif y1 <= P + 0.01: sub = 1e3 if frente_cam else -1e3
        elif z0 >= H - P - 0.01: sub = 2e3 if cam.d[2] >= 0 else -2e3
        else: sub = 0
        return (orden_zona[zona], sub, prof)
    yk = (y0 if frente_cam else y1) if tipo == 'tramo' else cen[1]
    return (orden_zona[zona], -yk if frente_cam else yk, prof)

def items_escena(cam, quitar=(), piezas=True, esqueleto=False, cables=False, fantasma_frente=False, solo=None,
                 fantasma_todo=False, con_carcasa=True, partes=None, mostrar=None, fantasma=(), nuevas=(), cables_de=None, tinte=False):
    """Elementos ordenados de atrás hacia adelante. `partes` limita paredes y soportes a esas piezas impresas;
    `mostrar` limita los módulos; `fantasma` los dibuja transparentes y `nuevas` los resalta."""
    it = []
    def agrega(cajas, tipo='caja'):
        cajas = list(cajas)
        if not cajas: return
        def svg():
            o = []
            for c in sorted(cajas, key=lambda c: cam.prof(c.centro())): o += dibujar(cam, c)
            return o
        it.append((clave(cam, bb(cajas), tipo), svg))
    if con_carcasa:
        cu, ca, pu = m.carcasa(quitar)
        for c in cu + ca + pu:
            if partes is None or c.parte in partes: agrega([caja_vista(c, tinte=tinte)], 'pared')
    if esqueleto:
        for c in SOPORTES:
            if partes is None or c.parte in partes: agrega([caja_vista(c, fantasma_todo, tinte=tinte)])
    if piezas:
        for p in PIEZAS:
            if mostrar is not None and p.nombre not in mostrar and p.nombre not in fantasma: continue
            if solo is not None:
                fant = p.nombre != solo
                agrega([caja_vista(c, fantasma=fant, destacar=not fant) for c in p.cajas])
            else:
                fant = fantasma_todo or (fantasma_frente and p.zona == 'frente') or p.nombre in fantasma
                agrega([caja_vista(c, fantasma=fant, destacar=p.nombre in nuevas) for c in p.cajas])
    if cables:
        if piezas and (mostrar is None or 'Placa de expansión' in mostrar):
            for h, c in zip([h for h in HILOS if abs(h.puntos[-1][1] - m.YP) < 1e-6], PLUGS):
                if cables_de is None or h.pieza in cables_de: agrega([c])
        for h in HILOS:
            if solo is not None and h.pieza != solo: continue
            if cables_de is not None and h.pieza not in cables_de: continue
            for a, b in zip(h.puntos, h.puntos[1:]):
                bb_ = tuple(min(a[i], b[i]) for i in range(3)) + tuple(max(a[i], b[i]) for i in range(3))
                def svg(a=a, b=b, color=h.color):
                    pa, pb = cam.p(a), cam.p(b)
                    w = max(1.8, 0.9 * cam.s)
                    return [f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{pb[0]:.1f}" y2="{pb[1]:.1f}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="{w+1.6:.1f}" stroke-linecap="round"/>',
                            f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{pb[0]:.1f}" y2="{pb[1]:.1f}" stroke="{color}" stroke-width="{w:.1f}" stroke-linecap="round"/>']
                k = clave(cam, bb_, 'tramo')
                it.append(((k[0], k[1] - 0.01 if cam.d[1] < 0 else k[1] + 0.01, k[2]), svg))
    it.sort(key=lambda t: t[0])
    o = []
    for _, f in it: o += f()
    return o

def puntos_de(cajas):
    return [(x, y, z) for c in cajas for x in (c.b[0], c.b[3]) for y in (c.b[1], c.b[4]) for z in (c.b[2], c.b[5])]
def encuadrar(cam, cajas, x0, y0, w, h):
    pts = [cam.p(q) for q in puntos_de(cajas)]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    cam.ox += x0 + w / 2 - (min(xs) + max(xs)) / 2
    cam.oy += y0 + h / 2 - (min(ys) + max(ys)) / 2
def escala_para(yaw, pitch, cajas, w, h):
    cam = Camara(yaw, pitch, 1, 0, 0)
    pts = [cam.p(q) for q in puntos_de(cajas)]
    ancho = max(p[0] for p in pts) - min(p[0] for p in pts); alto = max(p[1] for p in pts) - min(p[1] for p in pts)
    return min(w / max(ancho, 1e-6), h / max(alto, 1e-6))
def caja_total():
    cu, ca, pu = m.carcasa(())
    return cu + ca + pu

def marcas(cam, nombres=None):
    o = []
    for p in PIEZAS:
        if nombres is not None and p.nombre not in nombres: continue
        x, y = cam.p(p.principal.centro())
        o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="10" fill="#7c3aed" stroke="#fff" stroke-width="2"/><text x="{x:.1f}" y="{y+4:.1f}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff">{p.num}</text>')
    return o

def cota3d(cam, A, B, off, texto):
    A2 = tuple(a + o for a, o in zip(A, off)); B2 = tuple(b + o for b, o in zip(B, off))
    pa, pb, qa, qb = cam.p(A), cam.p(B), cam.p(A2), cam.p(B2)
    mx, my = (qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2
    ancho = 8 + 7.2 * len(texto)
    return [f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{qa[0]:.1f}" y2="{qa[1]:.1f}" stroke="#64748b" stroke-width="0.8"/>',
            f'<line x1="{pb[0]:.1f}" y1="{pb[1]:.1f}" x2="{qb[0]:.1f}" y2="{qb[1]:.1f}" stroke="#64748b" stroke-width="0.8"/>',
            f'<line x1="{qa[0]:.1f}" y1="{qa[1]:.1f}" x2="{qb[0]:.1f}" y2="{qb[1]:.1f}" stroke="#0f172a" stroke-width="1.2" marker-start="url(#fl)" marker-end="url(#fl)"/>',
            f'<rect x="{mx-ancho/2:.1f}" y="{my-9:.1f}" width="{ancho:.1f}" height="17" rx="4" fill="#ffffff" fill-opacity="0.92"/>',
            f'<text x="{mx:.1f}" y="{my+4:.1f}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#0f172a">{texto}</text>']

def cota(p1, p2, texto, lado='abajo', sep=22, tam_letra=12.5):
    (x1, y1), (x2, y2) = p1, p2
    o = []
    if lado in ('abajo', 'arriba'):
        y = (max(y1, y2) + sep) if lado == 'abajo' else (min(y1, y2) - sep)
        o += [f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x1:.1f}" y2="{y:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x2:.1f}" y1="{y2:.1f}" x2="{x2:.1f}" y2="{y:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2:.1f}" y2="{y:.1f}" stroke="#0f172a" stroke-width="1.2" marker-start="url(#fl)" marker-end="url(#fl)"/>',
              f'<text x="{(x1+x2)/2:.1f}" y="{y-5 if lado == "arriba" else y+15:.1f}" text-anchor="middle" font-size="{tam_letra}" font-weight="700" fill="#0f172a">{texto}</text>']
    else:
        x = (max(x1, x2) + sep) if lado == 'der' else (min(x1, x2) - sep)
        o += [f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y1:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x2:.1f}" y1="{y2:.1f}" x2="{x:.1f}" y2="{y2:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y2:.1f}" stroke="#0f172a" stroke-width="1.2" marker-start="url(#fl)" marker-end="url(#fl)"/>',
              f'<text x="{x + 6 if lado == "der" else x - 6:.1f}" y="{(y1+y2)/2+4:.1f}" text-anchor="{"start" if lado == "der" else "end"}" font-size="{tam_letra}" font-weight="700" fill="#0f172a">{texto}</text>']
    return o

def hoja(w, h, titulo, subtitulo):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" {FONT}>', DEFS,
            f'<rect width="{w}" height="{h}" fill="#ffffff"/>',
            f'<text x="40" y="44" font-size="25" font-weight="800" fill="#0f172a">{titulo}</text>',
            f'<rect x="{48+len(titulo)*13.2}" y="22" width="74" height="28" rx="14" fill="#7c3aed"/><text x="{85+len(titulo)*13.2}" y="42" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" letter-spacing="2">BETA</text>',
            f'<text x="40" y="70" font-size="14" fill="#64748b">{subtitulo}</text>']

def marco(o, x, y, w, h, titulo, sub=None):
    o.append(f'<rect x="{x+6}" y="{y+6}" width="{w-12}" height="{h-12}" rx="14" fill="#f8fafc" stroke="#e2e8f0"/>')
    o.append(f'<text x="{x+24}" y="{y+34}" font-size="16" font-weight="700" fill="#0f172a">{titulo}</text>')
    if sub: o.append(f'<text x="{x+24}" y="{y+53}" font-size="12" fill="#64748b">{sub}</text>')

def vista(o, x, y, w, h, yaw, pitch, titulo, sub=None, escala=None, margen=70, extra=None, ref=None, **kw):
    marco(o, x, y, w, h, titulo, sub)
    ref = ref or caja_total()
    s = escala or escala_para(yaw, pitch, ref, w - 2 * margen, h - 70 - margen)
    cam = Camara(yaw, pitch, s, 0, 0)
    encuadrar(cam, ref, x, y + 55, w, h - 60)
    o += items_escena(cam, **kw)
    if extra: o += extra(cam)
    return cam

def tabla(o, x, y, filas, ancho_col=300, alto=23, titulo=None, tam=12.5):
    if titulo:
        o.append(f'<text x="{x}" y="{y}" font-size="16" font-weight="700" fill="#0f172a">{titulo}</text>'); y += 28
    for i, (a, b) in enumerate(filas):
        o.append(f'<text x="{x}" y="{y+i*alto}" font-size="{tam}" font-weight="700" fill="#0f172a">{a}</text><text x="{x+ancho_col}" y="{y+i*alto}" font-size="{tam}" fill="#334155">{b}</text>')
    return y + len(filas) * alto

def leyenda(o, x, y, w, columnas=4):
    o.append(f'<text x="{x}" y="{y}" font-size="16" font-weight="700" fill="#0f172a">Piezas (medidas reales del módulo, sin cables)</text>')
    filas = (len(PIEZAS) + columnas - 1) // columnas
    for k, p in enumerate(PIEZAS):
        col, fila = divmod(k, filas)
        cx, cy = x + col * (w / columnas), y + 30 + fila * 36
        o.append(f'<circle cx="{cx+10}" cy="{cy-4}" r="10" fill="#7c3aed"/><text x="{cx+10}" y="{cy}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff">{p.num}</text>')
        o.append(f'<text x="{cx+28}" y="{cy-2}" font-size="13" font-weight="700" fill="#0f172a">{p.nombre}</text><text x="{cx+28}" y="{cy+13}" font-size="11.5" fill="#475569">{cm3(*p.dims)}</text>')

def rotulos(cam, lista, x_izq, x_der, y0, y1, cx):
    o = []; lados = {'i': [], 'd': []}
    for P_, texto in lista:
        px, py = cam.p(P_); lados['i' if px < cx else 'd'].append((py, px, texto))
    for lado, l in lados.items():
        l.sort(); k_ = len(l)
        for k, (py, px, texto) in enumerate(l):
            ty = y0 + (y1 - y0) * (k + 0.5) / max(k_, 1); tx = x_izq if lado == 'i' else x_der
            codo = tx + (14 if lado == 'i' else -14)
            o.append(f'<polyline points="{px:.1f},{py:.1f} {codo:.1f},{ty:.1f} {tx:.1f},{ty:.1f}" fill="none" stroke="#475569" stroke-width="1.1"/><circle cx="{px:.1f}" cy="{py:.1f}" r="3" fill="#7c3aed" stroke="#fff"/>')
            t1, _, t2 = texto.partition('|'); anc = 'end' if lado == 'i' else 'start'; dx = -4 if lado == 'i' else 4
            o.append(f'<text x="{tx+dx:.1f}" y="{ty+1:.1f}" text-anchor="{anc}" font-size="13" font-weight="700" fill="#0f172a">{t1}</text>')
            if t2: o.append(f'<text x="{tx+dx:.1f}" y="{ty+16:.1f}" text-anchor="{anc}" font-size="11.5" fill="#475569">{t2}</text>')
    return o

def guardar(o, nombre):
    o.append('</svg>')
    open(f'{OUT}/{nombre}', 'w').write('\n'.join(o) + '\n')

# ── Descripción de los soportes (medidas del modelo) ───────────────────
def _b(nombre): return grupos_soporte()[nombre][0].b
def _d(b, i): return b[i + 3] - b[i]
T = m.TABIQUE
DESC = {
    'Postes de la tapa': f'4 postes de {n(5)} × {n(5)} cm, {n(_d(_b("Postes de la tapa"), 1))} de fondo; rosca {m.TORN_C}',
    'Postes de la tapa de la cámara': f'4 postes de {n(4)} × {n(4)} cm, {n(5)} de fondo; rosca {m.TORN_D}',
    'Topes del separador': f'costillas de {n(1.5)} × {n(1.5)} cm en las paredes y el piso, a {cm(T[4])} del frente',
    'Cuna de la batería': f'hueco de {cm3(_d(m.BATERIA, 0), _d(m.BATERIA, 1), 12)} alto, paredes de {n(1.2)} cm',
    'Riel del DHT22': f'ranura de {n(1.6)} cm en el piso, {n(3)} cm de alto',
    'Tope del DHT22': f'ranura de {n(1.6)} cm, alto {cm(30)}; frena la placa atrás',
    'Rieles del CCS811': f'2 rieles con ranura de {n(1.6)} cm a z {n(68)}; la placa entra desde el frente',
    'Separador': f'{cm3(_d(T, 0), _d(T, 1), _d(T, 2))}, a {cm(T[1])} del frente; rejilla arriba',
    'Postes de la placa': f'4 M3 de {cm3(3, _d(_b("Postes de la placa"), 1), 3)}',
    'Patas del separador': f'2 patas de {n(8)} cm; M2.5 × 6 al piso',
    'Repisa del módulo de carga': f'ranura de {n(1.6)} cm a z {n(m.UNIT[2])}, {cm(27)} de largo',
    'Gancho del módulo de carga': f'{cm(10)} de largo, sujeta el borde de arriba',
    'Postes de la pantalla': f'4 de {n(3)} × {n(3)} × {n(1.5)} cm; M2 a {n(23.3)} × {n(23.8)}',
    'Guías del LED RGB': f'2 en U, ranura {n(1.6)} cm',
    'Guías del buzzer': f'2 en U, ranura {n(1.6)} cm',
    'Postes del microSD': f'4 de {n(4)} × {n(4)} × {n(2)} cm; M2 a {n(19)} × {n(37)}',
    'Pestaña de la tapa de la cámara': f'{cm3(5.4, 3.8, 20)}; presiona la placa del DHT22',
}

# ═══════════════ portada ═══════════════
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" width="900" height="560" {FONT}>', '<rect width="900" height="560" fill="#ffffff"/>']
cam = Camara(32, 22, escala_para(32, 22, caja_total(), 760, 480), 0, 0); encuadrar(cam, caja_total(), 0, 0, 900, 560)
o += items_escena(cam, piezas=False)
guardar(o, 'portada.svg')

# ═══════════════ exterior ═══════════════
CAM_W, CAM_D, CAM_H = m.TX1 - m.TX0, m.TY1 - m.TY0, m.TZ1 - m.TZ0
SEP = -m.TX1
def dims(cam):
    return (cota3d(cam, (m.TX0, 0, 0), (W, 0, 0), (0, -16, -6), cm(W - m.TX0)) + cota3d(cam, (W, 0, 0), (W, 0, H), (16, 0, 0), cm(H)) +
            cota3d(cam, (W, 0, H), (W, D, H), (12, 0, 6), cm(D)) + cota3d(cam, (0, 0, H), (W, 0, H), (0, 0, 12), cm(W)) +
            cota3d(cam, (m.TX0, m.TY0, m.TZ1), (m.TX1, m.TY0, m.TZ1), (0, 0, 16), cm(CAM_W)))
RESUMEN = f'cuerpo {cm3(W, D, H)} · cámara de sensores {cm3(CAM_W, CAM_D, CAM_H)}, separada {cm(SEP)} · total {cm3(W - m.TX0, D, H)}'
o = hoja(1400, 1240, 'Núcleo · exterior', f'Medidas en cm · {RESUMEN}')
vista(o, 0, 80, 700, 580, 32, 22, '1 · Frente y lado derecho', f'Tapa C con 4 tornillos {m.TORN_C}: pantalla, anillo RGB, buzzer; USB del ESP y USB-C de carga', extra=dims, margen=95, piezas=False)
vista(o, 700, 80, 700, 580, -38, 22, '2 · Frente y lado izquierdo', f'Rejillas de la cámara; tapa D con 4 tornillos {m.TORN_D}', piezas=False)
vista(o, 0, 660, 700, 580, 205, 22, '3 · Parte trasera', 'Ventilador con 4 tornillos M3 × 12 y ranuras para colgar', piezas=False)
vista(o, 700, 660, 700, 580, 28, -34, '4 · Por debajo', 'Ranura de la microSD', piezas=False)
guardar(o, 'exterior.svg')

# ═══════════════ carcasa en 4 piezas ═══════════════
def rasgos(parte, extra=()):
    lst = []
    for nombre, cajas in grupos_soporte(parte).items():
        lst.append((cajas[0].centro(), f'{nombre}|{DESC.get(nombre, tam(bb(cajas)))}'))
    return lst + list(extra)
o = hoja(1400, 3140, 'Núcleo · carcasa en 4 piezas',
         f'A base · B separador · C tapa frontal · D tapa de la cámara. Paredes de {cm(P)} (cámara {cm(2)}). Medidas en cm, desde la esquina inferior izquierda del frente')
pb = m.PUENTE
extra_A = [((pb[0] / 2 + m.TX1 / 2, (pb[1] + pb[4]) / 2, pb[5]), f'Puente de cables|hueco de {n(pb[4]-pb[1]-3)} × {n(pb[5]-pb[2]-3)} cm, une cámara y cuerpo'),
           (((m.VENT[0] + m.VENT[3]) / 2, D - P, m.VENT[5] + 2), f'Rejilla del ventilador|Ø 2.8 cm y 4 barrenos M3 a 2.4 cm, pared trasera')]
vista(o, 0, 80, 1400, 760, 30, 28, '1 · A · Base (una sola impresión)', f'Cuerpo, cámara, puente y soportes. Sin techo ni pared derecha para ver adentro; en gris los soportes',
      escala=3.7, extra=lambda c: rotulos(c, rasgos('A', extra_A), 450, 1000, 160, 800, 725),
      piezas=False, esqueleto=True, partes={'A'}, quitar=('techo', 'derecha'), tinte=True)
# B
B_cajas = [c for c in SOPORTES if c.parte == 'B']
hx0, hz0, hx1, hz1 = m.HUECO_TAB
extra_B = [(((hx0 + hx1) / 2, T[1], hz1), f'Pasacables|{n(hx1-hx0)} × {n(hz1-hz0)} cm, cables STEP ±')]
vista(o, 0, 840, 860, 600, 28, 24, '2 · B · Separador, por delante', 'Lleva la placa de expansión (4 postes M3) y entra por el frente hasta los topes de la base',
      ref=B_cajas, margen=230, extra=lambda c: rotulos(c, rasgos('B') + extra_B, 215, 640, 930, 1400, 430),
      piezas=False, esqueleto=True, partes={'B'}, tinte=True)
vista(o, 860, 840, 540, 600, -150, 24, '3 · B · Separador, por detrás', 'Repisa y gancho del módulo de carga',
      ref=B_cajas, margen=140, extra=lambda c: rotulos(c, [r for r in rasgos('B') if 'módulo' in r[1]], 1100, 1240, 930, 1060, 1130),
      piezas=False, esqueleto=True, partes={'B'}, tinte=True)
# C y D por dentro
C_cajas = [c for c in m.carcasa(())[0] if c.parte == 'C'] + [c for c in SOPORTES if c.parte == 'C']
vista(o, 0, 1440, 960, 640, 200, 22, '4 · C · Tapa frontal, por dentro', f'{cm3(W, P, H)} con 4 barrenos para {m.TORN_C} en las esquinas; soportes de los módulos del frente',
      ref=C_cajas, margen=280, extra=lambda c: rotulos(c, rasgos('C'), 270, 690, 1530, 2040, 480),
      piezas=False, esqueleto=True, partes={'C'}, tinte=True)
D_cajas = [c for c in m.carcasa(())[1] if c.parte == 'D'] + [c for c in SOPORTES if c.parte == 'D']
vista(o, 960, 1440, 440, 640, 160, 18, '5 · D · Tapa de la cámara, por dentro', f'{cm3(CAM_W, 2, CAM_H)} con rejilla y 4 barrenos para {m.TORN_D}',
      ref=D_cajas, margen=120, extra=lambda c: rotulos(c, rasgos('D'), 1120, 1250, 1980, 2040, 1180),
      piezas=False, esqueleto=True, partes={'D'}, tinte=True)
# Explotada con tornillos
marco(o, 0, 2080, 1400, 620, '6 · Explotada: cómo se cierran las 4 piezas', f'B entra por el frente hasta sus topes (2 × M2.5 × 6 al piso) · C cierra el cuerpo (4 × {m.TORN_C}) · D cierra la cámara (4 × {m.TORN_D})')
def explotada(o, x, y, w, h, s=None):
    cam = Camara(38, 20, 1, 0, 0)
    cu, ca, pu = m.carcasa(())
    A = [caja_vista(c, tinte=True) for c in cu + ca + pu + SOPORTES if c.parte == 'A']
    B = [caja_vista(c, tinte=True).mover(dy=-70) for c in SOPORTES if c.parte == 'B']
    C = [caja_vista(c, tinte=True).mover(dy=-150) for c in cu + SOPORTES if c.parte == 'C']
    Dd = [caja_vista(c, tinte=True).mover(dy=-150) for c in ca + SOPORTES if c.parte == 'D']
    tor = []
    def tornillo(x_, z_, y0, y1, d=2.5, cabeza=4.5):
        tor.append(Caja(x_ - cabeza / 2, y0 - 2, z_ - cabeza / 2, x_ + cabeza / 2, y0, z_ + cabeza / 2, '#9ca3af'))
        tor.append(Caja(x_ - d / 2, y0, z_ - d / 2, x_ + d / 2, y0 + 8, z_ + d / 2, '#cbd5e1'))
        return (x_, y0 + 8, z_), (x_, y1, z_)
    guias = []
    for x_ in (5, W - 5):
        for z_ in (5, H - 5): guias.append(tornillo(x_, z_, -150 - 14, P))
    for x_ in (m.TX0 + 4, m.TX1 - 4):
        for z_ in (m.TZ0 + 4, m.TZ1 - 4): guias.append(tornillo(x_, z_, -150 - 14, m.TY0 + 2, d=2, cabeza=3.8))
    cam.s = s or escala_para(38, 20, A + B + C + Dd + tor, w - 120, h - 120)
    encuadrar(cam, A + B + C + Dd + tor, x, y, w, h)
    for grupo in (A, B, C + Dd):
        for c in sorted(grupo, key=lambda c: cam.prof(c.centro())): o += dibujar(cam, c)
    for a, b in guias:
        pa, pb_ = cam.p(a), cam.p(b)
        o.append(f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{pb_[0]:.1f}" y2="{pb_[1]:.1f}" stroke="#7c3aed" stroke-width="1" stroke-dasharray="4 3"/>')
    for c in sorted(tor, key=lambda c: cam.prof(c.centro())): o += dibujar(cam, c)
    for letra, grupo in (('A · Base', A), ('B · Separador', B), ('C · Tapa frontal', C), ('D · Tapa de la cámara', Dd)):
        pts = [cam.p(q) for q in puntos_de(grupo)]
        yy = min(p[1] for p in pts) - 10 if letra[0] == 'A' else max(p[1] for p in pts) + 24
        xx = sum(p[0] for p in pts) / len(pts) + {'A': 60, 'B': 70}.get(letra[0], 0)
        o.append(f'<text x="{xx:.0f}" y="{yy:.0f}" text-anchor="middle" font-size="14" font-weight="800" fill="#7c3aed">{letra}</text>')
    return cam
explotada(o, 0, 2150, 1400, 540)
# Tablas
def medidas_parte(parte):
    cu, ca, pu = m.carcasa(())
    return bb([c for c in cu + ca + pu + SOPORTES if c.parte == parte])
o.append('<rect x="20" y="2716" width="1360" height="404" rx="14" fill="#f8fafc" stroke="#e2e8f0"/>')
y_ = tabla(o, 44, 2750, [(f'{k} · {NOMBRE_PARTE[k]}', f'{tam(medidas_parte(k))} (envolvente)') for k in 'ABCD'] +
           [('Paredes', f'cuerpo {cm(P)}, cámara {cm(2)}, separador {cm(_d(T, 1))}'),
            ('Barrenos para rosca', 'M2 Ø 0.16 cm · M2.5 Ø 0.21 cm · M3 Ø 0.25 cm (rosca directa en el plástico)'),
            ('Barrenos pasantes', 'M2 Ø 0.24 cm · M2.5 Ø 0.29 cm · M3 Ø 0.34 cm'),
            ('Ranuras para placas', f'{n(1.6)} cm para placas de {n(1.6)}: imprimir a {n(1.9)} cm si la impresora cierra los huecos'),
            ('Impresión sugerida', 'PETG o PLA, capa 0.2 mm, 3 perímetros; C y D acostadas por su cara exterior; A de pie sobre el piso'),
            ('Ventana de la pantalla', f'{n(m.VENTANA[2]-m.VENTANA[0])} × {n(m.VENTANA[3]-m.VENTANA[1])} cm, x {n(m.VENTANA[0])}–{n(m.VENTANA[2])}, z {n(m.VENTANA[1])}–{n(m.VENTANA[3])}'),
            ('Anillo RGB', f'Ø 2.2 cm, centro x {n(m.RGB_C[0])}, z {n(m.RGB_C[1])}; LED en barreno Ø 0.52'),
            ('Rejilla del buzzer', f'4 × 4 orificios Ø 0.2, centro x {n(m.BUZ_C[0])}, z {n(m.BUZ_C[1])}'),
            ('Atrás: ventilador', f'rejilla Ø 2.8, centro x {n(m.VENT_C[0])}, z {n(m.VENT_C[1])}; 4 barrenos M3 a 2.4 cm'),
            ('Abajo: ranura microSD', 'ranura de 1.5 × 0.3 cm, x 5.05–6.55, y 0.56–0.86')],
           ancho_col=230, titulo='Medidas de las piezas impresas')
tabla(o, 820, 2750, [(f'{c} × {med}', donde) for c, med, donde in m.TORNILLOS], ancho_col=110, titulo='Tornillería', tam=12)
guardar(o, 'esqueleto.svg')

# ═══════════════ interior ═══════════════
o = hoja(1400, 2700, 'Núcleo · interior y cableado', 'Todo montado con sus cables y conectores dupont. Los números corresponden a la lista de piezas; medidas en cm')
c1 = vista(o, 0, 80, 1400, 800, 30, 25, '1 · Todo armado, corte desde el frente', 'Sin tapa C, techo ni pared derecha: módulos del frente, placa de expansión con el ESP32 y, detrás del separador, la energía', escala=5.6, cables=True, esqueleto=True, quitar=('frente', 'techo', 'derecha'))
o += marcas(c1)
c2 = vista(o, 0, 880, 1400, 800, 30, 25, '2 · Cableado (módulos del frente en transparente)', 'Cada cable va del conector del módulo al pin de la placa de expansión; los de los sensores cruzan por el puente', escala=5.6, cables=True, esqueleto=True, fantasma_frente=True, quitar=('frente', 'techo', 'derecha'))
o += marcas(c2, [p.nombre for p in PIEZAS if p.zona != 'frente'])
c3 = vista(o, 0, 1680, 700, 560, -150, 25, '3 · Energía, desde atrás', 'Módulo de carga en la repisa del separador, batería en su cuna y ventilador', cables=True, esqueleto=True, quitar=('atras', 'techo', 'izquierda'))
o += marcas(c3, [p.nombre for p in PIEZAS if p.zona == 'energia'])
vista(o, 700, 1680, 700, 560, 18, 60, '4 · Desde arriba', 'Sin techo: el cableado pasa sobre el separador y por el pasacables', cables=True, esqueleto=True, quitar=('techo',))
leyenda(o, 40, 2280, 1320, columnas=4)
o.append('<text x="40" y="2510" font-size="16" font-weight="700" fill="#0f172a">Colores de los cables</text>')
for k, (c, t) in enumerate(((m.ROJO, '3V3 / +'), (m.NARANJA, '5V'), (m.NEGRO, 'GND / −'), (m.VERDE, 'SDA'), (m.AZUL, 'SCL'), (m.AMARILLO, 'datos / LED'), ('#0e7490', 'microSD'))):
    x = 40 + (k % 4) * 330; y = 2540 + (k // 4) * 30
    o.append(f'<line x1="{x}" y1="{y}" x2="{x+40}" y2="{y}" stroke="{c}" stroke-width="5" stroke-linecap="round"/><text x="{x+52}" y="{y+5}" font-size="13" fill="#334155">{t}</text>')
o.append(f'<text x="40" y="2640" font-size="12.5" fill="#475569">Conector dupont: {cm3(m.DUP, m.DUP, m.DUP_L)} sobre pines de {cm(m.PIN_L)}. Jumpers de 10 cm en la pantalla, el LED RGB, el buzzer y el lector microSD (recorrido de {cm(m.JUMPER_MAX)} como máximo).</text>')
guardar(o, 'interior.svg')

# ═══════════════ cableado (vistas planas) ═══════════════
o = hoja(1400, 1500, 'Núcleo · mapa de cables', f'Vistas planas del cableado ({len(HILOS)} cables, ninguno se cruza con los de otra pieza). Medidas en cm')
cf = vista(o, 0, 80, 1400, 760, 0, 0, '1 · De frente, sin tapa (módulos del frente en transparente)', f'Plano de cables a {cm(m.YC)} del frente; cada conector dupont lleva el nombre de su pin', margen=60, cables=True, esqueleto=True, fantasma_frente=True, quitar=('frente',))
etq, vistos = [], {}
for h in HILOS:
    x, y, z = h.puntos[-1]
    if abs(y - m.YP) < 1e-6: vistos[(x, z)] = h.hasta.replace('GPIO ', '')
for (x, z), t in vistos.items():
    sup = z > 48
    macho = z in (m.ZF[('sup', 'macho')], m.ZF[('inf', 'macho')])
    zz = (71.2 if macho else 59.4) if sup else (25.4 if macho else 37.2)
    px, py = cf.p((x, m.YP, zz))
    w = 7 + 6.2 * len(t)
    etq.append(f'<g transform="rotate(-90 {px:.1f} {py:.1f})"><rect x="{px - w/2:.1f}" y="{py-6.5:.1f}" width="{w:.1f}" height="13" rx="6.5" fill="{"#7c3aed" if macho else "#b45309"}"/>'
               f'<text x="{px:.1f}" y="{py+3.6:.1f}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#fff">{t}</text></g>')
etq.append('<rect x="980" y="112" width="14" height="14" rx="7" fill="#7c3aed"/><text x="1000" y="124" font-size="12" fill="#334155">pin macho</text>'
           '<rect x="1080" y="112" width="14" height="14" rx="7" fill="#b45309"/><text x="1100" y="124" font-size="12" fill="#334155">pin hembra</text>')
o += etq
o += marcas(cf)
cl = vista(o, 0, 840, 620, 640, 90, 0, '2 · De lado (sin pared derecha)', 'Capas de fondo, de izquierda (frente) a derecha (atrás)', margen=60, cables=True, esqueleto=True, quitar=('derecha',))
CAPAS = [(0, P, 'tapa C'), (P, 13.6, 'frente'), (13.6, m.YP, 'cables'), (m.YP, m.PLACA[1], 'dupont y ESP32'),
         (m.PLACA[1], T[1], 'placa'), (T[1], T[4], 'B'), (T[4], D - P, 'energía')]
for k, (y0, y1, t) in enumerate(CAPAS):
    a_, b_ = cl.p((W, y0, 0)), cl.p((W, y1, 0))
    yy = a_[1] + 22 + (16 if k % 2 else 0)
    o.append(f'<line x1="{a_[0]+1:.1f}" y1="{yy-10:.1f}" x2="{b_[0]-1:.1f}" y2="{yy-10:.1f}" stroke="#7c3aed" stroke-width="3"/>')
    o.append(f'<text x="{(a_[0]+b_[0])/2:.1f}" y="{yy+4:.1f}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#5b21b6">{t}</text>')
    o.append(f'<text x="{(a_[0]+b_[0])/2:.1f}" y="{yy+44:.1f}" text-anchor="middle" font-size="9.5" fill="#475569">{n(y0)}–{n(y1)}</text>')
vista(o, 620, 840, 780, 640, 180, 0, '3 · Desde atrás (sin pared trasera)', f'Cables de energía a {cm(m.YE)} del frente, entre el separador y los módulos', margen=60, cables=True, esqueleto=True, quitar=('atras',))
guardar(o, 'cableado.svg')

# ═══════════════ piezas, una por una ═══════════════
def texto_destino(h):
    x, y, z = h.puntos[-1]
    if abs(y - m.YP) < 1e-6:
        fila = 'superior' if z > 48 else 'inferior'
        tipo = 'hembra' if z in (m.ZF[('sup', 'hembra')], m.ZF[('inf', 'hembra')]) else 'macho'
        return f'{h.hasta} · fila {fila}, {tipo}'
    return h.hasta
ZONA = {'sensores': 'Cámara de sensores', 'frente': 'Frente (en la tapa C)', 'centro': 'Centro (separador B)', 'energia': 'Energía (tras el separador)'}
CW, CH = 450, 470
o = hoja(1400, 100 + ((len(PIEZAS) + 2) // 3) * (CH + 14), 'Núcleo · pieza por pieza',
         'Medidas reales, sujeción y conexiones de cada módulo. Posición desde la esquina inferior izquierda del frente del cuerpo (x a la derecha, y hacia atrás, z hacia arriba), en cm')
for k, p in enumerate(PIEZAS):
    cx, cy = 20 + (k % 3) * (CW + 10), 90 + (k // 3) * (CH + 14)
    o.append(f'<rect x="{cx}" y="{cy}" width="{CW}" height="{CH}" rx="14" fill="#f8fafc" stroke="#e2e8f0"/>')
    o.append(f'<circle cx="{cx+26}" cy="{cy+28}" r="13" fill="#7c3aed"/><text x="{cx+26}" y="{cy+33}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">{p.num}</text>')
    o.append(f'<text x="{cx+48}" y="{cy+33}" font-size="16" font-weight="800" fill="#0f172a">{p.nombre}</text>')
    o.append(f'<text x="{cx+CW-16}" y="{cy+33}" text-anchor="end" font-size="11.5" font-weight="700" fill="#7c3aed">{ZONA[p.zona]}</text>')
    pc = Camara(32, 24, 1, 0, 0); pc.s = min(escala_para(32, 24, p.cajas, 150, 120), 7)
    encuadrar(pc, p.cajas, cx + 10, cy + 50, 170, 140)
    for c in sorted(p.cajas, key=lambda c: pc.prof(c.centro())): o += dibujar(pc, c)
    lc = Camara(30, 25, escala_para(30, 25, caja_total(), 250, 150), 0, 0)
    encuadrar(lc, caja_total(), cx + 185, cy + 48, 260, 150)
    o += items_escena(lc, quitar=('frente', 'techo', 'derecha'), esqueleto=True, cables=True, solo=p.nombre)
    b = bb(p.cajas)
    o.append(f'<text x="{cx+18}" y="{cy+218}" font-size="12.5" fill="#0f172a"><tspan font-weight="700">Medidas:</tspan> {cm3(*p.dims)} · con conectores {tam(b)}</text>')
    o.append(f'<text x="{cx+18}" y="{cy+236}" font-size="12.5" fill="#0f172a"><tspan font-weight="700">Posición:</tspan> x {n(b[0])} · y {n(b[1])} · z {n(b[2])} cm</text>')
    for i, (a_, t) in enumerate(p.ficha[1:4]):
        o.append(f'<text x="{cx+18}" y="{cy+256+i*17}" font-size="11.5" fill="#334155"><tspan font-weight="700">{a_}:</tspan> {t}</text>')
    hs = [h for h in HILOS if h.pieza == p.nombre]
    if not hs:
        extra = {'Placa de expansión': ['Recibe al ESP32 en sus zócalos negros', 'Pads 5V y GND ← STEP del módulo de carga', 'Pines macho (blancos) y hembra (amarillos) por GPIO'],
                 'ESP32-S3 (girado)': ['Fila superior (19-21): OLED, RGB, CCS811, carga', 'Fila inferior: buzzer, microSD, DHT22', 'USB a la derecha: abertura para programar']}.get(p.nombre, [])
        for i, t in enumerate(extra):
            o.append(f'<text x="{cx+18}" y="{cy+322+i*19}" font-size="12" fill="#334155">• {t}</text>')
    for i, h in enumerate(hs[:7]):
        y = cy + 322 + i * 18
        largo = f' · {n(h.largo())} cm' if h.pieza in m.CORTOS else ''
        o.append(f'<line x1="{cx+18}" y1="{y-4}" x2="{cx+34}" y2="{y-4}" stroke="{h.color}" stroke-width="4" stroke-linecap="round"/>')
        o.append(f'<text x="{cx+42}" y="{y}" font-size="12" fill="#0f172a"><tspan font-weight="700">{h.desde}</tspan> → {texto_destino(h)}{largo}</text>')
guardar(o, 'piezas.svg')

# ═══════════════ medidas de cada módulo ═══════════════
MW, MH = 450, 500
o = hoja(1400, 100 + ((len(PIEZAS) + 2) // 3) * (MH + 14), 'Núcleo · medidas de cada módulo',
         'Vista de frente y de lado de cada módulo con sus conectores dupont puestos; las cotas son el espacio que ocupa dentro de la carcasa, en cm')
for k, p in enumerate(PIEZAS):
    cx, cy = 20 + (k % 3) * (MW + 10), 90 + (k // 3) * (MH + 14)
    o.append(f'<rect x="{cx}" y="{cy}" width="{MW}" height="{MH}" rx="14" fill="#f8fafc" stroke="#e2e8f0"/>')
    o.append(f'<circle cx="{cx+26}" cy="{cy+28}" r="13" fill="#7c3aed"/><text x="{cx+26}" y="{cy+33}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">{p.num}</text>')
    o.append(f'<text x="{cx+48}" y="{cy+33}" font-size="16" font-weight="800" fill="#0f172a">{p.nombre}</text>')
    b = bb(p.cajas)
    esc = min(escala_para(0, 0, p.cajas, 190, 180), escala_para(90, 0, p.cajas, 120, 180), 6)
    for yaw, x0, ww, etiqueta in ((0, cx + 20, 250, 'de frente'), (90, cx + 270, 170, 'de lado')):
        cam = Camara(yaw, 0, esc, 0, 0)
        encuadrar(cam, p.cajas, x0, cy + 70, ww, 190)
        for c in sorted(p.cajas, key=lambda c: cam.prof(c.centro())): o += dibujar(cam, c)
        if yaw == 0:
            o += cota(cam.p((b[0], b[1], b[2])), cam.p((b[3], b[1], b[2])), cm(b[3] - b[0]), 'abajo', 14, 11.5)
            o += cota(cam.p((b[0], b[1], b[2])), cam.p((b[0], b[1], b[5])), cm(b[5] - b[2]), 'izq', 12, 11.5)
        else:
            o += cota(cam.p((b[3], b[1], b[2])), cam.p((b[3], b[4], b[2])), cm(b[4] - b[1]), 'abajo', 14, 11.5)
        o.append(f'<text x="{x0+ww/2:.0f}" y="{cy+62}" text-anchor="middle" font-size="11" fill="#64748b">{etiqueta}</text>')
    y_ = cy + 316
    o.append(f'<text x="{cx+18}" y="{y_}" font-size="12.5" fill="#0f172a"><tspan font-weight="700">Módulo:</tspan> {cm3(*p.dims)} · <tspan font-weight="700">ocupa:</tspan> {tam(b)}</text>')
    for i, (a_, t) in enumerate(p.ficha):
        o.append(f'<text x="{cx+18}" y="{y_+22+i*19}" font-size="11.5" fill="#334155"><tspan font-weight="700">{a_}:</tspan> {t}</text>')
    o.append(f'<text x="{cx+18}" y="{y_+22+len(p.ficha)*19+4}" font-size="11.5" fill="#64748b">Posición: x {n(b[0])}–{n(b[3])} · y {n(b[1])}–{n(b[4])} · z {n(b[2])}–{n(b[5])}</text>')
guardar(o, 'medidas.svg')

# ═══════════════ ensamblado paso a paso ═══════════════
FRENTE = [p.nombre for p in PIEZAS if p.zona == 'frente']
ENERGIA = [p.nombre for p in PIEZAS if p.zona == 'energia']
SENSORES = [p.nombre for p in PIEZAS if p.zona == 'sensores']
PASOS = [
    ('Imprime las 4 piezas', ['A base, B separador, C tapa frontal y D tapa de la cámara.', 'Lija las ranuras de 0.16 cm hasta que la placa entre justa.', 'Repasa los barrenos con un tornillo antes de armar.'], None),
    ('Tapa C: pantalla y lector microSD', ['Pantalla OLED con el vidrio en la ventana: 4 × M2 × 5.', 'Lector microSD de pie, ranura hacia el piso: 4 × M2 × 5.', 'Pon antes los jumpers de 10 cm en sus pines.'],
     dict(yaw=200, pitch=22, partes={'C'}, mostrar=['Pantalla OLED', 'Lector microSD HW-125'], nuevas=['Pantalla OLED', 'Lector microSD HW-125'], quitar=(), esqueleto=True)),
    ('Tapa C: LED RGB y buzzer', ['Desliza el LED RGB en sus 2 guías hasta que el LED entre al anillo.', 'Desliza el buzzer en sus 2 guías, contra la rejilla.', 'Pon sus jumpers de 10 cm antes de deslizarlos.'],
     dict(yaw=200, pitch=22, partes={'C'}, mostrar=FRENTE, nuevas=['LED RGB KY-016', 'Buzzer KY-012'], quitar=(), esqueleto=True)),
    ('Base A: ventilador y batería', ['Ventilador contra la pared trasera: 4 × M3 × 12 desde afuera.', 'Batería de pie en su cuna, cable hacia la derecha; cinta velcro.', 'Pasa los cables del ventilador hacia la derecha.'],
     dict(yaw=-150, pitch=26, partes={'A'}, mostrar=['Batería LiPo', 'Ventilador 5 V'], nuevas=['Batería LiPo', 'Ventilador 5 V'], quitar=('atras', 'techo', 'izquierda'), esqueleto=True)),
    ('Separador B con el módulo de carga', ['Módulo de carga en la repisa y bajo el gancho, USB-C a la derecha.', 'Suelda SDA, SCL, STEP ± y los 2 del ventilador; batería al JST.', 'Mete B por el frente hasta los topes: 2 × M2.5 × 6 al piso.'],
     dict(yaw=-150, pitch=26, partes={'A', 'B'}, mostrar=ENERGIA, nuevas=['Módulo de carga UNIT'], quitar=('atras', 'techo', 'izquierda'), esqueleto=True, cables=True, cables_de=['Batería LiPo', 'Ventilador 5 V'])),
    ('Placa de expansión y ESP32', ['Placa de expansión a los 4 postes de B: 4 × M3 × 6.', 'Pasa STEP ± por el pasacables a los pads 5V y GND.', 'Encaja el ESP32 con los pines 19-21 arriba y el USB a la derecha.'],
     dict(yaw=30, pitch=25, partes={'A', 'B'}, mostrar=ENERGIA + ['Placa de expansión', 'ESP32-S3 (girado)'], nuevas=['Placa de expansión', 'ESP32-S3 (girado)'], quitar=('frente', 'techo', 'derecha'), esqueleto=True, cables=True, cables_de=ENERGIA)),
    ('Cámara: CCS811, DHT22 y tapa D', ['CCS811 por los rieles de arriba, sensor hacia la rejilla.', 'DHT22 de pie en su riel, pines hacia arriba.', f'Pasa sus cables por el puente a la placa; cierra D: 4 × {m.TORN_D}.'],
     dict(yaw=-35, pitch=30, partes={'A', 'B'}, mostrar=SENSORES + ['Placa de expansión', 'ESP32-S3 (girado)'], nuevas=SENSORES, quitar=('frente', 'techo', 'izquierda'), esqueleto=True, cables=True, cables_de=SENSORES)),
    ('Conecta el frente y cierra con la tapa C', ['Conecta cada jumper a su pin (ver el mapa de cables).', 'Dobla lo que sobra en el canal de arriba o de abajo de la placa.', f'Cierra la tapa C: 4 × {m.TORN_C} en las esquinas.'],
     dict(yaw=30, pitch=25, partes=None, mostrar=None, nuevas=FRENTE, quitar=('frente', 'techo', 'derecha'), esqueleto=True, cables=True)),
]
PW, PH = 700, 640
o = hoja(1400, 100 + ((len(PASOS) + 1) // 2) * (PH + 10), 'Núcleo · ensamblado paso a paso',
         f'Orden de armado de las 4 piezas impresas y los {len(PIEZAS)} módulos; en morado lo que se agrega en cada paso. Tornillería en la hoja de la carcasa')
for k, (titulo, lineas, kw) in enumerate(PASOS):
    x, y = (k % 2) * PW, 90 + (k // 2) * (PH + 10)
    if kw is None:
        marco(o, x, y, PW, PH, f'Paso {k+1} · {titulo}')
        explotada(o, x + 20, y + 60, PW - 40, PH - 190)
    else:
        kw = dict(kw); yaw, pitch = kw.pop('yaw'), kw.pop('pitch')
        ref = None
        if kw['partes']:
            cu, ca, pu = m.carcasa(kw['quitar'])
            ref = [c for c in cu + ca + pu + SOPORTES if c.parte in kw['partes']]
        vista(o, x, y, PW, PH - 110, yaw, pitch, f'Paso {k+1} · {titulo}', ref=ref, margen=80, **kw)
    for i, t in enumerate(lineas):
        o.append(f'<circle cx="{x+34}" cy="{y+PH-96+i*26}" r="3.5" fill="#7c3aed"/><text x="{x+46}" y="{y+PH-91+i*26}" font-size="13.5" fill="#0f172a">{t}</text>')
guardar(o, 'ensamblado.svg')

# ═══════════════ planos ═══════════════
o = hoja(1400, 1560, 'Núcleo · planos', f'Vistas ortogonales con medidas en cm · paredes de {cm(P)} · tapa C con 4 × {m.TORN_C} · tapa D con 4 × {m.TORN_D}')
def plano(titulo, x, y, w, h, yaw, pitch, esc, dims=None, **kw):
    cam = Camara(yaw, pitch, esc, 0, 0)
    encuadrar(cam, caja_total(), x, y + 30, w, h - 40)
    o.append(f'<text x="{x+w/2}" y="{y+18}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a">{titulo}</text>')
    o.extend(items_escena(cam, **kw))
    if dims: o.extend(dims(cam))
    return cam
P3 = lambda c, *a: c.p(a)
def d_frente(c):
    vx0, vz0, vx1, vz1 = m.VENTANA; rx, rz = m.RGB_C
    r = cota(P3(c, m.TX0, 0, 0), P3(c, W, 0, 0), cm(W - m.TX0), 'abajo', 46)
    r += cota(P3(c, 0, 0, 0), P3(c, W, 0, 0), cm(W), 'abajo', 18)
    r += cota(P3(c, m.TX0, 0, m.TZ0), P3(c, m.TX1, 0, m.TZ0), cm(CAM_W), 'abajo', 18 + 4 * c.s)
    r += cota(P3(c, m.TX0, 0, m.TZ0), P3(c, m.TX0, 0, m.TZ1), cm(CAM_H), 'izq', 18)
    r += cota(P3(c, W, 0, 0), P3(c, W, 0, H), cm(H), 'der', 22)
    r += cota(P3(c, vx0, 0, vz1), P3(c, vx1, 0, vz1), f'ventana {n(vx1-vx0)} × {n(vz1-vz0)} cm', 'arriba', 6 + (H - vz1) * c.s)
    r += cota(P3(c, rx - 11, 0, H), P3(c, rx + 11, 0, H), 'anillo Ø 2.2 cm', 'arriba', 14)
    return r
plano('Frente', 0, 90, 760, 400, 0, 0, 3.4, dims=d_frente, piezas=False)
plano('Lado derecho', 760, 90, 330, 400, 90, 0, 3.4, dims=lambda c: cota(P3(c, W, 0, 0), P3(c, W, D, 0), cm(D), 'abajo', 18) + cota(P3(c, W, D, 0), P3(c, W, D, H), cm(H), 'der', 18), piezas=False)
plano('Lado izquierdo', 1090, 90, 310, 400, -90, 0, 3.4, piezas=False, dims=lambda c: cota(P3(c, m.TX0, m.TY1, m.TZ0), P3(c, m.TX0, m.TY0, m.TZ0), cm(CAM_D), 'abajo', 18))
plano('Atrás', 0, 520, 700, 360, 180, 0, 3.0, piezas=False)
plano('Arriba', 700, 520, 700, 260, 0, 90, 3.0, piezas=False, dims=lambda c: cota(P3(c, m.TX0, 0, H), P3(c, W, 0, H), cm(W - m.TX0), 'abajo', 18) + cota(P3(c, W, 0, H), P3(c, W, D, H), cm(D), 'der', 18) + cota(P3(c, m.TX1, m.TY1, H), P3(c, 0, m.TY1, H), cm(SEP), 'arriba', 12))
plano('Abajo (frente hacia arriba)', 700, 790, 700, 240, 0, -90, 3.0, piezas=False)
o.append('<line x1="40" y1="1050" x2="1360" y2="1050" stroke="#e2e8f0" stroke-width="2"/>')
o.append('<text x="40" y="1078" font-size="17" font-weight="800" fill="#0f172a">Cortes interiores con los módulos</text>')
def d_corte_frente(c):
    pl = m.PLACA
    r = cota(P3(c, pl[0], 0, pl[2]), P3(c, pl[3], 0, pl[2]), f'placa {cm(pl[3]-pl[0])}', 'abajo', 10)
    r += cota(P3(c, pl[3], 0, pl[2]), P3(c, pl[3], 0, pl[5]), cm(pl[5] - pl[2]), 'der', 8)
    return r
cpf = plano('Corte frontal (sin tapa C)', 0, 1090, 740, 420, 0, 0, 3.4, quitar=('frente',), esqueleto=True, dims=d_corte_frente); o += marcas(cpf)
def d_corte_lado(c):
    r = []
    for y0, y1, t in ((0, m.YP, cm(m.YP)), (m.YP, T[1], cm(T[1] - m.YP)), (T[4], D, cm(D - T[4]))):
        r += cota(P3(c, W, y0, H), P3(c, W, y1, H), t, 'arriba', 10, 11)
    return r
cpl = plano('Corte lateral (sin pared derecha)', 740, 1090, 330, 420, 90, 0, 3.4, quitar=('derecha',), esqueleto=True, dims=d_corte_lado); o += marcas(cpl)
plano('Corte superior (sin techo)', 1060, 1090, 340, 420, 0, 90, 2.1, quitar=('techo',), esqueleto=True)
guardar(o, 'planos.svg')
print('ok')
