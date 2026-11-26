import sys, copy, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Camara, dibujar, Caja
import modelo2 as m

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(OUT, exist_ok=True)
FONT = 'font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"'
DEFS = ('<defs><marker id="fl" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L10 5 L0 9 z" fill="#0f172a"/></marker></defs>')
cm = lambda mm: ('%g' % round(mm / 10, 2)) + ' cm'
PIEZAS = m.piezas()
HILOS = m.cables()
POR_NOMBRE = {p.nombre: p for p in PIEZAS}

def conectores():
    """Conectores dupont puestos en la placa de expansión."""
    c = []
    for h in HILOS:
        x, y, z = h.puntos[-1]
        if abs(y - 13) < 1e-6:
            hembra = z in (m.ZF[('sup', 'hembra')], m.ZF[('inf', 'hembra')])
            c.append(Caja(x - 1.2, 13, z - 1.2, x + 1.2, 22.5 if hembra else 27, z + 1.2, '#1f2937', borde='#0b0b0b'))
    return c
PLUGS = conectores()

def caja_vista(c, fantasma=False, destacar=False):
    if fantasma:
        k = copy.copy(c); k.opacidad = 0.13; k.borde = '#94a3b8'; k.punteada = True; k.deco = {}; return k
    if destacar:
        k = copy.copy(c); k.borde = '#7c3aed'; return k
    return c

def clave(cam, bb, tipo):
    """Orden de dibujo: zona (cámara / puente / cuerpo) y, dentro del cuerpo, capas de fondo."""
    x0, y0, z0, x1, y1, z1 = bb
    cen = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    prof = cam.prof(cen)
    der = cam.d[0] >= 0
    if x1 <= m.TX1 + 0.01: zona = 'torre'
    elif x0 < 0 - 0.01: zona = 'puente'
    else: zona = 'cuerpo'
    orden_zona = {'torre': 1, 'puente': 2, 'cuerpo': 3} if der else {'cuerpo': 1, 'puente': 2, 'torre': 3}
    piso = tipo == 'pared' and (z1 <= m.P + 0.01 or (z0 == m.TZ0 and z1 == m.TZ0 + 2))
    if piso:
        return (0 if cam.d[2] >= 0 else 9, 0, prof)
    if abs(cam.d[1]) < 0.3 or zona == 'torre':
        return (orden_zona[zona], 0, prof)
    frente_cam = cam.d[1] < 0
    if tipo == 'pared' and zona == 'cuerpo':
        if x1 <= m.P + 0.01: sub = -1e3 if der else 1e3
        elif x0 >= m.W - m.P - 0.01: sub = 1e3 if der else -1e3
        elif y0 >= m.D - m.P - 0.01: sub = -1e3 if frente_cam else 1e3
        elif y1 <= m.P + 0.01: sub = 1e3 if frente_cam else -1e3
        elif z0 >= m.H - m.P - 0.01: sub = 2e3 if cam.d[2] >= 0 else -2e3
        else: sub = 0
        return (orden_zona[zona], sub, prof)
    if tipo == 'tramo':
        yk = y0 if frente_cam else y1
    else:
        yk = cen[1]
    return (orden_zona[zona], -yk if frente_cam else yk, prof)

def items_escena(cam, quitar=(), piezas=True, esqueleto=False, cables=False, fantasma_frente=False, solo=None, fantasma_todo=False, con_carcasa=True):
    """Elementos (clave, svg) ordenados de atrás hacia adelante."""
    it = []
    def agrega(cajas, tipo='caja'):
        cajas = list(cajas)
        if not cajas: return
        bb = (min(c.b[0] for c in cajas), min(c.b[1] for c in cajas), min(c.b[2] for c in cajas),
              max(c.b[3] for c in cajas), max(c.b[4] for c in cajas), max(c.b[5] for c in cajas))
        def svg():
            o = []
            for c in sorted(cajas, key=lambda c: cam.prof(c.centro())): o += dibujar(cam, c)
            return o
        it.append((clave(cam, bb, tipo), svg))
    if con_carcasa:
        cu, ca, pu = m.carcasa(quitar)
        for c in cu + ca + pu: agrega([c], 'pared')
    if esqueleto:
        for c in m.esqueleto_extra(): agrega([caja_vista(c, fantasma_todo)])
    if piezas:
        for p in PIEZAS:
            if solo is not None:
                fant = p.nombre != solo
                agrega([caja_vista(c, fantasma=fant, destacar=not fant) for c in p.cajas])
            else:
                fant = fantasma_todo or (fantasma_frente and p.zona == 'frente')
                agrega([caja_vista(c, fantasma=fant) for c in p.cajas])
        if cables:
            for c in PLUGS: agrega([c])
    if cables:
        for h in HILOS:
            if solo is not None and h.pieza != solo: continue
            for a, b in zip(h.puntos, h.puntos[1:]):
                bb = tuple(min(a[i], b[i]) for i in range(3)) + tuple(max(a[i], b[i]) for i in range(3))
                def svg(a=a, b=b, color=h.color):
                    pa, pb = cam.p(a), cam.p(b)
                    w = max(1.8, 0.9 * cam.s)
                    return [f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{pb[0]:.1f}" y2="{pb[1]:.1f}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="{w+1.6:.1f}" stroke-linecap="round"/>',
                            f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{pb[0]:.1f}" y2="{pb[1]:.1f}" stroke="{color}" stroke-width="{w:.1f}" stroke-linecap="round"/>']
                k = clave(cam, bb, 'tramo')
                it.append(((k[0], k[1] - 0.01 if cam.d[1] < 0 else k[1] + 0.01, k[2]), svg))
    it.sort(key=lambda t: t[0])
    o = []
    for _, f in it: o += f()
    return o

def encuadrar(cam, cajas, x0, y0, w, h):
    pts = []
    for c in cajas:
        b = c.b
        for x in (b[0], b[3]):
            for y in (b[1], b[4]):
                for z in (b[2], b[5]):
                    pts.append(cam.p((x, y, z)))
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    cam.ox += x0 + w / 2 - (min(xs) + max(xs)) / 2
    cam.oy += y0 + h / 2 - (min(ys) + max(ys)) / 2

def escala_para(yaw, pitch, cajas, w, h):
    cam = Camara(yaw, pitch, 1, 0, 0)
    pts = [cam.p((x, y, z)) for c in cajas for x in (c.b[0], c.b[3]) for y in (c.b[1], c.b[4]) for z in (c.b[2], c.b[5])]
    ancho = max(p[0] for p in pts) - min(p[0] for p in pts); alto = max(p[1] for p in pts) - min(p[1] for p in pts)
    return min(w / ancho, h / alto)

TODO = None
def caja_total():
    cu, ca, pu = m.carcasa(())
    return cu + ca + pu

def marcas(cam, nombres=None):
    o = []
    for p in PIEZAS:
        if nombres and p.nombre not in nombres: continue
        x, y = cam.p(p.principal.centro())
        o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="10" fill="#7c3aed" stroke="#fff" stroke-width="2"/><text x="{x:.1f}" y="{y+4:.1f}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff">{p.num}</text>')
    return o

def cota3d(cam, A, B, off, texto):
    A2 = tuple(a + o for a, o in zip(A, off)); B2 = tuple(b + o for b, o in zip(B, off))
    pa, pb, qa, qb = cam.p(A), cam.p(B), cam.p(A2), cam.p(B2)
    mx, my = (qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2
    return [f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{qa[0]:.1f}" y2="{qa[1]:.1f}" stroke="#64748b" stroke-width="0.8"/>',
            f'<line x1="{pb[0]:.1f}" y1="{pb[1]:.1f}" x2="{qb[0]:.1f}" y2="{qb[1]:.1f}" stroke="#64748b" stroke-width="0.8"/>',
            f'<line x1="{qa[0]:.1f}" y1="{qa[1]:.1f}" x2="{qb[0]:.1f}" y2="{qb[1]:.1f}" stroke="#0f172a" stroke-width="1.2" marker-start="url(#fl)" marker-end="url(#fl)"/>',
            f'<rect x="{mx-30:.1f}" y="{my-9:.1f}" width="60" height="17" rx="4" fill="#ffffff" fill-opacity="0.92"/>',
            f'<text x="{mx:.1f}" y="{my+4:.1f}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#0f172a">{texto}</text>']

def cota(p1, p2, texto, lado='abajo', sep=22):
    (x1, y1), (x2, y2) = p1, p2
    o = []
    if lado in ('abajo', 'arriba'):
        y = (max(y1, y2) + sep) if lado == 'abajo' else (min(y1, y2) - sep)
        o += [f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x1:.1f}" y2="{y:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x2:.1f}" y1="{y2:.1f}" x2="{x2:.1f}" y2="{y:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2:.1f}" y2="{y:.1f}" stroke="#0f172a" stroke-width="1.2" marker-start="url(#fl)" marker-end="url(#fl)"/>',
              f'<text x="{(x1+x2)/2:.1f}" y="{y-5 if lado == "arriba" else y+15:.1f}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#0f172a">{texto}</text>']
    else:
        x = (max(x1, x2) + sep) if lado == 'der' else (min(x1, x2) - sep)
        o += [f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y1:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x2:.1f}" y1="{y2:.1f}" x2="{x:.1f}" y2="{y2:.1f}" stroke="#64748b" stroke-width="0.8"/>',
              f'<line x1="{x:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y2:.1f}" stroke="#0f172a" stroke-width="1.2" marker-start="url(#fl)" marker-end="url(#fl)"/>',
              f'<text x="{x + 6 if lado == "der" else x - 6:.1f}" y="{(y1+y2)/2+4:.1f}" text-anchor="{"start" if lado == "der" else "end"}" font-size="12.5" font-weight="700" fill="#0f172a">{texto}</text>']
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

def vista(o, x, y, w, h, yaw, pitch, titulo, sub=None, escala=None, margen=70, extra=None, **kw):
    marco(o, x, y, w, h, titulo, sub)
    ref = caja_total()
    s = escala or escala_para(yaw, pitch, ref, w - 2 * margen, h - 70 - margen)
    cam = Camara(yaw, pitch, s, 0, 0)
    encuadrar(cam, ref, x, y + 55, w, h - 60)
    o += items_escena(cam, **kw)
    if extra: o += extra(cam)
    return cam

def leyenda(o, x, y, w, columnas=4):
    o.append(f'<text x="{x}" y="{y}" font-size="16" font-weight="700" fill="#0f172a">Piezas (medidas aproximadas)</text>')
    filas = (len(PIEZAS) + columnas - 1) // columnas
    for k, p in enumerate(PIEZAS):
        col, fila = divmod(k, filas)
        cx, cy = x + col * (w / columnas), y + 30 + fila * 36
        b = p.principal.b
        med = f'{(b[3]-b[0])/10:g} × {(b[4]-b[1])/10:g} × {(b[5]-b[2])/10:g} cm'
        o.append(f'<circle cx="{cx+10}" cy="{cy-4}" r="10" fill="#7c3aed"/><text x="{cx+10}" y="{cy}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff">{p.num}</text>')
        o.append(f'<text x="{cx+28}" y="{cy-2}" font-size="13" font-weight="700" fill="#0f172a">{p.nombre}</text><text x="{cx+28}" y="{cy+13}" font-size="11.5" fill="#475569">{med}</text>')

def guardar(o, nombre):
    o.append('</svg>')
    open(f'{OUT}/{nombre}', 'w').write('\n'.join(o) + '\n')

# ═══════════════ portada ═══════════════
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" width="900" height="560" {FONT}>', '<rect width="900" height="560" fill="#ffffff"/>']
cam = Camara(32, 22, escala_para(32, 22, caja_total(), 760, 480), 0, 0); encuadrar(cam, caja_total(), 0, 0, 900, 560)
o += items_escena(cam, piezas=False)
guardar(o, 'portada.svg')

# ═══════════════ exterior ═══════════════
def dims(cam):
    W, D, H = m.W, m.D, m.H
    return (cota3d(cam, (m.TX0, 0, 0), (W, 0, 0), (0, -16, -6), cm(W - m.TX0)) + cota3d(cam, (W, 0, 0), (W, 0, H), (16, 0, 0), cm(H)) +
            cota3d(cam, (W, 0, H), (W, D, H), (12, 0, 6), cm(D)) + cota3d(cam, (0, 0, H), (W, 0, H), (0, 0, 12), cm(W)) +
            cota3d(cam, (m.TX0, m.TY0, m.TZ1), (m.TX1, m.TY0, m.TZ1), (0, 0, 16), cm(m.TX1 - m.TX0)))
o = hoja(1400, 1240, 'Núcleo · exterior', 'Medidas en cm · cuerpo 11 × 5.5 × 8 · cámara de sensores 2.8 × 5.1 × 7.2, separada 0.6 cm y unida por el puente de cables')
vista(o, 0, 80, 700, 580, 32, 22, '1 · Frente y lado derecho', 'Pantalla, anillo RGB, buzzer, USB del ESP y USB-C de carga', extra=dims, margen=95, piezas=False)
vista(o, 700, 80, 700, 580, -38, 22, '2 · Frente y lado izquierdo', 'Rejillas de la cámara de sensores', piezas=False)
vista(o, 0, 660, 700, 580, 205, 22, '3 · Parte trasera', 'Rejilla del ventilador y ranuras para colgar', piezas=False)
vista(o, 700, 660, 700, 580, 28, -34, '4 · Por debajo', 'Ranura de la microSD', piezas=False)
guardar(o, 'exterior.svg')

# ═══════════════ esqueleto ═══════════════
def rotulos(cam, lista, x_izq, x_der, y0, y1, cx):
    o = []; lados = {'i': [], 'd': []}
    for P, texto in lista:
        px, py = cam.p(P); lados['i' if px < cx else 'd'].append((py, px, texto))
    for lado, l in lados.items():
        l.sort(); n = len(l)
        for k, (py, px, texto) in enumerate(l):
            ty = y0 + (y1 - y0) * (k + 0.5) / max(n, 1); tx = x_izq if lado == 'i' else x_der
            codo = tx + (14 if lado == 'i' else -14)
            o.append(f'<polyline points="{px:.1f},{py:.1f} {codo:.1f},{ty:.1f} {tx:.1f},{ty:.1f}" fill="none" stroke="#475569" stroke-width="1.1"/><circle cx="{px:.1f}" cy="{py:.1f}" r="3" fill="#7c3aed" stroke="#fff"/>')
            t1, _, t2 = texto.partition('|'); anc = 'end' if lado == 'i' else 'start'; dx = -4 if lado == 'i' else 4
            o.append(f'<text x="{tx+dx:.1f}" y="{ty+1:.1f}" text-anchor="{anc}" font-size="13" font-weight="700" fill="#0f172a">{t1}</text>')
            if t2: o.append(f'<text x="{tx+dx:.1f}" y="{ty+16:.1f}" text-anchor="{anc}" font-size="11.5" fill="#475569">{t2}</text>')
    return o
E = m.esqueleto_extra()
rasgos_frente = [((5, 7, 75), 'Postes de la tapa|4 tornillos M3, a 0.5 cm de cada esquina'),
                 ((30, 36, 70), 'Tabique|grosor 0.2 cm, alto 7.2 cm; rejilla arriba'),
                 ((93, 36, 30), 'Pasacables del tabique|1.4 × 0.8 cm'),
                 ((18.5, 34, 70.5), 'Postes de la placa de expansión|4 postes de 0.3 × 0.3 cm'),
                 ((90, 34, 25), 'Postes de la placa de expansión'),
                 ((-3, 26, 46), 'Puente de cables|1.2 × 1.2 cm, hueco'),
                 ((-9, 25, 14), 'Soporte del DHT22 (abajo)'), ((-9, 40, 62.5), 'Soporte del CCS811 (arriba)'),
                 ((58, 3, 1.25), 'Ranura microSD (abajo)'), ((-20, 27, 76), 'Rejillas de la cámara|frente, izquierda, atrás y arriba')]
def ex_esq(cam):
    return rotulos(cam, rasgos_frente, 330, 1090, 150, 760, 700)
o = hoja(1400, 2560, 'Núcleo · esqueleto', 'La carcasa vacía: paredes de 0.25 cm, tabique interior, postes y pasos de cables. Medidas en cm')
vista(o, 0, 80, 1400, 720, 30, 28, '1 · Esqueleto vacío, corte desde el frente', 'Sin tapa frontal, techo ni pared derecha', escala=4.3, extra=ex_esq, piezas=False, esqueleto=True, quitar=('frente', 'techo', 'derecha'))
rasgos_atras = [((31, 47.5, 10), 'Tope de la batería'), ((29.25, 47, 70), 'Marco del ventilador|3 × 3 cm'), ((92, 37, 30), 'Pasacables (lado de energía)'),
                ((15, 37, 66), 'Rejilla del tabique|el ventilador saca este aire'), ((85, 44.5, 45), 'Repisa del módulo de carga'), ((110, 42, 59), 'Hueco del USB-C de carga|lado derecho')]
vista(o, 0, 800, 1400, 680, -148, 28, '2 · Esqueleto desde atrás', 'Sin pared trasera, techo ni pared izquierda', escala=4.0, extra=lambda c: rotulos(c, rasgos_atras, 360, 1060, 880, 1440, 700), piezas=False, esqueleto=True, quitar=('atras', 'techo', 'izquierda'))
vista(o, 0, 1480, 700, 560, 20, 62, '3 · Esqueleto desde arriba', 'Sin techo: las tres zonas (frente, centro y energía) y la cámara', piezas=False, esqueleto=True, quitar=('techo',))
tx, ty = 730, 1520
o.append(f'<rect x="{tx-24}" y="{ty-34}" width="676" height="548" rx="14" fill="#f8fafc" stroke="#e2e8f0"/>')
o.append(f'<text x="{tx}" y="{ty}" font-size="16" font-weight="700" fill="#0f172a">Medidas del esqueleto (cm)</text>')
filas_esq = [('Cuerpo (exterior)', '11 × 5.5 × 8'), ('Paredes', '0.25'), ('Cámara de sensores', '2.8 × 5.1 × 7.2, a 0.4 del piso'),
             ('Separación cuerpo–cámara', '0.6'), ('Puente de cables (hueco)', '1.2 × 1.2, a z 3.4–4.6 y y 2.0–3.2'),
             ('Tapa frontal', '11 × 8 × 0.25, 4 tornillos M3'), ('Postes de la tapa', '0.5 × 0.5, fondo 0.95'),
             ('Tabique', '10.5 × 0.2 × 7.15, a 3.6 del frente'), ('Rejilla del tabique', 'z 5.2–7.2'),
             ('Pasacables del tabique', '1.4 × 0.8, x 8.6–10.0, z 2.6–3.4'), ('Postes de la placa', '0.3 × 0.34 × 0.3, en x 1.7/9.0 y z 2.4/6.9'),
             ('Tope de la batería', '5 × 0.25 × 0.75, a 4.6 del frente'), ('Marco del ventilador', '3 × 3, x 3.0–6.0, z 4.4–7.4, contra la pared trasera'),
             ('Ventana de la pantalla', '2.4 × 1.4, x 1.1–3.5, z 5.0–6.4'), ('Anillo RGB', 'Ø 2.2, centro x 8.65, z 5.45'),
             ('Rejilla del buzzer', '4 × 4 orificios Ø 0.2, centro x 8.65, z 2.25'),
             ('Abajo: ranura microSD', '1.6 × 0.22, x 5.0–6.6'), ('Lado derecho: USB del ESP', '0.7 × 0.8, y 1.6–2.3, z 4.7–5.5'),
             ('Lado derecho: USB-C de carga', '0.5 × 0.9, y 3.95–4.45, z 5.45–6.35'), ('Atrás: rejilla del ventilador', 'Ø 2.8, centro x 4.5, z 5.9')]
for i, (a1, b1) in enumerate(filas_esq):
    o.append(f'<text x="{tx}" y="{ty+28+i*24}" font-size="12.5" font-weight="700" fill="#0f172a">{a1}</text><text x="{tx+290}" y="{ty+28+i*24}" font-size="12.5" fill="#334155">{b1}</text>')
# explotada de la carcasa
marco(o, 0, 2040, 1400, 500, '4 · Piezas para imprimir (explotada)', 'A cuerpo con cámara y puente (una pieza) · B tabique (entra deslizando) · C tapa frontal (4 tornillos M3)')
cam = Camara(55, 22, 2.0, 0, 0)
cu, ca, pu = m.carcasa(('frente',))
tab = [c for c in E if c.b == m.TABIQUE]
otros = [c for c in E if c.b != m.TABIQUE]
tapa = [c for c in m.carcasa(())[0] if 'front' in c.deco]
A = cu + ca + pu + [c for c in otros if c.b[1] >= 30 or c.b[0] < 0]
Pz = [c for c in otros if c.b[1] < 30 and c.b[0] >= 0]
B = [copy.copy(c).mover(dy=-90) for c in tab]
C = [copy.copy(c).mover(dy=-190) for c in tapa + Pz]
encuadrar(cam, A + B + C, 0, 2100, 1400, 420)
def bloque(lista):
    return sorted(lista, key=lambda c: cam.prof(c.centro()))
for grupo in (A, B, C):
    for c in bloque(grupo): o += dibujar(cam, c)
for letra, grupo in (('A · Cuerpo', A), ('B · Tabique', B), ('C · Tapa frontal', C)):
    pts = [cam.p((c.b[0], c.b[1], c.b[2])) for c in grupo] + [cam.p((c.b[3], c.b[4], c.b[2])) for c in grupo]
    o.append(f'<text x="{sum(p[0] for p in pts)/len(pts):.0f}" y="{max(p[1] for p in pts)+28:.0f}" text-anchor="middle" font-size="14" font-weight="800" fill="#7c3aed">{letra}</text>')
guardar(o, 'esqueleto.svg')

# ═══════════════ interior ═══════════════
o = hoja(1400, 2700, 'Núcleo · interior y cableado', 'Todo montado con sus cables. Los números corresponden a la lista de piezas')
c1 = vista(o, 0, 80, 1400, 800, 30, 25, '1 · Todo armado, corte desde el frente', 'Sin tapa, techo ni pared derecha: frente, placa de expansión con el ESP32 y, detrás del tabique, la energía', escala=5.6, cables=True, esqueleto=True, quitar=('frente', 'techo', 'derecha'))
o += marcas(c1)
c2 = vista(o, 0, 880, 1400, 800, 30, 25, '2 · Cableado (las piezas del frente en transparente)', 'Cada cable va derecho del pin del componente al pin de la placa de expansión; los de los sensores cruzan por el puente', escala=5.6, cables=True, esqueleto=True, fantasma_frente=True, quitar=('frente', 'techo', 'derecha'))
o += marcas(c2, [p.nombre for p in PIEZAS if p.zona != 'frente'])
c3 = vista(o, 0, 1680, 700, 560, -150, 25, '3 · Energía, desde atrás', 'Módulo de carga UNIT (arriba), batería LiPo y ventilador', cables=True, esqueleto=True, quitar=('atras', 'techo', 'izquierda'))
o += marcas(c3, [p.nombre for p in PIEZAS if p.zona == 'energia'])
c4 = vista(o, 700, 1680, 700, 560, 18, 60, '4 · Desde arriba', 'Sin techo: el cableado pasa sobre el tabique y por el pasacables', cables=True, esqueleto=True, quitar=('techo',))
leyenda(o, 40, 2280, 1320, columnas=4)
o.append('<text x="40" y="2510" font-size="16" font-weight="700" fill="#0f172a">Colores de los cables</text>')
for k, (c, t) in enumerate(((m.ROJO, '3V3 / +'), (m.NARANJA, '5V'), (m.NEGRO, 'GND / −'), (m.VERDE, 'SDA'), (m.AZUL, 'SCL'), (m.AMARILLO, 'datos / LED'), ('#0e7490', 'microSD'))):
    x = 40 + (k % 4) * 330; y = 2540 + (k // 4) * 30
    o.append(f'<line x1="{x}" y1="{y}" x2="{x+40}" y2="{y}" stroke="{c}" stroke-width="5" stroke-linecap="round"/><text x="{x+52}" y="{y+5}" font-size="13" fill="#334155">{t}</text>')
guardar(o, 'interior.svg')

# ═══════════════ cableado (vistas planas) ═══════════════
o = hoja(1400, 1500, 'Núcleo · mapa de cables', f'Vistas planas del cableado: así se ve la continuidad de cada cable de punta a punta ({len(HILOS)} cables, ninguno se cruza con los de otra pieza)')
cf = vista(o, 0, 80, 1400, 760, 0, 0, '1 · De frente, sin tapa (piezas del frente en transparente)', 'Plano de cables a 1.2 cm del frente; cada conector dupont lleva el nombre de su pin', margen=60, cables=True, esqueleto=True, fantasma_frente=True, quitar=('frente',))
etq = []
vistos = {}
for h in HILOS:
    x, y, z = h.puntos[-1]
    if abs(y - 13) < 1e-6:
        vistos[(x, z)] = h.hasta.replace('GPIO ', '')
for (x, z), t in vistos.items():
    sup = z > 48
    macho = z in (m.ZF[('sup', 'macho')], m.ZF[('inf', 'macho')])
    zz = (71.2 if macho else 69.4) if sup else (25.4 if macho else 27.2)
    if not macho: zz = 59.6 if sup else 36.9
    px, py = cf.p((x, 13, zz))
    w = 7 + 6.2 * len(t)
    etq.append(f'<g transform="rotate(-90 {px:.1f} {py:.1f})"><rect x="{px - w/2:.1f}" y="{py-6.5:.1f}" width="{w:.1f}" height="13" rx="6.5" fill="{"#7c3aed" if macho else "#b45309"}"/>'
               f'<text x="{px:.1f}" y="{py+3.6:.1f}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#fff">{t}</text></g>')
etq.append(f'<rect x="980" y="112" width="14" height="14" rx="7" fill="#7c3aed"/><text x="1000" y="124" font-size="12" fill="#334155">pin macho</text>'
           f'<rect x="1080" y="112" width="14" height="14" rx="7" fill="#b45309"/><text x="1100" y="124" font-size="12" fill="#334155">pin hembra</text>')
o += etq
o += marcas(cf, [p.nombre for p in PIEZAS])
cl = vista(o, 0, 840, 620, 640, 90, 0, '2 · De lado (sin pared derecha)', 'Capas de fondo, de izquierda (frente) a derecha (atrás)', margen=60, cables=True, esqueleto=True, quitar=('derecha',))
for y0, y1, t in ((0, 2.5, 'tapa'), (2.5, 11, 'frente'), (11, 13, 'cables'), (13, 31, 'conectores y ESP32'), (31, 36, 'placa'), (36, 38, 'tabique'), (38, 52.5, 'energía')):
    a_, b_ = cl.p((m.W, y0, 0)), cl.p((m.W, y1, 0))
    yy = a_[1] + 22 + (16 if t in ('cables', 'tabique') else 0)
    o.append(f'<line x1="{a_[0]+1:.1f}" y1="{yy-10:.1f}" x2="{b_[0]-1:.1f}" y2="{yy-10:.1f}" stroke="#7c3aed" stroke-width="3"/>')
    o.append(f'<text x="{(a_[0]+b_[0])/2:.1f}" y="{yy+4:.1f}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#5b21b6">{t}</text>')
ca_ = vista(o, 620, 840, 780, 640, 180, 0, '3 · Desde atrás (sin pared trasera)', 'Cables de energía entre el tabique y los módulos; el de carga arriba', margen=60, cables=True, esqueleto=True, quitar=('atras',))
guardar(o, 'cableado.svg')

# ═══════════════ piezas, una por una ═══════════════
def texto_destino(h):
    x, y, z = h.puntos[-1]
    if abs(y - 13) < 1e-6:
        fila = 'superior' if z > 48 else 'inferior'
        tipo = 'hembra' if z in (m.ZF[('sup', 'hembra')], m.ZF[('inf', 'hembra')]) else 'macho'
        return f'{h.hasta} · fila {fila}, pin {tipo}'
    return h.hasta
CW, CH = 450, 390
filas_cards = (len(PIEZAS) + 2) // 3
o = hoja(1400, 100 + filas_cards * (CH + 14), 'Núcleo · pieza por pieza', 'Medidas, ubicación y conexiones de cada pieza. Posición desde la esquina inferior izquierda del frente del cuerpo (x a la derecha, y hacia atrás, z hacia arriba), en cm')
for k, p in enumerate(PIEZAS):
    cx, cy = 20 + (k % 3) * (CW + 10), 90 + (k // 3) * (CH + 14)
    o.append(f'<rect x="{cx}" y="{cy}" width="{CW}" height="{CH}" rx="14" fill="#f8fafc" stroke="#e2e8f0"/>')
    o.append(f'<circle cx="{cx+26}" cy="{cy+28}" r="13" fill="#7c3aed"/><text x="{cx+26}" y="{cy+33}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">{p.num}</text>')
    o.append(f'<text x="{cx+48}" y="{cy+33}" font-size="16" font-weight="800" fill="#0f172a">{p.nombre}</text>')
    zona = {'sensores': 'Cámara de sensores', 'frente': 'Frente (tras la tapa)', 'centro': 'Centro (placa y ESP32)', 'energia': 'Energía (tras el tabique)'}[p.zona]
    o.append(f'<text x="{cx+CW-16}" y="{cy+33}" text-anchor="end" font-size="11.5" font-weight="700" fill="#7c3aed">{zona}</text>')
    # pieza sola
    pc = Camara(32, 24, 1, 0, 0)
    s = escala_para(32, 24, p.cajas, 150, 120); pc.s = min(s, 7)
    encuadrar(pc, p.cajas, cx + 10, cy + 50, 170, 140)
    for c in sorted(p.cajas, key=lambda c: pc.prof(c.centro())): o += dibujar(pc, c)
    # ubicación en la carcasa
    lc = Camara(30, 25, 1, 0, 0)
    lc.s = escala_para(30, 25, caja_total(), 250, 150)
    encuadrar(lc, caja_total(), cx + 185, cy + 48, 260, 150)
    o += items_escena(lc, quitar=('frente', 'techo', 'derecha'), esqueleto=True, cables=True, solo=p.nombre)
    b = p.principal.b
    o.append(f'<text x="{cx+18}" y="{cy+218}" font-size="12.5" fill="#0f172a"><tspan font-weight="700">Medidas:</tspan> {(b[3]-b[0])/10:g} × {(b[4]-b[1])/10:g} × {(b[5]-b[2])/10:g} cm</text>')
    o.append(f'<text x="{cx+18}" y="{cy+236}" font-size="12.5" fill="#0f172a"><tspan font-weight="700">Posición:</tspan> x {b[0]/10:g} · y {b[1]/10:g} · z {b[2]/10:g} cm</text>')
    o.append(f'<text x="{cx+18}" y="{cy+254}" font-size="12" fill="#475569">{p.nota}</text>')
    hs = [h for h in HILOS if h.pieza == p.nombre]
    if not hs:
        extra = {'Placa de expansión': ['Recibe al ESP32 en sus zócalos negros', 'Pads 5V y GND ← STEP del módulo de carga', 'Pines macho (blancos) y hembra (amarillos) por GPIO'],
                 'ESP32-S3 (girado)': ['Va encajado en la placa de expansión', 'Fila superior (19-21): OLED, RGB, CCS811, carga', 'Fila inferior: buzzer, microSD, DHT22', 'USB a la derecha: abertura para programar']}.get(p.nombre, [])
        for i, t in enumerate(extra):
            o.append(f'<text x="{cx+18}" y="{cy+280+i*19}" font-size="12" fill="#334155">• {t}</text>')
    for i, h in enumerate(hs[:6]):
        y = cy + 278 + i * 18
        o.append(f'<line x1="{cx+18}" y1="{y-4}" x2="{cx+34}" y2="{y-4}" stroke="{h.color}" stroke-width="4" stroke-linecap="round"/>')
        o.append(f'<text x="{cx+42}" y="{y}" font-size="12" fill="#0f172a"><tspan font-weight="700">{h.desde}</tspan> → {texto_destino(h)}</text>')
guardar(o, 'piezas.svg')

# ═══════════════ planos ═══════════════
o = hoja(1400, 1560, 'Núcleo · planos', 'Vistas ortogonales con medidas en cm para modelarlo en 3D · paredes de 0.25 cm · tapa frontal con 4 tornillos M3')
def plano(titulo, x, y, w, h, yaw, pitch, esc, dims=None, **kw):
    cam = Camara(yaw, pitch, esc, 0, 0)
    encuadrar(cam, caja_total(), x, y + 30, w, h - 40)
    o.append(f'<text x="{x+w/2}" y="{y+18}" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a">{titulo}</text>')
    o.extend(items_escena(cam, **kw))
    if dims: o.extend(dims(cam))
    return cam
P3 = lambda c, *a: c.p(a)
W, D, H = m.W, m.D, m.H
def d_frente(c):
    r = cota(P3(c, m.TX0, 0, 0), P3(c, W, 0, 0), cm(W - m.TX0), 'abajo', 46)
    r += cota(P3(c, 0, 0, 0), P3(c, W, 0, 0), cm(W), 'abajo', 18)
    r += cota(P3(c, m.TX0, 0, m.TZ0), P3(c, m.TX1, 0, m.TZ0), cm(28), 'abajo', 18 + 4 * c.s)
    r += cota(P3(c, m.TX0, 0, m.TZ0), P3(c, m.TX0, 0, m.TZ1), cm(72), 'izq', 18)
    r += cota(P3(c, W, 0, 0), P3(c, W, 0, H), cm(H), 'der', 22)
    r += cota(P3(c, 11, 0, 64), P3(c, 35, 0, 64), 'ventana 2.4 × 1.4 cm', 'arriba', 6 + 16 * c.s)
    r += cota(P3(c, 75.5, 0, H), P3(c, 97.5, 0, H), 'anillo Ø 2.2 cm', 'arriba', 14)
    return r
plano('Frente', 0, 90, 760, 400, 0, 0, 3.4, dims=d_frente, piezas=False)
plano('Lado derecho', 760, 90, 330, 400, 90, 0, 3.4, dims=lambda c: cota(P3(c, W, 0, 0), P3(c, W, D, 0), cm(D), 'abajo', 18) + cota(P3(c, W, D, 0), P3(c, W, D, H), cm(H), 'der', 18), piezas=False)
plano('Lado izquierdo', 1090, 90, 310, 400, -90, 0, 3.4, piezas=False)
plano('Atrás', 0, 520, 700, 360, 180, 0, 3.0, piezas=False)
plano('Arriba', 700, 520, 700, 260, 0, 90, 3.0, piezas=False, dims=lambda c: cota(P3(c, m.TX0, 0, H), P3(c, W, 0, H), cm(W - m.TX0), 'abajo', 18) + cota(P3(c, W, 0, H), P3(c, W, D, H), cm(D), 'der', 18))
plano('Abajo (frente hacia arriba)', 700, 790, 700, 240, 0, -90, 3.0, piezas=False)
o.append('<line x1="40" y1="1050" x2="1360" y2="1050" stroke="#e2e8f0" stroke-width="2"/>')
o.append('<text x="40" y="1078" font-size="17" font-weight="800" fill="#0f172a">Cortes interiores con las piezas</text>')
cpf = plano('Corte frontal (sin tapa)', 0, 1090, 740, 420, 0, 0, 3.4, quitar=('frente',), esqueleto=True); o += marcas(cpf)
cpl = plano('Corte lateral (sin pared derecha)', 740, 1090, 330, 420, 90, 0, 3.4, quitar=('derecha',), esqueleto=True); o += marcas(cpl)
cps = plano('Corte superior (sin techo)', 1060, 1090, 340, 420, 0, 90, 2.1, quitar=('techo',), esqueleto=True)
guardar(o, 'planos.svg')
print('ok')
