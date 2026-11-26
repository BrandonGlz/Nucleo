"""Modelo 3D de Núcleo beta en mm (x: ancho, y: fondo desde el frente, z: alto). Se muestra en cm."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Caja
from modelo import logo, rejillas

W, D, H, P = 110, 55, 80, 2.5
TX0, TX1, TY0, TY1, TZ0, TZ1 = -34, -6, 2, 53, 4, 76
PUENTE = (-8, 20, 34, 2.5, 32, 46)          # paso de cables cámara → cuerpo (atraviesa ambas paredes)
TABIQUE = (P, 36, P, W - P, 38, 74)
HUECO_TAB = (86, 26, 100, 34)               # pasacables del tabique (x0, z0, x1, z1)
PLACA = (15, 31, 22, 95, 32.6, 74)          # placa de expansión
ESP = (20, 17.5, 35, 89, 22.5, 61)
YC = 12                                     # plano de cables del frente
YE = 39                                     # plano de cables de energía (entre tabique y módulos)
# Energía (detrás del tabique). Lado de los pines 19-21 = arriba.
BATERIA = (6, 40, P, 56, 46, 36.5)          # LiPo 1000 mAh (603450): 5 × 3.4 × 0.6 cm, de pie
VENT = (30, 42.5, 44, 60, 52.5, 74)         # ventilador 3010 contra la pared trasera
VENT_C = ((VENT[0] + VENT[3]) / 2, (VENT[2] + VENT[5]) / 2)
UNIT = (64, 40, 46, 106, 43.5, 72)          # módulo de carga UNIT LiPo Boost & I2C, arriba a la derecha
USB_CARGA = (39.5, 54.5, 44.5, 63.5)        # hueco en la pared derecha (y0, z0, y1, z1)
MOSFET = (90, 40, 33, 101, 42, 44)

# ── Filas de la placa de expansión ─────────────────────────────────────
ARRIBA = ['G', 'TX', 'RX', '1', '2', '42', '41', '40', '39', '38', '37', '36', '35', '0', '45', '48', '47', '21', '20', '19', 'G', 'G']
ABAJO = ['3V', '3V', 'RST', '4', '5', '6', '7', '15', '16', '17', '18', '8', '3', '46', '9', '10', '11', '12', '13', '14', '5V', 'G']
FILA = {'sup': ['3V3', 'GND'] + ARRIBA + ['GND', '3V3'], 'inf': ['3V3', 'GND'] + ABAJO + ['GND', '3V3']}
ZF = {('sup', 'macho'): 66.25, ('sup', 'hembra'): 62.75, ('inf', 'macho'): 30.25, ('inf', 'hembra'): 33.75}
def xk(k): return 23.25 + 2.54 * k
def pin(fila, k, tipo):
    """Punto donde llega el cable: frente del conector dupont puesto en ese pin."""
    return (xk(k), 13, ZF[(fila, tipo)])
def k_de(fila, nombre, n=0):
    idx = [i for i, p in enumerate(FILA[fila]) if p == nombre]
    return idx[n]

# ── Calcomanías ─────────────────────────────────────────────────────────
def frente_tapa(w, h):
    s = [f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="5" fill="none" stroke="#94a3b8" stroke-width="0.4"/>',
         '<rect x="11" y="16" width="24" height="14" rx="1.5" fill="#0b1220" stroke="#334155" stroke-width="0.8"/>',
         '<text x="13" y="20.5" font-size="2.6" fill="#7dd3fc" font-weight="600">NC-0501 · Wi-Fi</text>',
         '<text x="13" y="25" font-size="3.6" fill="#e0f2fe" font-weight="700">23.4°C 48%</text>',
         '<text x="13" y="28.6" font-size="2.6" fill="#bae6fd">eCO2 412 ppm</text>',
         '<circle cx="86.5" cy="25.5" r="11" fill="none" stroke="#22c55e" stroke-width="2.6"/>',
         '<circle cx="86.5" cy="25.5" r="12.6" fill="none" stroke="#22c55e" stroke-opacity="0.35" stroke-width="1.6"/>',
         '<circle cx="86.5" cy="25.5" r="8.5" fill="#e5e7eb" stroke="#94a3b8" stroke-width="0.4"/>',
         '<circle cx="15.5" cy="43.5" r="2.5" fill="#38bdf8" stroke="#0369a1" stroke-width="0.4"/>',
         '<text x="19.5" y="44.6" font-size="3" fill="#475569" font-weight="600">Wi-Fi</text>']
    for i in range(4):
        for j in range(4):
            s.append(f'<circle cx="{81.1+i*3.6:.1f}" cy="{52.1+j*3.6:.1f}" r="1" fill="#475569"/>')
    s.append(logo(8, 53, 40))
    s.append('<rect x="52" y="66" width="14" height="5.5" rx="2.75" fill="#7c3aed"/><text x="59" y="70" font-size="3.4" font-weight="800" fill="#fff" text-anchor="middle">BETA</text>')
    for cx, cy in ((5, 5), (w-5, 5), (5, h-5), (w-5, h-5)):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="1.6" fill="#cbd5e1" stroke="#64748b" stroke-width="0.4"/><circle cx="{cx}" cy="{cy}" r="0.6" fill="#64748b"/>')
    return ''.join(s)

def fondo_inferior(w, h):
    return ('<rect x="50" y="5" width="16" height="2.2" rx="0.8" fill="#111827"/>'
            '<text x="58" y="11" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">microSD</text>')

def trasera(w, h):  # u = 110 - x, v = 80 - z
    cu, cv = W - VENT_C[0], H - VENT_C[1]
    s = [f'<circle cx="{cu}" cy="{cv}" r="14" fill="#1f2937"/>']
    for r in (12, 8.5, 5):
        s.append(f'<circle cx="{cu}" cy="{cv}" r="{r}" fill="none" stroke="#94a3b8" stroke-width="1"/>')
    s.append(f'<line x1="{cu-14}" y1="{cv}" x2="{cu+14}" y2="{cv}" stroke="#94a3b8" stroke-width="1"/><line x1="{cu}" y1="{cv-14}" x2="{cu}" y2="{cv+14}" stroke="#94a3b8" stroke-width="1"/>')
    s.append(f'<text x="{cu}" y="{cv+18.5}" font-size="2.8" text-anchor="middle" fill="#334155" font-weight="600">salida de aire</text>')
    for u in (25, 85):
        s.append(f'<circle cx="{u}" cy="58" r="2.6" fill="#1f2937"/><rect x="{u-1.1}" y="58" width="2.2" height="6" rx="1.1" fill="#1f2937"/>')
    s.append('<text x="55" y="62" font-size="2.8" text-anchor="middle" fill="#334155" font-weight="600">ranuras para colgar</text>')
    return ''.join(s)

def derecha(w, h):  # u = y, v = 80 - z
    y0, z0, y1, z1 = USB_CARGA
    return ('<rect x="16" y="25" width="7" height="8" rx="1.5" fill="#111827"/>'
            '<text x="19.5" y="38" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">USB del ESP</text>'
            f'<rect x="{y0}" y="{H-z1}" width="{y1-y0}" height="{z1-z0}" rx="1.5" fill="#111827"/>'
            f'<text x="{(y0+y1)/2}" y="{H-z0+5}" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">USB-C carga</text>')

def hueco(u0, v0, u1, v1, texto=None):
    def f(w, h):
        s = f'<rect x="{u0}" y="{v0}" width="{u1-u0}" height="{v1-v0}" rx="1" fill="#1e293b"/>'
        if texto: s += f'<text x="{(u0+u1)/2}" y="{v1+3.4}" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">{texto}</text>'
        return s
    return f

def tabique_frente(w, h):  # u = x - 2.5, v = 74 - z
    s = rejillas(w, 22, margen=3, paso=4)
    u0, z0, u1, z1 = HUECO_TAB
    s += f'<rect x="{u0-P}" y="{74-z1}" width="{u1-u0}" height="{z1-z0}" rx="1.5" fill="#1e293b"/>'
    s += f'<text x="{(u0+u1)/2-P}" y="{74-z0+3.5}" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">pasacables</text>'
    return s
def tabique_atras(w, h):  # u = 107.5 - x
    s = rejillas(w, 22, margen=3, paso=4)
    u0, z0, u1, z1 = HUECO_TAB
    s += f'<rect x="{W-P-u1}" y="{74-z1}" width="{u1-u0}" height="{z1-z0}" rx="1.5" fill="#1e293b"/>'
    return s

def placa_frente(w, h):  # 80 × 52 ; u = x - 15, v = 74 - z
    s = []
    for cx, cy in ((3.5, 3.5), (w-3.5, 3.5), (3.5, h-3.5), (w-3.5, h-3.5)):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="2.2" fill="#d1d5db"/><circle cx="{cx}" cy="{cy}" r="1.2" fill="#0b0b0b"/>')
    s.append(f'<rect x="69" y="47" width="5" height="2.6" rx="0.4" fill="#d4a017"/><text x="71.5" y="45.8" font-size="1.9" text-anchor="middle" fill="#e5e7eb" font-weight="700">GND 5V</text>')
    s.append('<text x="5" y="27" font-size="2.2" fill="#9ca3af" font-weight="700">3V3</text><text x="5" y="30" font-size="2.2" fill="#9ca3af" font-weight="700">GND</text>')
    return ''.join(s)

def tira(color, hueco_color, pines=False):
    def f(w, h):
        s = []
        for k in range(26):
            u = 1.27 + 2.54 * k
            if pines: s.append(f'<rect x="{u-0.35}" y="{h/2-0.35}" width="0.7" height="0.7" fill="#cbd5e1"/>')
            else: s.append(f'<rect x="{u-0.5}" y="{h/2-0.5}" width="1" height="1" fill="{hueco_color}"/>')
        return ''.join(s)
    return f

def esp_frente(w, h):
    s = ['<rect x="2.5" y="4" width="18" height="18" rx="0.8" fill="#c7cbd1" stroke="#9ca3af" stroke-width="0.3"/>',
         '<path d="M2 6 h-1.5 v2 h1.5 v2 h-1.5 v2 h1.5 v2 h-1.5 v2 h1.5" fill="none" stroke="#d4a017" stroke-width="0.4"/>',
         '<text x="11.5" y="14" font-size="2.4" text-anchor="middle" fill="#374151" font-weight="700">ESP32-S3</text>',
         '<text x="42" y="14.5" font-size="3.4" text-anchor="middle" fill="#f3f4f6" font-weight="800">lonely binary</text>']
    for k in range(22):
        u = 8 + k * 2.54
        s.append(f'<circle cx="{u:.2f}" cy="1.4" r="0.7" fill="#d4a017"/><circle cx="{u:.2f}" cy="{h-1.4}" r="0.7" fill="#d4a017"/>')
    s.append(f'<rect x="{w-4}" y="5" width="4" height="4.5" rx="0.8" fill="#c0c4cc"/><rect x="{w-4}" y="16.5" width="4" height="4.5" rx="0.8" fill="#c0c4cc"/>')
    return ''.join(s)

def pcb(texto, color_txt='#f8fafc', tam=2.6, extra=''):
    return lambda w, h: extra + f'<text x="{w/2:.1f}" y="{h/2+tam/3:.1f}" font-size="{tam}" text-anchor="middle" fill="{color_txt}" font-weight="700">{texto}</text>'
def oled_frente(w, h):
    return ('<rect x="1" y="5" width="25" height="15" fill="#020617"/><text x="3" y="11" font-size="3" fill="#7dd3fc" font-weight="700">OLED</text>'
            '<text x="3" y="15" font-size="2.2" fill="#7dd3fc">0.96″ · 0x3C</text>')
def bateria_frente(w, h):
    return (f'<rect x="3" y="{h/2-9}" width="{w-6}" height="18" rx="1.5" fill="#1d4ed8" fill-opacity="0.85"/>'
            f'<text x="{w/2}" y="{h/2-1.5}" font-size="4" text-anchor="middle" fill="#fff" font-weight="800">LiPo 3.7 V</text>'
            f'<text x="{w/2}" y="{h/2+4.5}" font-size="3.2" text-anchor="middle" fill="#dbeafe">1000 mAh</text>')
def ventilador_cara(w, h):
    c = w / 2
    s = [f'<circle cx="{c}" cy="{h/2}" r="{c-1.5}" fill="#0f172a"/>', f'<circle cx="{c}" cy="{h/2}" r="4" fill="#334155"/>']
    for k in range(5):
        s.append(f'<path d="M{c} {h/2} q 6 -9.5 11 -10.5" stroke="#64748b" stroke-width="2.4" fill="none" transform="rotate({k*72} {c} {h/2})"/>')
    for cx, cy in ((2.5, 2.5), (w-2.5, 2.5), (2.5, h-2.5), (w-2.5, h-2.5)):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="1.2" fill="#e5e7eb"/>')
    return ''.join(s)
def unit_cara(w, h):
    return ('<rect x="2" y="3" width="7" height="5" rx="0.6" fill="#f8fafc"/><text x="5.5" y="11" font-size="1.9" text-anchor="middle" fill="#e5e7eb">JST</text>'
            f'<rect x="{w/2-4}" y="{h/2-4}" width="8" height="8" fill="#111827"/><circle cx="{w/2+9}" cy="{h/2}" r="2.6" fill="#2563eb"/>'
            f'<text x="{w/2}" y="{h-3}" font-size="2.4" text-anchor="middle" fill="#f8fafc" font-weight="700">UNIT LiPo Boost · I2C</text>'
            f'<rect x="{w-3}" y="{h/2-4.5}" width="3" height="9" rx="1" fill="#c0c4cc"/>')
def dht_cara(w, h):
    s = [f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="1" fill="#f1f5f9"/>']
    for i in range(4):
        for j in range(6):
            s.append(f'<rect x="{2.2+i*3.2:.1f}" y="{2.5+j*3.6:.1f}" width="2" height="2.4" fill="#94a3b8"/>')
    return ''.join(s)
def ccs_cara(w, h):
    return (f'<rect x="{w/2-3}" y="{h/2-3}" width="6" height="6" fill="#111827"/>'
            f'<text x="{w/2}" y="{h-2}" font-size="2.4" text-anchor="middle" fill="#ede9fe" font-weight="700">CCS811</text>')

# ── Piezas ──────────────────────────────────────────────────────────────
class Pieza:
    def __init__(self, nombre, zona, cajas, nota):
        self.nombre, self.zona, self.cajas, self.nota = nombre, zona, cajas, nota
        self.principal = cajas[0]

def piezas():
    L = []
    L.append(Pieza('CCS811', 'sensores', [Caja(-12, 30, 50, -10, 51, 65, '#6d28d9', {'left': ccs_cara})], 'Arriba (lado 19-21); su calor sube y no llega al DHT22'))
    L.append(Pieza('DHT22', 'sensores', [Caja(-18, 17, 8, -10, 33, 34, '#f1f5f9', {'left': dht_cara})], 'Abajo, con los pines hacia arriba; frente a las rejillas'))
    L.append(Pieza('Pantalla OLED', 'frente', [Caja(9, P, 44, 36, P + 4, 71, '#1e3a8a', {'front': oled_frente})], 'Pegada a la ventana de la tapa; jumpers de 10 cm'))
    L.append(Pieza('LED de Wi-Fi', 'frente', [Caja(13, P, 34, 18, 9, 39, '#38bdf8')], 'LED de 5 mm con resistencia de 220 Ω en el ánodo'))
    L.append(Pieza('LED RGB KY-016', 'frente', [Caja(77, P + 3, 47, 96, P + 5, 62, '#18181b', {'front': pcb('KY-016')}), Caja(83.5, P, 51.5, 89.5, P + 3, 57.5, '#f8fafc')], 'Detrás del anillo de luz; jumpers de 10 cm'))
    L.append(Pieza('Buzzer KY-012', 'frente', [Caja(77, 9.5, 15, 96, 11, 30, '#18181b', {'front': pcb('KY-012')}),
              Caja(80.5, P, 16.5, 92.5, 9.5, 28.5, '#111827', {'front': lambda w, h: f'<circle cx="{w/2}" cy="{h/2}" r="{w/2-0.6}" fill="#1f2937" stroke="#4b5563" stroke-width="0.6"/>'})], 'Detrás de la rejilla del buzzer; jumpers de 10 cm'))
    L.append(Pieza('Lector microSD HW-125', 'frente', [Caja(46, 4, P, 70, 10, 44.5, '#1e40af', {'back': pcb('HW-125'), 'front': pcb('HW-125', extra='<rect x="5" y="34" width="14" height="7" rx="0.5" fill="#cbd5e1"/>')})], 'De pie, ranura por abajo, pines atrás; jumpers de 10 cm'))
    filas = []
    for fila, zm, zh in (('sup', 65, 61.5), ('inf', 29, 32.5)):
        filas += [Caja(22, 28.5, zm, 88.04, 31, zm + 2.5, '#f8fafc', {'front': tira('#f8fafc', '#111', pines=True)}),
                  Caja(22, 22.5, zh, 88.04, 31, zh + 2.5, '#facc15', {'front': tira('#facc15', '#3f3f46')})]
    L.append(Pieza('Placa de expansión', 'centro', [Caja(*PLACA, '#0b0b0b', {'front': placa_frente})] + filas +
              [Caja(22, 22.5, 35.4, 88, 31, 37.8, '#18181b'), Caja(22, 22.5, 58.2, 88, 31, 60.6, '#18181b')],
              'Atornillada a 4 postes del tabique; cada GPIO con pin macho y hembra'))
    L.append(Pieza('ESP32-S3 (girado)', 'centro', [Caja(*ESP, '#111111', {'front': esp_frente})], 'Antena a la izquierda, USB a la derecha; pines 19-21 arriba'))
    L.append(Pieza('Módulo de carga UNIT', 'energia', [Caja(*UNIT, '#18181b', {'back': unit_cara, 'front': pcb('UNIT LiPo Boost · I2C', tam=2.6)})], 'Arriba (lado 19-21); USB-C de carga por el lado derecho'))
    L.append(Pieza('Batería LiPo', 'energia', [Caja(*BATERIA, '#c9ced6', {'front': bateria_frente, 'back': bateria_frente})], '1000 mAh; de pie detrás del tabique, sujeta por el tope'))
    L.append(Pieza('Ventilador 5 V', 'energia', [Caja(*VENT, '#111827', {'front': ventilador_cara, 'back': ventilador_cara})], '3 cm; saca el aire caliente por la rejilla trasera'))
    L.append(Pieza('Módulo MOSFET', 'energia', [Caja(*MOSFET, '#0f766e', {'front': pcb('MOSFET', tam=2), 'back': pcb('MOSFET', tam=2)})], 'Enciende el ventilador desde el GPIO 9'))
    for k, p in enumerate(L): p.num = k + 1
    return L

def esqueleto_extra():
    """Detalles internos de la carcasa (vacía)."""
    gris = '#d5dbe3'
    c = []
    for x0 in (P, W - P - 5):
        for z0 in (P, H - P - 5):
            c.append(Caja(x0, P, z0, x0 + 5, 12, z0 + 5, gris))          # postes para los tornillos de la tapa
    c.append(Caja(*TABIQUE, '#e2e8f0', {'front': tabique_frente, 'back': tabique_atras}))
    for x in (17, 90):
        for z in (24, 69):
            c.append(Caja(x, 32.6, z, x + 3, 36, z + 3, gris))            # postes de la placa
    c.append(Caja(BATERIA[0], BATERIA[4], P, BATERIA[3], BATERIA[4] + 2.5, 10, gris))   # tope de la batería
    c.append(Caja(-10, 19, 12, -8, 31, 16, gris))                         # soporte del DHT22
    c.append(Caja(-10, 32, 61, -8, 49, 64, gris))                         # soporte del CCS811
    c.append(Caja(VENT[0] - 1.5, VENT[1], VENT[2], VENT[0], VENT[4], VENT[5], gris))   # marco del ventilador (izq.)
    c.append(Caja(VENT[3], VENT[1], VENT[2], VENT[3] + 1.5, VENT[4], VENT[5], gris))   # marco del ventilador (der.)
    c.append(Caja(UNIT[0], UNIT[4], UNIT[2] - 2, UNIT[3], UNIT[4] + 2, UNIT[2], gris)) # repisa del módulo de carga
    return c

def carcasa(quitar=()):
    gris, torre = '#e9edf2', '#dde3ea'
    q = set(quitar)
    cuerpo = [Caja(0, 0, 0, W, D, P, gris, {'bottom': fondo_inferior})]
    if 'atras' not in q: cuerpo.append(Caja(0, D - P, P, W, D, H - P, gris, {'back': trasera}))
    if 'izquierda' not in q: cuerpo.append(Caja(0, P, P, P, D - P, H - P, gris, {'right': hueco(PUENTE[1], H - PUENTE[5], PUENTE[4], H - PUENTE[2], 'paso de cables'), 'left': hueco(D - PUENTE[4], H - PUENTE[5], D - PUENTE[1], H - PUENTE[2])}))
    if 'derecha' not in q: cuerpo.append(Caja(W - P, P, P, W, D - P, H - P, gris, {'right': derecha}))
    if 'techo' not in q: cuerpo.append(Caja(0, P, H - P, W, D, H, gris))
    if 'frente' not in q: cuerpo.append(Caja(0, 0, 0, W, P, H, gris, {'front': frente_tapa}))
    camara = [Caja(TX0, TY0, TZ0, TX1, TY1, TZ0 + 2, torre)]
    if 'atras' not in q: camara.append(Caja(TX0, TY1 - 2, TZ0 + 2, TX1, TY1, TZ1, torre, {'back': rejillas}))
    if 'izquierda' not in q: camara.append(Caja(TX0, TY0 + 2, TZ0 + 2, TX0 + 2, TY1 - 2, TZ1, torre, {'left': rejillas}))
    if 'derecha' not in q: camara.append(Caja(TX1 - 2, TY0 + 2, TZ0 + 2, TX1, TY1 - 2, TZ1, torre, {'left': hueco(TY1 - 2 - PUENTE[4], TZ1 - PUENTE[5], TY1 - 2 - PUENTE[1], TZ1 - PUENTE[2], 'paso de cables')}))
    if 'techo' not in q: camara.append(Caja(TX0, TY0, TZ1 - 2, TX1, TY1, TZ1, torre, {'top': rejillas}))
    if 'frente' not in q: camara.append(Caja(TX0, TY0, TZ0 + 2, TX1, TY0 + 2, TZ1 - 2, torre, {'front': rejillas}))
    puente = [Caja(TX1, PUENTE[1], PUENTE[2], 0, PUENTE[1] + 1.5, PUENTE[5], '#cbd5e1'), Caja(TX1, PUENTE[4] - 1.5, PUENTE[2], 0, PUENTE[4], PUENTE[5], '#cbd5e1'),
              Caja(TX1, PUENTE[1], PUENTE[2], 0, PUENTE[4], PUENTE[2] + 1.5, '#cbd5e1'), Caja(TX1, PUENTE[1], PUENTE[5] - 1.5, 0, PUENTE[4], PUENTE[5], '#cbd5e1')]
    return cuerpo, camara, puente

# ── Cables ──────────────────────────────────────────────────────────────
ROJO, NARANJA, NEGRO, VERDE, AZUL, AMARILLO = '#dc2626', '#ea580c', '#111827', '#16a34a', '#2563eb', '#eab308'
class Hilo:
    def __init__(self, pieza, desde, hasta, color, puntos):
        self.pieza, self.desde, self.hasta, self.color, self.puntos = pieza, desde, hasta, color, puntos

def limpiar(pts):
    out = [pts[0]]
    for p in pts[1:]:
        if p != out[-1]: out.append(p)
    return out

def cables():
    H_ = []
    def h(pieza, desde, hasta, color, pts): H_.append(Hilo(pieza, desde, hasta, color, limpiar(pts)))
    # DHT22 (abajo de la cámara, pines arriba) → puente → fila inferior, macho, desde abajo
    for i, (p_, dest, color, k) in enumerate((('+', '3V3', ROJO, 0), ('out', 'GPIO 4', AMARILLO, k_de('inf', '4')), ('−', 'GND', NEGRO, 1))):
        y = 22.5 + 2.5 * i; z = 37 + 1.2 * i; xa = 4 + 1.2 * i; zv = 24 - 1.2 * i
        t = pin('inf', k, 'macho')
        h('DHT22', p_, dest, color, [(-14, y, 34), (-14, y, z), (xa, y, z), (xa, YC, z), (xa, YC, zv), (t[0], YC, zv), (t[0], YC, t[2]), t])
    # CCS811 (arriba de la cámara, pines abajo) → puente → fila superior, hembra, desde arriba. Orden de cinta para no cruzar.
    fisico = {'VCC': 0, 'GND': 1, 'SCL': 2, 'SDA': 3}
    for i, (p_, dest, color, k) in enumerate((('SCL', 'GPIO 42', AZUL, k_de('sup', '42')), ('SDA', 'GPIO 2', VERDE, k_de('sup', '2')), ('GND', 'GND', NEGRO, 1), ('VCC', '3V3', ROJO, 0))):
        y0 = 33 + 2.54 * fisico[p_]; y = 26 + 1.2 * i; z = 39.8 + 1.1 * i; xa = 4.5 + 1.0 * i
        zt = 76.6 - 0.9 * i; xb = 45 - 0.9 * i; zr = 64.4 + 0.35 * i
        t = pin('sup', k, 'hembra')
        h('CCS811', p_, dest, color, [(-11, y0, 50), (-11, y0, 48), (-11, y, 48), (-11, y, z), (xa, y, z), (xa, YC, z), (xa, YC, zt), (xb, YC, zt), (xb, YC, zr), (t[0], YC, zr), (t[0], YC, t[2]), t])
    # OLED → fila superior, macho, desde arriba
    for i, (p_, dest, color, k) in enumerate((('GND', 'GND', NEGRO, 1), ('VCC', '3V3', ROJO, 0), ('SCL', 'GPIO 42', AZUL, k_de('sup', '42')), ('SDA', 'GPIO 2', VERDE, k_de('sup', '2')))):
        x0 = 18.7 + 2.54 * i; zl = 70 + 0.8 * i
        t = pin('sup', k, 'macho')
        h('Pantalla OLED', p_, dest, color, [(x0, 11, 69), (x0, YC, 69), (x0, YC, zl), (t[0], YC, zl), (t[0], YC, t[2]), t])
    # LED de Wi-Fi → fila superior, hembra, desde abajo
    for i, (p_, dest, color, k) in enumerate((('cátodo', 'G', NEGRO, k_de('sup', 'G')), ('ánodo + 220 Ω', 'GPIO 41', AMARILLO, k_de('sup', '41')))):
        x0 = 14.23 + 2.54 * i; zl = 58.5 + 1.0 * i
        t = pin('sup', k, 'hembra')
        h('LED de Wi-Fi', p_, dest, color, [(x0, 9, 36.5), (x0, YC, 36.5), (x0, YC, zl), (t[0], YC, zl), (t[0], YC, t[2]), t])
    # LED RGB → R, G, B a la fila superior (macho, desde abajo); − a G (hembra)
    for i, (p_, dest, color, k) in enumerate((('R', 'GPIO 38', ROJO, k_de('sup', '38')), ('G', 'GPIO 39', VERDE, k_de('sup', '39')), ('B', 'GPIO 40', AZUL, k_de('sup', '40')))):
        x0 = 80 + 2.54 * i; zl = 56 - 0.9 * i; xv = 55 + 0.9 * (2 - i)
        t = pin('sup', k, 'macho')
        h('LED RGB KY-016', p_, dest, color, [(x0, 7.5, 48.5), (x0, YC, 48.5), (x0, YC, zl), (xv, YC, zl), (xv, YC, 64.6 + 0.3 * i), (t[0], YC, 64.6 + 0.3 * i), (t[0], YC, t[2]), t])
    t = pin('sup', k_de('sup', 'G', 1), 'hembra')
    h('LED RGB KY-016', '−', 'G', NEGRO, [(87.62, 7.5, 48.5), (87.62, YC, 48.5), (87.62, YC, 58), (t[0], YC, 58), (t[0], YC, t[2]), t])
    # Buzzer → fila inferior, macho, desde abajo
    t = pin('inf', k_de('inf', '12'), 'macho')
    h('Buzzer KY-012', 'S', 'GPIO 12', NARANJA, [(83, 11, 29), (83, YC, 29), (83, YC, 25), (t[0], YC, 25), (t[0], YC, t[2]), t])
    t = pin('inf', 25, 'macho')
    h('Buzzer KY-012', '+', '3V3', ROJO, [(85.54, 11, 29), (85.54, YC, 29), (85.54, YC, 27), (t[0], YC, 27), (t[0], YC, t[2]), t])
    t = pin('inf', 24, 'macho')
    h('Buzzer KY-012', '−', 'GND', NEGRO, [(88.08, 11, 29), (88.08, YC, 29), (88.08, YC, 26), (t[0], YC, 26), (t[0], YC, t[2]), t])
    # microSD → fila inferior, hembra, desde arriba
    for i, (p_, dest, color, nombre) in enumerate((('CS', 'GPIO 15', '#0e7490', '15'), ('SCK', 'GPIO 17', '#a21caf', '17'), ('MOSI', 'GPIO 16', '#06b6d4', '16'), ('MISO', 'GPIO 18', '#0891b2', '18'))):
        x0 = 52 + 2.54 * i; zl = 38 + 0.9 * i
        t = pin('inf', k_de('inf', nombre), 'hembra')
        h('Lector microSD HW-125', p_, dest, color, [(x0, 10, 42.5), (x0, YC, 42.5), (x0, YC, zl), (t[0], YC, zl), (t[0], YC, t[2]), t])
    for i, (p_, dest, color, nombre) in enumerate((('VCC', '5V', NARANJA, '5V'), ('GND', 'G', NEGRO, 'G'))):
        x0 = 62.16 + 2.54 * i; zl = 40.4 - 0.9 * i
        t = pin('inf', k_de('inf', nombre), 'hembra')
        h('Lector microSD HW-125', p_, dest, color, [(x0, 10, 42.5), (x0, YC, 42.5), (x0, YC, zl), (t[0], YC, zl), (t[0], YC, t[2]), t])
    # Módulo de carga UNIT: SDA/SCL → sobre el tabique → fila superior, macho, desde arriba
    for i, (p_, dest, color, k) in enumerate((('SDA', 'GPIO 47', VERDE, k_de('sup', '47')), ('SCL', 'GPIO 21', AZUL, k_de('sup', '21')))):
        x0 = 67 + 2.54 * i; zt = 75.6 + 0.8 * i
        t = pin('sup', k, 'macho')
        h('Módulo de carga UNIT', p_, dest, color, [(x0, 40, UNIT[5]), (x0, YE, UNIT[5]), (x0, YE, zt), (x0, YC, zt), (t[0], YC, zt), (t[0], YC, t[2]), t])
    # STEP + / STEP − (salida a 5.0 V) → pasacables → pads 5V y GND de la placa
    for i, (p_, dest, color, xu, zz, zp, xp) in enumerate((('STEP +', '5V de la placa', NARANJA, 96, 31, 26, 85.5), ('STEP −', 'GND de la placa', NEGRO, 98, 29.8, 24.5, 87.1))):
        h('Módulo de carga UNIT', p_, dest, color, [(xu, 40, UNIT[2]), (xu, YE, UNIT[2]), (xu, YE, zz), (xu, 34, zz), (xu, 30, zz), (xu, 30, zp), (xp, 30, zp), (xp, 31, zp)])
    # MOSFET: VIN desde STEP ± (segundo cable en el mismo pad); SIG → pasacables → GPIO 9 (fila inferior, macho, desde abajo)
    h('Módulo MOSFET', 'VIN+', 'STEP + del módulo de carga', NARANJA, [(96, 40, MOSFET[5]), (96, YE, MOSFET[5]), (96, YE, UNIT[2]), (96, 40, UNIT[2])])
    h('Módulo MOSFET', 'VIN−', 'STEP − del módulo de carga', NEGRO, [(98, 40, MOSFET[5]), (98, YE, MOSFET[5]), (98, YE, UNIT[2]), (98, 40, UNIT[2])])
    t = pin('inf', k_de('inf', '9'), 'macho')
    h('Módulo MOSFET', 'SIG', 'GPIO 9', '#7c3aed', [(92, 40, MOSFET[2]), (92, YE, MOSFET[2]), (92, YE, 28), (88, YE, 28), (88, 34, 28), (88, 34, 20), (88, YC, 20), (t[0], YC, 20), (t[0], YC, t[2]), t])
    # Ventilador → salidas del MOSFET, por debajo del ventilador y encima de la batería
    for i, (p_, dest, color, xv, zc, yc) in enumerate((('+', 'MOSFET OUT+', NARANJA, 57, 40, 46), ('−', 'MOSFET OUT−', NEGRO, 55, 38.5, 47.5))):
        h('Ventilador 5 V', p_, dest, color, [(xv, yc, VENT[2]), (xv, yc, zc), (MOSFET[0] - 1, yc, zc), (MOSFET[0] - 1, 41, zc), (MOSFET[0], 41, zc)])
    # Batería → conector JST del módulo de carga
    for i, (p_, dest, color, xb, zc, xj) in enumerate((('+', 'JST + del módulo de carga', ROJO, 51, 42, 66), ('−', 'JST − del módulo de carga', NEGRO, 53, 41, 68))):
        h('Batería LiPo', p_, dest, color, [(xb, 43, BATERIA[5]), (xb, 43, zc), (xj, 43, zc), (xj, 43, UNIT[2])])
    return H_
