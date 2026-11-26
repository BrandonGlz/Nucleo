"""Motor mínimo de proyección 3D ortográfica a SVG (cajas con calcomanías por cara)."""
import math

def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a):
    m = math.sqrt(dot(a, a)); return tuple(x / m for x in a)

LUZ = norm((-0.35, -0.75, 0.9))

def tono(hexa, f):
    h = hexa.lstrip('#'); r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    c = lambda v: max(0, min(255, int(v * f)))
    return '#%02x%02x%02x' % (c(r), c(g), c(b))

class Camara:
    def __init__(self, yaw, pitch, escala, ox, oy):
        a, b = math.radians(yaw), math.radians(pitch)
        self.d = (math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
        self.r = (math.cos(a), math.sin(a), 0.0)
        self.u = cross(self.d, self.r)
        self.s, self.ox, self.oy = escala, ox, oy
    def p(self, P):
        return (self.ox + self.s * dot(P, self.r), self.oy - self.s * dot(P, self.u))
    def prof(self, P): return dot(P, self.d)

CARAS = {  # normal, origen(x0,y0,z0,x1,y1,z1), U, V, ancho, alto
    'front':  ((0, -1, 0), lambda b: (b[0], b[1], b[5]), (1, 0, 0), (0, 0, -1), lambda b: (b[3]-b[0], b[5]-b[2])),
    'back':   ((0, 1, 0),  lambda b: (b[3], b[4], b[5]), (-1, 0, 0), (0, 0, -1), lambda b: (b[3]-b[0], b[5]-b[2])),
    'right':  ((1, 0, 0),  lambda b: (b[3], b[1], b[5]), (0, 1, 0), (0, 0, -1), lambda b: (b[4]-b[1], b[5]-b[2])),
    'left':   ((-1, 0, 0), lambda b: (b[0], b[4], b[5]), (0, -1, 0), (0, 0, -1), lambda b: (b[4]-b[1], b[5]-b[2])),
    'top':    ((0, 0, 1),  lambda b: (b[0], b[4], b[5]), (1, 0, 0), (0, -1, 0), lambda b: (b[3]-b[0], b[4]-b[1])),
    'bottom': ((0, 0, -1), lambda b: (b[0], b[1], b[2]), (1, 0, 0), (0, 1, 0), lambda b: (b[3]-b[0], b[4]-b[1])),
}

class Caja:
    def __init__(self, x0, y0, z0, x1, y1, z1, color, deco=None, etiqueta=None, borde='#1f2937', punteada=False, opacidad=1):
        self.b = (x0, y0, z0, x1, y1, z1); self.color = color; self.deco = deco or {}
        self.etiqueta = etiqueta; self.borde = borde; self.punteada = punteada; self.opacidad = opacidad
    def mover(self, dx=0, dy=0, dz=0):
        x0, y0, z0, x1, y1, z1 = self.b
        self.b = (x0+dx, y0+dy, z0+dz, x1+dx, y1+dy, z1+dz); return self
    def centro(self):
        b = self.b; return ((b[0]+b[3])/2, (b[1]+b[4])/2, (b[2]+b[5])/2)

def _sum(*vs): return tuple(sum(c) for c in zip(*vs))
def _mul(v, k): return tuple(x * k for x in v)

def dibujar(cam, caja):
    out = []
    caras = []
    for nombre, (n, org, U, V, tam) in CARAS.items():
        if dot(n, cam.d) <= 1e-6: continue
        O = org(caja.b); w, h = tam(caja.b)
        esq = [O, _sum(O, _mul(U, w)), _sum(O, _mul(U, w), _mul(V, h)), _sum(O, _mul(V, h))]
        prof = sum(cam.prof(e) for e in esq) / 4
        caras.append((prof, nombre, n, O, U, V, w, h, esq))
    caras.sort(key=lambda c: c[0])
    dash = ' stroke-dasharray="4 3"' if caja.punteada else ''
    for _, nombre, n, O, U, V, w, h, esq in caras:
        f = 0.72 + 0.34 * max(0, dot(n, LUZ))
        pts = ' '.join('%.1f,%.1f' % cam.p(e) for e in esq)
        out.append(f'<polygon points="{pts}" fill="{tono(caja.color, f)}" fill-opacity="{caja.opacidad}" stroke="{caja.borde}" stroke-width="1" stroke-linejoin="round"{dash}/>')
        if nombre in caja.deco:
            s0 = cam.p(O); a = cam.p(_sum(O, U)); b = cam.p(_sum(O, V))
            m = (a[0]-s0[0], a[1]-s0[1], b[0]-s0[0], b[1]-s0[1], s0[0], s0[1])
            out.append('<g transform="matrix(%.4f %.4f %.4f %.4f %.2f %.2f)">' % m + caja.deco[nombre](w, h) + '</g>')
    return out

def escena(cam, grupos):
    """grupos: listas de cajas en orden de dibujo; dentro de cada grupo se ordena por profundidad."""
    out = []
    for g in grupos:
        for c in sorted(g, key=lambda c: cam.prof(c.centro())):
            out += dibujar(cam, c)
    return out

def rotulos(cam, cajas, x_izq, x_der, y0, y1, cx):
    """Rótulos con línea guía: a la izquierda o derecha según la posición en pantalla."""
    out = []; lados = {'i': [], 'd': []}
    for c in cajas:
        if not c.etiqueta: continue
        px, py = cam.p(c.centro())
        lados['i' if px < cx else 'd'].append((py, px, c.etiqueta))
    for lado, lista in lados.items():
        lista.sort()
        n = len(lista)
        for k, (py, px, texto) in enumerate(lista):
            ty = y0 + (y1 - y0) * (k + 0.5) / max(n, 1)
            tx = x_izq if lado == 'i' else x_der
            anc = 'end' if lado == 'i' else 'start'
            codo = tx + (12 if lado == 'i' else -12)
            out.append(f'<polyline points="{px:.1f},{py:.1f} {codo:.1f},{ty:.1f} {tx:.1f},{ty:.1f}" fill="none" stroke="#475569" stroke-width="1.2"/>')
            out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="3" fill="#0f172a" stroke="#fff" stroke-width="1"/>')
            l1, _, l2 = texto.partition('|')
            dx = -4 if lado == 'i' else 4
            out.append(f'<text x="{tx+dx:.1f}" y="{ty+1:.1f}" text-anchor="{anc}" font-size="13" font-weight="700" fill="#0f172a">{l1}</text>')
            if l2:
                out.append(f'<text x="{tx+dx:.1f}" y="{ty+16:.1f}" text-anchor="{anc}" font-size="11.5" fill="#475569">{l2}</text>')
    return out
