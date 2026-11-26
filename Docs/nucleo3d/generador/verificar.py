"""Revisa la continuidad y los choques del cableado."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelo2 as m

def dentro(p, b, tol=0.05):
    return all(b[i] + tol < p[i] < b[i + 3] - tol for i in range(3))

def revisar():
    errores = []
    piezas = m.piezas()
    cajas = [(pz.nombre, c) for pz in piezas for c in pz.cajas] + [('esqueleto', c) for c in m.esqueleto_extra()]
    cu, ca, pu = m.carcasa(())
    paredes = [('carcasa', c) for c in cu + ca]
    hilos = m.cables()
    for h in hilos:
        pts = h.puntos
        for a, b in zip(pts, pts[1:]):
            dif = sum(1 for i in range(3) if abs(a[i] - b[i]) > 1e-6)
            if dif != 1: errores.append(f'{h.pieza} {h.desde}: tramo no recto {a}→{b}')
            for t in [k / 40 for k in range(1, 40)]:
                q = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
                for nombre, c in cajas + paredes:
                    if nombre == h.pieza and (q == pts[0] or True) and dentro(q, c.b):
                        # el hilo puede salir de su propia pieza solo en el primer tramo
                        if (a, b) == (pts[0], pts[1]): continue
                        errores.append(f'{h.pieza} {h.desde}: atraviesa su propia pieza en {q}')
                    elif nombre != h.pieza and dentro(q, c.b):
                        pb = m.PUENTE
                        if nombre == 'carcasa' and pb[0] <= q[0] <= pb[3] and pb[1] < q[1] < pb[4] and pb[2] < q[2] < pb[5]: continue
                        hx0, hz0, hx1, hz1 = m.HUECO_TAB
                        if c.b == m.esqueleto_extra()[4].b and hx0 < q[0] < hx1 and hz0 < q[2] < hz1: continue
                        # los conectores de la placa de expansión son el destino del último tramo
                        if nombre == 'Placa de expansión' and (a, b) == (pts[-2], pts[-1]): continue
                        errores.append(f'{h.pieza} {h.desde}: atraviesa {nombre} {c.b} en {tuple(round(v,1) for v in q)}')
                        break
    # cruces en el plano frontal de cables (y = 12) entre piezas distintas
    segs = []
    for h in hilos:
        for a, b in zip(h.puntos, h.puntos[1:]):
            if abs(a[1] - m.YC) < 1e-6 and abs(b[1] - m.YC) < 1e-6:
                segs.append((h, (a[0], a[2]), (b[0], b[2])))
    def cruza(s1, s2):
        (a, b), (c, d) = s1, s2
        if a[0] == b[0] and c[1] == d[1]:   # vertical vs horizontal
            x, y = a[0], c[1]
            return min(c[0], d[0]) < x < max(c[0], d[0]) and min(a[1], b[1]) < y < max(a[1], b[1])
        if a[1] == b[1] and c[0] == d[0]:
            return cruza((c, d), (a, b))
        return False
    cruces = set()
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            h1, a1, b1 = segs[i]; h2, a2, b2 = segs[j]
            if h1.pieza != h2.pieza and cruza((a1, b1), (a2, b2)):
                cruces.add((h1.pieza, h2.pieza))
    return hilos, errores, cruces

if __name__ == '__main__':
    hilos, errores, cruces = revisar()
    print('hilos:', len(hilos))
    print('\n'.join(errores[:40]) or 'sin choques ni tramos rotos')
    print('cruces entre piezas:', cruces or 'ninguno')
