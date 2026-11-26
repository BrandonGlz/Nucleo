"""Revisa el modelo: piezas, conectores y soportes sin encimarse; cables continuos, sin atravesar nada y
sin cruzarse con los de otra pieza en el plano de cables del frente; jumpers de 10 cm que alcanzan."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelo2 as m

TOL = 0.05
def dentro(p, b, tol=TOL):
    return all(b[i] + tol < p[i] < b[i + 3] - tol for i in range(3))
def enciman(a, b, tol=TOL):
    return all(a[i] + tol < b[i + 3] and b[i] + tol < a[i + 3] for i in range(3))

def cajas_todas():
    """(dueño, tipo, caja): tipo 'pieza', 'soporte' o 'pared'."""
    out = []
    for pz in m.piezas():
        for c in pz.cajas: out.append((pz.nombre, 'pieza', c))
    for c in m.conectores_placa(): out.append((f'conector {c.b[0]:.1f}/{c.b[2]:.1f}', 'pieza', c))
    for c in m.esqueleto_extra(): out.append((c.soporte, 'soporte', c))
    cu, ca, pu = m.carcasa(())
    for c in cu + ca + pu: out.append(('carcasa', 'pared', c))
    return out

def en_paso(q, c):
    """Puntos que pasan por los huecos de la carcasa o del separador."""
    pb = m.PUENTE
    if pb[0] <= q[0] <= pb[3] and pb[1] < q[1] < pb[4] and pb[2] < q[2] < pb[5]: return True
    hx0, hz0, hx1, hz1 = m.HUECO_TAB
    if c.b == m.TABIQUE and hx0 < q[0] < hx1 and hz0 < q[2] < hz1: return True
    return False

def revisar():
    errores = []
    todas = cajas_todas()
    # 1 · nada se encima (salvo partes de la misma pieza y paredes entre sí)
    for i in range(len(todas)):
        for j in range(i + 1, len(todas)):
            (n1, t1, c1), (n2, t2, c2) = todas[i], todas[j]
            if t1 == t2 == 'pared' or (n1 == n2 and t1 == t2): continue
            if t1 == t2 == 'soporte': continue
            if getattr(c1, 'pasa_tapa', False) and t2 == 'pared' and c2.parte == 'C': continue
            if getattr(c2, 'pasa_tapa', False) and t1 == 'pared' and c1.parte == 'C': continue
            if enciman(c1.b, c2.b):
                errores.append(f'se enciman: {n1} {tuple(round(v, 2) for v in c1.b)} y {n2} {tuple(round(v, 2) for v in c2.b)}')
    # 2 · cables
    hilos = m.cables()
    for h in hilos:
        pts = h.puntos
        for a, b in zip(pts, pts[1:]):
            if sum(1 for i in range(3) if abs(a[i] - b[i]) > 1e-6) != 1:
                errores.append(f'{h.pieza} {h.desde}: tramo no recto {a}→{b}')
            for t in [k / 40 for k in range(1, 40)]:
                q = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
                for nombre, tipo, c in todas:
                    if not dentro(q, c.b) or en_paso(q, c): continue
                    if (nombre == 'Placa de expansión' or nombre.startswith('conector')) and (a, b) == (pts[-2], pts[-1]): continue
                    errores.append(f'{h.pieza} {h.desde}: atraviesa {nombre} {tuple(round(v, 1) for v in c.b)} en {tuple(round(v, 1) for v in q)}')
                    break
    # 3 · cruces en el plano de cables del frente entre piezas distintas
    segs = []
    for h in hilos:
        for a, b in zip(h.puntos, h.puntos[1:]):
            if abs(a[1] - m.YC) < 1e-6 and abs(b[1] - m.YC) < 1e-6:
                segs.append((h, (a[0], a[2]), (b[0], b[2])))
    def cruza(s1, s2):
        (a, b), (c, d) = s1, s2
        if a[0] == b[0] and c[1] == d[1]:
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
    # 4 · jumpers de 10 cm (≈ 7.2 cm de cable entre sus dos conectores): recorrido de 6.5 cm como máximo
    for h in hilos:
        if h.pieza in m.CORTOS and h.largo() > m.JUMPER_MAX:
            errores.append(f'{h.pieza} {h.desde}: recorrido de {h.largo()/10:.1f} cm, no alcanza con 10 cm')
    return hilos, errores, cruces

if __name__ == '__main__':
    hilos, errores, cruces = revisar()
    print('hilos:', len(hilos))
    print('\n'.join(errores[:60]) or 'sin encimados, choques ni tramos rotos')
    if len(errores) > 60: print(f'… y {len(errores) - 60} más')
    print('cruces entre piezas:', cruces or 'ninguno')
