"""Modelo 3D de Núcleo beta en mm (x: ancho, y: fondo desde el frente, z: alto). Se muestra en cm.

Cada módulo usa sus medidas reales (placa, componentes, pines y conectores dupont) y la carcasa
son 4 piezas impresas:
  A · Base: cuerpo, cámara de sensores, puente de cables y los soportes interiores.
  B · Separador: tabique con los postes de la placa de expansión y la repisa del módulo de carga.
  C · Tapa frontal del cuerpo (4 tornillos M2.5 en las esquinas), con los soportes del frente.
  D · Tapa frontal de la cámara (4 tornillos M2 en las esquinas).
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Caja
from modelo import logo, rejillas

# ── Carcasa ─────────────────────────────────────────────────────────────
W, D, H, P = 110, 60, 80, 2.5               # cuerpo exterior y grosor de pared
TX0, TX1, TY0, TY1, TZ0, TZ1 = -34, -6, 2, 58, 4, 76   # cámara de sensores (exterior)
PUENTE = (-8, 20, 32, 2.5, 34, 46)          # paso de cables cámara → cuerpo (atraviesa ambas paredes)
TABIQUE = (P, 41, 8, W - P, 43, 72)         # pieza B: libra los postes de las esquinas al entrar por el frente
HUECO_TAB = (86, 26, 100, 34)               # pasacables del separador (x0, z0, x1, z1)
PESTANAS_B = (12, 44)                       # centros x de las pestañas del separador (tornillo M2.5 al piso)
PLACA = (15, 36, 22, 95, 37.6, 74)          # placa de expansión
ESP = (20, 22.5, 35.2, 89, 27.5, 60.8)      # ESP32-S3 (69 × 25.6 mm), encajado en la placa
YP = 18                                     # frente de los conectores dupont puestos en la placa
YC = 17                                     # plano de cables del frente
YE = 44                                     # plano de cables de energía (entre separador y módulos)
DUP = 2.54                                  # sección de un conector dupont
DUP_L = 14                                  # largo del conector dupont
PIN_L = 6                                   # pin macho fuera del plástico
TORN_C = 'M2.5 × 8'                         # tornillos de la tapa del cuerpo
TORN_D = 'M2 × 6'                           # tornillos de la tapa de la cámara
TORNILLOS = [  # (cantidad, medida, dónde)
    (4, 'M2.5 × 8', 'tapa C → postes de las esquinas de la base A'),
    (4, 'M2 × 6', 'tapa D → postes de las esquinas de la cámara (base A)'),
    (2, 'M2.5 × 6', 'pestañas del separador B → piso de la base A'),
    (4, 'M3 × 6', 'placa de expansión → postes del separador B'),
    (4, 'M2 × 5', 'pantalla OLED → postes de la tapa C'),
    (4, 'M2 × 5', 'lector microSD → postes de la tapa C'),
    (4, 'M3 × 12', 'ventilador → desde afuera, por la pared trasera de la base A'),
]

VENTANA = (20, 50, 44, 64)                  # ventana de la pantalla en la tapa C (x0, z0, x1, z1)
RGB_C = (71.25, 54.5)                       # centro del LED RGB (barreno con chaflán en la tapa C)
LED_HUECO, LED_CHAFLAN = 5.2, 9             # Ø del barreno del LED y Ø exterior del chaflán a 45°
Y_RGB = 11.1                                # cara del LED de la placa KY-016: la punta del LED toca la tapa
BUZ_C = (87.5, 36.25)                       # centro del buzzer / rejilla
BATERIA = (6, 46, P, 56, 52, 36.5)          # LiPo 603450 de pie; cables por el lado derecho
VENT = (26, 47.5, 44, 56, 57.5, 74)         # ventilador 3010 atornillado a la pared trasera
VENT_C = ((VENT[0] + VENT[3]) / 2, (VENT[2] + VENT[5]) / 2)
UNIT = (61.5, 45, 51, 107, 52, 70)          # módulo de carga (envolvente con componentes)
USB_CARGA = (46, 55.5, 50.5, 65.5)          # hueco en la pared derecha (y0, z0, y1, z1)
USB_ESP = (19, 44, 31, 52)                  # hueco del USB del ESP en la pared derecha (y0, z0, y1, z1)

# ── Filas de la placa de expansión ─────────────────────────────────────
ARRIBA = ['G', 'TX', 'RX', '1', '2', '42', '41', '40', '39', '38', '37', '36', '35', '0', '45', '48', '47', '21', '20', '19', 'G', 'G']
ABAJO = ['3V', '3V', 'RST', '4', '5', '6', '7', '15', '16', '17', '18', '8', '3', '46', '9', '10', '11', '12', '13', '14', '5V', 'G']
FILA = {'sup': ['3V3', 'GND'] + ARRIBA + ['GND', '3V3'], 'inf': ['3V3', 'GND'] + ABAJO + ['GND', '3V3']}
ZF = {('sup', 'macho'): 66.25, ('sup', 'hembra'): 62.75, ('inf', 'macho'): 30.25, ('inf', 'hembra'): 33.75}
def xk(k): return 23.25 + 2.54 * k
def pin(fila, k, tipo):
    """Punto donde llega el cable: frente del conector dupont puesto en ese pin."""
    return (xk(k), YP, ZF[(fila, tipo)])
def k_de(fila, nombre, n=0):
    return [i for i, p in enumerate(FILA[fila]) if p == nombre][n]

# ── Calcomanías ─────────────────────────────────────────────────────────
def frente_tapa(w, h):
    x0, z0, x1, z1 = VENTANA
    rx, rz = RGB_C; bx, bz = BUZ_C
    s = [f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="5" fill="none" stroke="#94a3b8" stroke-width="0.4"/>',
         f'<rect x="{x0}" y="{H-z1}" width="{x1-x0}" height="{z1-z0}" rx="1.5" fill="#0b1220" stroke="#334155" stroke-width="0.8"/>',
         f'<text x="{x0+2}" y="{H-z1+4.5}" font-size="2.6" fill="#7dd3fc" font-weight="600">NC-0501 · Wi-Fi</text>',
         f'<text x="{x0+2}" y="{H-z1+9}" font-size="3.6" fill="#e0f2fe" font-weight="700">23.4°C 48%</text>',
         f'<text x="{x0+2}" y="{H-z1+12.6}" font-size="2.6" fill="#bae6fd">eCO2 412 ppm</text>',
         f'<circle cx="{rx}" cy="{H-rz}" r="{LED_CHAFLAN/2}" fill="#cfd6df" stroke="#94a3b8" stroke-width="0.4"/>',
         f'<circle cx="{rx}" cy="{H-rz}" r="{(LED_CHAFLAN+LED_HUECO)/4}" fill="none" stroke="#b8c1cc" stroke-width="0.5"/>',
         f'<circle cx="{rx}" cy="{H-rz}" r="{LED_HUECO/2}" fill="#334155"/>',
         f'<circle cx="{rx}" cy="{H-rz}" r="2.3" fill="#ecfdf5" stroke="#86efac" stroke-width="0.4"/>',
         f'<circle cx="{rx-0.7}" cy="{H-rz-0.8}" r="0.7" fill="#ffffff"/>',
         f'<text x="{rx}" y="{H-rz+8.3}" font-size="2.4" text-anchor="middle" fill="#64748b" font-weight="700">ESTADO</text>']
    for i in range(4):
        for j in range(4):
            s.append(f'<circle cx="{bx-5.4+i*3.6:.1f}" cy="{H-bz-5.4+j*3.6:.1f}" r="1" fill="#475569"/>')
    s.append(logo(6, 54, 38))
    s.append('<rect x="47" y="69" width="14" height="5.5" rx="2.75" fill="#7c3aed"/><text x="54" y="73" font-size="3.4" font-weight="800" fill="#fff" text-anchor="middle">BETA</text>')
    for cx, cy in ((5, 5), (w-5, 5), (5, h-5), (w-5, h-5)):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="2.3" fill="#cbd5e1" stroke="#64748b" stroke-width="0.4"/><circle cx="{cx}" cy="{cy}" r="1.4" fill="#475569"/>')
    return ''.join(s)

def tapa_camara(w, h):
    s = rejillas(w, h, margen=6)
    for cx, cy in ((4, 4), (w-4, 4), (4, h-4), (w-4, h-4)):
        s += f'<circle cx="{cx}" cy="{cy}" r="1.9" fill="#cbd5e1" stroke="#64748b" stroke-width="0.4"/><circle cx="{cx}" cy="{cy}" r="1.1" fill="#475569"/>'
    return s

def fondo_inferior(w, h):
    return ('<rect x="50.5" y="5.6" width="15" height="3" rx="1" fill="#111827"/>'
            '<text x="58" y="12.5" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">microSD</text>')

def trasera(w, h):  # u = 110 - x, v = 80 - z
    cu, cv = W - VENT_C[0], H - VENT_C[1]
    s = [f'<circle cx="{cu}" cy="{cv}" r="14" fill="#1f2937"/>']
    for r in (12, 8.5, 5):
        s.append(f'<circle cx="{cu}" cy="{cv}" r="{r}" fill="none" stroke="#94a3b8" stroke-width="1"/>')
    s.append(f'<line x1="{cu-14}" y1="{cv}" x2="{cu+14}" y2="{cv}" stroke="#94a3b8" stroke-width="1"/><line x1="{cu}" y1="{cv-14}" x2="{cu}" y2="{cv+14}" stroke="#94a3b8" stroke-width="1"/>')
    for du in (-12, 12):
        for dv in (-12, 12):
            s.append(f'<circle cx="{cu+du}" cy="{cv+dv}" r="1.7" fill="#cbd5e1" stroke="#475569" stroke-width="0.5"/>')
    s.append(f'<text x="{cu}" y="{cv+19.5}" font-size="2.8" text-anchor="middle" fill="#334155" font-weight="600">salida de aire · 4 tornillos M3</text>')
    for u in (25, 95):
        s.append(f'<circle cx="{u}" cy="62" r="2.6" fill="#1f2937"/><rect x="{u-1.1}" y="62" width="2.2" height="6" rx="1.1" fill="#1f2937"/>')
    s.append('<text x="60" y="70" font-size="2.8" text-anchor="middle" fill="#334155" font-weight="600">ranuras para colgar</text>')
    return ''.join(s)

def derecha(w, h):  # u = y, v = 80 - z
    s = ''
    for (y0, z0, y1, z1), t in ((USB_ESP, 'USB del ESP'), (USB_CARGA, 'USB-C carga')):
        s += (f'<rect x="{y0}" y="{H-z1}" width="{y1-y0}" height="{z1-z0}" rx="1.5" fill="#111827"/>'
              f'<text x="{(y0+y1)/2}" y="{H-z0+4.5}" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">{t}</text>')
    return s

def hueco(u0, v0, u1, v1, texto=None):
    def f(w, h):
        s = f'<rect x="{u0}" y="{v0}" width="{u1-u0}" height="{v1-v0}" rx="1" fill="#1e293b"/>'
        if texto: s += f'<text x="{(u0+u1)/2}" y="{v1+3.4}" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">{texto}</text>'
        return s
    return f

def tabique_frente(w, h):  # u = x - 2.5, v = 72 - z
    s = rejillas(w, 22, margen=3, paso=4)
    u0, z0, u1, z1 = HUECO_TAB
    s += f'<rect x="{u0-P}" y="{TABIQUE[5]-z1}" width="{u1-u0}" height="{z1-z0}" rx="1.5" fill="#1e293b"/>'
    s += f'<text x="{(u0+u1)/2-P}" y="{TABIQUE[5]-z0+3.5}" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">pasacables</text>'
    return s
def tabique_atras(w, h):  # u = 107.5 - x, v = 72 - z
    s = rejillas(w, 22, margen=3, paso=4)
    u0, z0, u1, z1 = HUECO_TAB
    s += f'<rect x="{W-P-u1}" y="{TABIQUE[5]-z1}" width="{u1-u0}" height="{z1-z0}" rx="1.5" fill="#1e293b"/>'
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
    s = ['<rect x="2.5" y="5" width="18" height="18" rx="0.8" fill="#c7cbd1" stroke="#9ca3af" stroke-width="0.3"/>',
         '<path d="M2 7 h-1.5 v2 h1.5 v2 h-1.5 v2 h1.5 v2 h-1.5 v2 h1.5" fill="none" stroke="#d4a017" stroke-width="0.4"/>',
         '<text x="11.5" y="15" font-size="2.4" text-anchor="middle" fill="#374151" font-weight="700">ESP32-S3</text>',
         '<text x="42" y="15.5" font-size="3.4" text-anchor="middle" fill="#f3f4f6" font-weight="800">lonely binary</text>']
    for k in range(22):
        u = 8 + k * 2.54
        s.append(f'<circle cx="{u:.2f}" cy="1.3" r="0.7" fill="#d4a017"/><circle cx="{u:.2f}" cy="{h-1.3}" r="0.7" fill="#d4a017"/>')
    s.append(f'<rect x="{w-4}" y="6" width="4" height="4.5" rx="0.8" fill="#c0c4cc"/><rect x="{w-4}" y="17.5" width="4" height="4.5" rx="0.8" fill="#c0c4cc"/>')
    return ''.join(s)

def pcb(texto, color_txt='#f8fafc', tam=2.6, extra=''):
    return lambda w, h: extra + f'<text x="{w/2:.1f}" y="{h/2+tam/3:.1f}" font-size="{tam}" text-anchor="middle" fill="{color_txt}" font-weight="700">{texto}</text>'
def oled_frente(w, h):
    return ('<rect x="2.5" y="2.5" width="21.7" height="10.9" fill="#020617"/><text x="4" y="7.5" font-size="3" fill="#7dd3fc" font-weight="700">OLED</text>'
            '<text x="4" y="11.5" font-size="2.2" fill="#7dd3fc">0.96″ · 0x3C</text>')
def bateria_frente(w, h):
    return (f'<rect x="3" y="{h/2-9}" width="{w-6}" height="18" rx="1.5" fill="#1d4ed8" fill-opacity="0.85"/>'
            f'<text x="{w/2}" y="{h/2-1.5}" font-size="4" text-anchor="middle" fill="#fff" font-weight="800">LiPo 3.7 V</text>'
            f'<text x="{w/2}" y="{h/2+4.5}" font-size="3.2" text-anchor="middle" fill="#dbeafe">1000 mAh · 603450</text>')
def ventilador_cara(w, h):
    c = w / 2
    s = [f'<circle cx="{c}" cy="{h/2}" r="{c-1.5}" fill="#0f172a"/>', f'<circle cx="{c}" cy="{h/2}" r="5" fill="#334155"/>']
    for k in range(5):
        s.append(f'<path d="M{c} {h/2} q 6 -9.5 11 -10.5" stroke="#64748b" stroke-width="2.4" fill="none" transform="rotate({k*72} {c} {h/2})"/>')
    for cx, cy in ((3, 3), (w-3, 3), (3, h-3), (w-3, h-3)):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="1.6" fill="#e5e7eb"/>')
    return ''.join(s)
def unit_cara(w, h):
    return (f'<text x="{w/2}" y="{h/2}" font-size="2.6" text-anchor="middle" fill="#f8fafc" font-weight="700">UNIT LiPo Boost · I2C</text>'
            f'<text x="{w/2}" y="{h/2+4}" font-size="2" text-anchor="middle" fill="#cbd5e1">TP4056 · MT3608 · MAX17048</text>')
def dht_cara(w, h):
    s = [f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="1" fill="#f1f5f9"/>']
    for i in range(4):
        for j in range(6):
            s.append(f'<rect x="{2.2+i*3.2:.1f}" y="{2.5+j*3.6:.1f}" width="2" height="2.4" fill="#94a3b8"/>')
    return ''.join(s)
def ccs_cara(w, h):
    return f'<text x="{w/2}" y="{h-2}" font-size="2.4" text-anchor="middle" fill="#ede9fe" font-weight="700">CJMCU-811</text>'
def buzzer_cara(w, h):
    return f'<circle cx="{w/2}" cy="{h/2}" r="{w/2-0.4}" fill="#1f2937" stroke="#4b5563" stroke-width="0.6"/><circle cx="{w/2}" cy="{h/2}" r="1.2" fill="#0b0b0b"/>'

# ── Conectores ──────────────────────────────────────────────────────────
NEGRO_DUP, PLASTICO, METAL = '#1f2937', '#111111', '#d4a017'
def dupont(eje, centro, desde, signo):
    """Conector dupont hembra (DUP_L) puesto sobre un pin, a lo largo de `eje` desde `desde` en sentido
    `signo`. Devuelve sus cajas y el punto donde sale el cable."""
    i = 'xyz'.index(eje); c = list(centro)
    lo, hi = [0, 0, 0], [0, 0, 0]
    for j in range(3):
        if j == i: lo[j], hi[j] = min(desde, desde + signo * DUP_L), max(desde, desde + signo * DUP_L)
        else: lo[j], hi[j] = c[j] - DUP / 2, c[j] + DUP / 2
    salida = list(c); salida[i] = desde + signo * DUP_L
    return [Caja(*lo, *hi, NEGRO_DUP)], tuple(salida)

# ── Piezas ──────────────────────────────────────────────────────────────
class Pieza:
    def __init__(self, nombre, zona, cajas, nota, dims, ficha, salidas=None):
        self.nombre, self.zona, self.cajas, self.nota = nombre, zona, cajas, nota
        self.dims, self.ficha = dims, ficha                  # medidas reales (mm) y renglones de la ficha
        self.salidas = salidas or {}                         # pin → punto donde sale el cable del conector
        self.principal = cajas[0]

def _header(cajas, eje, puntos, desde, signo, nombres):
    salidas = {}
    for p_, nombre in zip(puntos, nombres):
        c, s = dupont(eje, p_, desde, signo)
        cajas += c; salidas[nombre] = s
    return salidas

def piezas():
    L = []
    # 1 · CCS811 (CJMCU-811): placa horizontal arriba de la cámara, sensor hacia la rejilla superior,
    #     8 pines rectos hacia abajo en el borde delantero; se usan VCC, GND, SCL y SDA.
    c = [Caja(-30.5, 40, 68, -9.5, 55, 69.6, '#6d28d9', {'top': ccs_cara}),
         Caja(-21.4, 46, 69.6, -18.7, 50, 70.7, '#111827'),
         Caja(-30.16, 40, 65.5, -9.84, 42.54, 68, PLASTICO)]
    xs = [-28.89, -26.35, -23.81, -21.27]
    sal = _header(c, 'z', [(x, 41.27, 0) for x in xs], 65.5, -1, ['VCC', 'GND', 'SCL', 'SDA'])
    L.append(Pieza('CCS811', 'sensores', c, 'Arriba (lado 19-21), en rieles; su calor sale por la rejilla de arriba',
                   (21, 15, 3.1), [('Placa', '2.1 × 1.5 × 0.16 cm (CJMCU-811)'), ('Alto con sensor', '0.31 cm'),
                                   ('Pines', '8 rectos hacia abajo (usa 4) + dupont: 2 cm bajo la placa'),
                                   ('Sujeción', 'rieles con ranura de 0.16 cm; entra deslizando desde el frente'),
                                   ('Fuente', 'tienda (20–21 × 15 mm): verificar')], sal))
    # 2 · DHT22 en placa: de pie al frente de la cámara, sensor hacia la rejilla izquierda, pines a 90° hacia arriba.
    c = [Caja(-19.6, 6, 6, -18, 21.5, 41, '#111827'),
         Caja(-27.3, 6.2, 14, -19.6, 21.3, 39, '#f1f5f9', {'left': dht_cara}),
         Caja(-18, 9.94, 38.5, -15.46, 17.56, 41, PLASTICO)]
    ys = (11.21, 13.75, 16.29)
    sal = _header(c, 'z', [(-16.73, y, 0) for y in ys], 41 + PIN_L, 1, ['+', 'out', '−'])
    c += [Caja(-17.05, y - 0.32, 41, -16.41, y + 0.32, 41 + PIN_L, METAL) for y in ys]
    L.append(Pieza('DHT22', 'sensores', c, 'Abajo, de pie en su riel; pines hacia arriba, lejos del calor del CCS811',
                   (15.5, 35, 9.3), [('Placa', '1.55 × 3.5 × 0.16 cm'), ('Sensor', '1.51 × 2.5 × 0.77 cm (AM2302)'),
                                     ('Pines', '3 a 90° hacia arriba + dupont: 2 cm sobre la placa'),
                                     ('Sujeción', 'riel en el piso + tope ranurado; la tapa D lo presiona'),
                                     ('Fuente', 'hoja de datos (sensor) · placa: verificar')], sal))
    # 3 · Pantalla OLED 0.96″ SSD1306: vidrio contra la ventana, 4 tornillos M2 a postes de la tapa C.
    ox = (VENTANA[0] + VENTANA[2]) / 2
    c = [Caja(ox - 13.65, 4.0, 43.85, ox + 13.65, 5.6, 71.65, '#1e3a8a'),
         Caja(ox - 13.35, P, 47.35, ox + 13.35, 4.0, 66.65, '#020617', {'front': oled_frente}),
         Caja(ox - 5.08, 5.6, 68.88, ox + 5.08, 8.1, 71.42, PLASTICO)]
    sal = _header(c, 'y', [(ox + d, 0, 70.15) for d in (-3.81, -1.27, 1.27, 3.81)], 8.1, 1, ['GND', 'VCC', 'SCL', 'SDA'])
    L.append(Pieza('Pantalla OLED', 'frente', c, '4 tornillos M2 × 5 a la tapa; jumpers de 10 cm',
                   (27.3, 27.8, 3.1), [('Placa', '2.73 × 2.78 × 0.16 cm'), ('Vidrio', '2.67 × 1.93 × 0.15 cm, área visible 2.17 × 1.09'),
                                       ('Pines', '4 rectos hacia atrás + dupont: 1.65 cm detrás de la placa'),
                                       ('Sujeción', '4 postes de 0.3 × 0.15 cm en la tapa C, barrenos M2 a 2.33 × 2.38 cm'),
                                       ('Fuente', 'clon común 27.3 × 27.8 mm: verificar')], sal))
    # 4 · LED RGB KY-016: la punta del LED de 5 mm apoya detrás del barreno de la tapa, pines a 90° hacia la izquierda.
    rx, rz = RGB_C; yl = Y_RGB
    led = Caja(rx - 2.5, P, rz - 2.5, rx + 2.5, yl, rz + 2.5, '#ecfdf5')
    c = [Caja(rx - 9.25, yl, rz - 7.5, rx + 9.25, yl + 1.6, rz + 7.5, '#18181b', {'front': pcb('KY-016')}),
         led,
         Caja(rx - 9.25, yl - 2.42, rz - 5.08, rx - 6.75, yl, rz + 5.08, PLASTICO)]
    zs = [rz + 3.81, rz + 1.27, rz - 1.27, rz - 3.81]
    sal = _header(c, 'x', [(0, yl - 1.15, z) for z in zs], rx - 9.25 - PIN_L, -1, ['−', 'B', 'G', 'R'])
    c += [Caja(rx - 9.25 - PIN_L, yl - 1.47, z - 0.32, rx - 9.25, yl - 0.83, z + 0.32, METAL) for z in zs]
    L.append(Pieza('LED RGB KY-016', 'frente', c, 'En dos guías de la tapa; la punta del LED apoya en su barreno; jumpers de 10 cm',
                   (18.5, 15, 10.2), [('Placa', '1.85 × 1.5 × 0.16 cm'), ('LED', 'Ø 0.5 cm, 0.86 cm de alto'),
                                      ('Pines', '4 a 90° hacia la izquierda + dupont: 2 cm fuera de la placa'),
                                      ('Sujeción', '2 guías en U (ranura 0.16 cm) en la tapa C; LED en barreno Ø 0.52 con chaflán'),
                                      ('Fuente', 'tienda (18.5 × 15 mm; hay versiones de 10 × 10): verificar')], sal))
    # 5 · Buzzer KY-012: buzzer contra la rejilla, pines a 90° hacia abajo.
    bx, bz = BUZ_C
    c = [Caja(bx - 7.5, 12, bz - 9.25, bx + 7.5, 13.6, bz + 9.25, '#18181b', {'front': pcb('KY-012')}),
         Caja(bx - 6, P, bz - 6, bx + 6, 12, bz + 6, '#111827', {'front': buzzer_cara}),
         Caja(bx - 3.81, 9.46, bz - 9.25, bx + 3.81, 12, bz - 6.75, PLASTICO)]
    xs = [bx - 2.54, bx, bx + 2.54]
    sal = _header(c, 'z', [(x, 10.73, 0) for x in xs], bz - 9.25 - PIN_L, -1, ['S', '+', '−'])
    c += [Caja(x - 0.32, 10.41, bz - 9.25 - PIN_L, x + 0.32, 11.05, bz - 9.25, METAL) for x in xs]
    L.append(Pieza('Buzzer KY-012', 'frente', c, 'En dos guías de la tapa, contra la rejilla; jumpers de 10 cm',
                   (15, 18.5, 11.1), [('Placa', '1.5 × 1.85 × 0.16 cm'), ('Buzzer', 'Ø 1.2 × 0.95 cm (activo)'),
                                      ('Pines', '3 a 90° hacia abajo + dupont: 2 cm bajo la placa'),
                                      ('Sujeción', '2 guías en U (ranura 0.16 cm) en la tapa C'),
                                      ('Fuente', 'tienda (18.5 × 15 mm; Joy-it 15 × 25): verificar')], sal))
    # 6 · Lector microSD HW-125: de pie, ranura de la tarjeta por el piso, pines a 90° hacia arriba.
    c = [Caja(46, 4.5, 3.5, 70, 6.1, 45.5, '#1e40af', {'front': pcb('HW-125')}),
         Caja(51, 6.1, 3.5, 65, 8.0, 18.5, '#cbd5e1'),
         Caja(52, 6.1, 25, 64, 7.8, 33, '#111827'),
         Caja(50.38, 6.1, 43, 65.62, 8.64, 45.5, PLASTICO)]
    xs = [51.65 + 2.54 * i for i in range(6)]
    sal = _header(c, 'z', [(x, 7.37, 0) for x in xs], 45.5 + PIN_L, 1, ['CS', 'SCK', 'MOSI', 'MISO', 'VCC', 'GND'])
    c += [Caja(x - 0.32, 7.05, 45.5, x + 0.32, 7.69, 45.5 + PIN_L, METAL) for x in xs]
    L.append(Pieza('Lector microSD HW-125', 'frente', c, '4 tornillos M2 × 5 a la tapa; tarjeta por el piso; jumpers de 10 cm',
                   (24, 42, 4.1), [('Placa', '2.4 × 4.2 × 0.16 cm'), ('Zócalo', '1.4 × 1.5 × 0.19 cm, abajo'),
                                   ('Pines', '6 a 90° hacia arriba + dupont: 2 cm sobre la placa'),
                                   ('Sujeción', '4 postes de 0.4 × 0.2 cm en la tapa C, barrenos M2 a 1.9 × 3.7 cm'),
                                   ('Fuente', 'clon común 42 × 24 mm, barrenos M2: verificar')], sal))
    # 7 · Placa de expansión
    filas = []
    for fila, zm, zh in (('sup', 65, 61.5), ('inf', 29, 32.5)):
        filas += [Caja(22, 33.5, zm, 88.04, 36, zm + 2.5, '#f8fafc', {'front': tira('#f8fafc', '#111', pines=True)}),
                  Caja(22, 27.5, zh, 88.04, 36, zh + 2.5, '#facc15', {'front': tira('#facc15', '#3f3f46')})]
    L.append(Pieza('Placa de expansión', 'centro', [Caja(*PLACA, '#0b0b0b', {'front': placa_frente})] + filas +
                   [Caja(22, 27.5, 35.4, 88, 36, 37.8, '#18181b'), Caja(22, 27.5, 58.2, 88, 36, 60.6, '#18181b')],
                   '4 tornillos M3 × 6 a los postes del separador B', (80, 52, 10.1),
                   [('Placa', '8 × 5.2 × 0.16 cm'), ('Alto con zócalos', '0.85 cm (hembra) / 0.25 cm (macho)'),
                    ('Pines', 'por GPIO un macho y un hembra; 3V3 y GND en los extremos'),
                    ('Sujeción', '4 postes M3 de 0.34 cm en el separador B'), ('Fuente', 'estimado de la foto: verificar')]))
    L.append(Pieza('ESP32-S3 (girado)', 'centro', [Caja(*ESP, '#111111', {'front': esp_frente})],
                   'Antena a la izquierda, USB a la derecha; pines 19-21 arriba', (69, 25.6, 5),
                   [('Placa', '6.9 × 2.56 × 0.16 cm (DevKitC-1, 2 USB-C)'), ('Filas de pines', '22 + 22 a 0.254 cm'),
                    ('Sujeción', 'encajado en los zócalos de la placa de expansión'),
                    ('USB', 'abertura de 1.2 × 0.8 cm en la pared derecha'), ('Fuente', 'Espressif / tienda: verificar')]))
    # 9 · Módulo de carga UNIT LiPo Boost & I2C (45.5 × 19 mm)
    x0, y0, z0, x1, y1, z1 = UNIT
    c = [Caja(x0, y0, z0, x1, y0 + 1.6, z1, '#18181b', {'front': unit_cara}),
         Caja(70, y0 + 1.6, 53, 83, 50, 68, '#27272a'),
         Caja(85, y0 + 1.6, 58, 91, 51.5, 64, '#2563eb'),
         Caja(99.5, y0 + 1.6, 56, x1, 49.9, 65, '#c0c4cc'),
         Caja(63, y0 + 1.6, 53, 69, 51.1, 59, '#f8fafc')]
    L.append(Pieza('Módulo de carga UNIT', 'energia', c, 'En la repisa del separador; USB-C de carga por la pared derecha',
                   (45.5, 19, 7), [('Placa', '4.55 × 1.9 × 0.16 cm'), ('Alto con componentes', '0.7 cm (USB-C, JST, potenciómetro)'),
                                   ('Cables', 'soldados: SDA, SCL, STEP +, STEP − (sin dupont)'),
                                   ('Sujeción', 'repisa con ranura + gancho superior en el separador B'),
                                   ('Fuente', 'UNIT Electronics (45.5 × 19 mm)')]))
    # 10 · Batería LiPo 603450
    bx0, by0, bz0, bx1, by1, bz1 = BATERIA
    L.append(Pieza('Batería LiPo', 'energia', [Caja(bx0, by0, bz0, bx1 - 4, by1, bz1, '#c9ced6', {'front': bateria_frente, 'back': bateria_frente}),
                                               Caja(bx1 - 4, by0, bz0, bx1, by1, bz1, '#e5b54a')],
                   'De pie en su cuna, con cinta velcro; cables JST por la derecha', (50, 6, 34),
                   [('Celda', '5 × 3.4 × 0.6 cm (603450, 1000 mAh, 3.7 V)'), ('Cable', 'JST-PH 2.0 de 2 hilos, ~7 cm'),
                    ('Sujeción', 'cuna de 5.24 × 0.84 × 1.2 cm en la base A + cinta velcro'),
                    ('Fuente', 'formato estándar 603450: verificar el grosor')]))
    # 11 · Ventilador 3010
    L.append(Pieza('Ventilador 5 V', 'energia', [Caja(*VENT, '#111827', {'front': ventilador_cara, 'back': ventilador_cara})],
                   '4 tornillos M3 × 12 desde afuera; sale por la rejilla trasera', (30, 10, 30),
                   [('Cuerpo', '3 × 3 × 1 cm (3010, 5 V)'), ('Barrenos', '4 a 2.4 cm entre centros'),
                    ('Cable', '2 hilos al STEP ± del módulo de carga'),
                    ('Sujeción', '4 tornillos M3 × 12 autorroscantes por la pared trasera'),
                    ('Fuente', 'formato 3010 (barrenos a 24 mm)')]))
    for k, p in enumerate(L): p.num = k + 1
    return L

# ── Soportes (cada caja lleva la pieza impresa a la que pertenece) ──────
def _s(parte, nombre, *b, color='#d5dbe3'):
    c = Caja(*b, color); c.parte = parte; c.soporte = nombre; return c

def guia_u(parte, nombre, x0, x1, y_pcb0, y_pcb1, z_borde, hacia, prof=2.5, labio=1.3, y_frente=P):
    """Guía en U a lo largo de x para el borde horizontal de una placa (borde en z_borde; `hacia` = +1 si la
    guía queda arriba del borde). La placa entra 1 mm en la ranura."""
    za, zb = (z_borde - 1, z_borde + prof) if hacia > 0 else (z_borde - prof, z_borde + 1)
    zt0, zt1 = (z_borde, zb) if hacia > 0 else (za, z_borde)
    return [_s(parte, nombre, x0, y_frente, za, x1, y_pcb0, zb),
            _s(parte, nombre, x0, y_pcb1, za, x1, y_pcb1 + labio, zb),
            _s(parte, nombre, x0, y_pcb0, zt0, x1, y_pcb1, zt1)]

def guia_v(parte, nombre, x_borde, hacia, z0, z1, y_pcb0, y_pcb1, prof=2.5, labio=1.4, y_frente=P):
    """Guía en U vertical para el borde lateral de una placa (`hacia` = +1 si la guía queda a la derecha)."""
    xa, xb = (x_borde - 1, x_borde + prof) if hacia > 0 else (x_borde - prof, x_borde + 1)
    xt0, xt1 = (x_borde, xb) if hacia > 0 else (xa, x_borde)
    return [_s(parte, nombre, xa, y_frente, z0, xb, y_pcb0, z1),
            _s(parte, nombre, xa, y_pcb1, z0, xb, y_pcb1 + labio, z1),
            _s(parte, nombre, xt0, y_pcb0, z0, xt1, y_pcb1, z1)]

def esqueleto_extra():
    """Soportes y detalles internos de las 4 piezas impresas."""
    c = []
    # A · postes de la tapa C (4 esquinas, rosca para M2.5)
    for x0 in (P, W - P - 5):
        for z0 in (P, H - P - 5):
            c.append(_s('A', 'Postes de la tapa', x0, P, z0, x0 + 5, 12, z0 + 5))
    # B · separador (posición 4 de la lista)
    t = Caja(*TABIQUE, '#e2e8f0', {'front': tabique_frente, 'back': tabique_atras}); t.parte = 'B'; t.soporte = 'Separador'
    c.append(t)
    for x in (17, 90):
        for z in (24, 69):
            c.append(_s('B', 'Postes de la placa', x, PLACA[4], z, x + 3, TABIQUE[1], z + 3))
    # B · pestañas al piso (tornillos M2.5) y A · topes del separador en las paredes y el piso
    for x in PESTANAS_B:
        c += [_s('B', 'Patas del separador', x - 4, TABIQUE[1], P, x + 4, TABIQUE[4], TABIQUE[2]),
              _s('B', 'Patas del separador', x - 4, 37.8, P, x + 4, TABIQUE[1], P + 1.6),
              _s('A', 'Topes del separador', x - 4, TABIQUE[4], P, x + 4, TABIQUE[4] + 1.5, 6)]
    c += [_s('A', 'Topes del separador', P, TABIQUE[4], 10, P + 1.5, TABIQUE[4] + 1.5, 70),
          _s('A', 'Topes del separador', W - P - 1.5, TABIQUE[4], 10, W - P, TABIQUE[4] + 1.5, 44)]
    # B · repisa y gancho del módulo de carga
    x0, y0, z0, x1, y1, z1 = UNIT
    c += [_s('B', 'Repisa del módulo de carga', 63, TABIQUE[4], z0 - 2.5, 90, y0 + 2.5, z0),
          _s('B', 'Repisa del módulo de carga', 63, TABIQUE[4], z0, 90, y0, z0 + 2),
          _s('B', 'Repisa del módulo de carga', 63, y0 + 1.6, z0, 90, y0 + 2.5, z0 + 1.5),
          _s('B', 'Gancho del módulo de carga', 74, TABIQUE[4], z1, 84, y0 + 2.5, z1 + 2),
          _s('B', 'Gancho del módulo de carga', 74, y0 + 1.6, z1 - 1.5, 84, y0 + 2.5, z1)]
    # A · cuna de la batería (paredes de 1.2 mm, 12 mm de alto; la derecha más baja por el cable)
    bx0, by0, bz0, bx1, by1, bz1 = BATERIA
    c += [_s('A', 'Cuna de la batería', bx0 - 1.2, by0 - 1.2, P, bx1 + 1.2, by0, P + 12),
          _s('A', 'Cuna de la batería', bx0 - 1.2, by1, P, bx1 + 1.2, by1 + 1.2, P + 12),
          _s('A', 'Cuna de la batería', bx0 - 1.2, by0, P, bx0, by1, P + 12),
          _s('A', 'Cuna de la batería', bx1, by0, P, bx1 + 1.2, by1, P + 8)]
    # A · cámara: riel del piso y tope ranurado del DHT22
    c += [_s('A', 'Riel del DHT22', -21.5, 5, 6, -19.6, 21.5, 9),
          _s('A', 'Riel del DHT22', -18, 5, 6, -16.1, 21.5, 9),
          _s('A', 'Tope del DHT22', -21.5, 21.5, 6, -19.6, 23.5, 36),
          _s('A', 'Tope del DHT22', -18, 21.5, 6, -16.1, 23.5, 36),
          _s('A', 'Tope del DHT22', -19.6, 22.3, 6, -18, 23.5, 36)]
    # A · cámara: rieles del CCS811 (ranura a la altura de la placa, hasta la pared trasera)
    yb = TY1 - 2
    c += [_s('A', 'Rieles del CCS811', -32, 43, 66, -29.5, yb, 68), _s('A', 'Rieles del CCS811', -32, 38, 69.6, -29.5, yb, 71.5),
          _s('A', 'Rieles del CCS811', -32, 43, 68, -30.5, yb, 69.6),
          _s('A', 'Rieles del CCS811', -10.5, 43, 66, -8, yb, 68), _s('A', 'Rieles del CCS811', -10.5, 38, 69.6, -8, yb, 71.5),
          _s('A', 'Rieles del CCS811', -9.5, 43, 68, -8, yb, 69.6)]
    # A · postes de la tapa D (4 esquinas de la cámara, rosca para M2)
    for x0 in (TX0 + 2, TX1 - 2 - 4):
        for z0 in (TZ0 + 2, TZ1 - 2 - 4):
            c.append(_s('A', 'Postes de la tapa de la cámara', x0, TY0 + 2, z0, x0 + 4, TY0 + 7, z0 + 4))
    # C · tapa del cuerpo: postes de la OLED (M2), guías del LED RGB y del buzzer, postes del microSD (M2)
    ox = (VENTANA[0] + VENTANA[2]) / 2
    for dx in (-11.65, 11.65):
        for zc in (45.85, 69.65):
            c.append(_s('C', 'Postes de la pantalla', ox + dx - 1.5, P, zc - 1.5, ox + dx + 1.5, 4.0, zc + 1.5))
    rx, rz = RGB_C
    c += guia_u('C', 'Guías del LED RGB', rx - 1, rx + 5, Y_RGB, Y_RGB + 1.6, rz - 7.5, -1)
    c += guia_u('C', 'Guías del LED RGB', rx - 1, rx + 5, Y_RGB, Y_RGB + 1.6, rz + 7.5, +1)
    bx, bz = BUZ_C
    c += guia_v('C', 'Guías del buzzer', bx - 7.5, -1, bz - 5.5, bz + 9.25, 12, 13.6)
    c += guia_v('C', 'Guías del buzzer', bx + 7.5, +1, bz - 5.5, bz + 9.25, 12, 13.6)
    for x in (48.5, 67.5):
        for z in (6, 43):
            c.append(_s('C', 'Postes del microSD', x - 2, P, z - 2, x + 2, 4.5, z + 2))
    # D · tapa de la cámara: pestaña que deja fijo al DHT22
    c.append(_s('D', 'Pestaña de la tapa de la cámara', -21.5, TY0 + 2, 10, -16.1, 5.8, 30))
    return c

def carcasa(quitar=()):
    gris, torre = '#e9edf2', '#dde3ea'
    q = set(quitar)
    def pz(caja, parte): caja.parte = parte; return caja
    cuerpo = [pz(Caja(0, 0, 0, W, D, P, gris, {'bottom': fondo_inferior}), 'A')]
    if 'atras' not in q: cuerpo.append(pz(Caja(0, D - P, P, W, D, H - P, gris, {'back': trasera}), 'A'))
    if 'izquierda' not in q: cuerpo.append(pz(Caja(0, P, P, P, D - P, H - P, gris, {'right': hueco(PUENTE[1], H - PUENTE[5], PUENTE[4], H - PUENTE[2], 'paso de cables'), 'left': hueco(D - PUENTE[4], H - PUENTE[5], D - PUENTE[1], H - PUENTE[2])}), 'A'))
    if 'derecha' not in q: cuerpo.append(pz(Caja(W - P, P, P, W, D - P, H - P, gris, {'right': derecha}), 'A'))
    if 'techo' not in q: cuerpo.append(pz(Caja(0, P, H - P, W, D, H, gris), 'A'))
    if 'frente' not in q: cuerpo.append(pz(Caja(0, 0, 0, W, P, H, '#eef1f5', {'front': frente_tapa}), 'C'))
    camara = [pz(Caja(TX0, TY0 + 2, TZ0, TX1, TY1, TZ0 + 2, torre), 'A')]
    if 'atras' not in q: camara.append(pz(Caja(TX0, TY1 - 2, TZ0 + 2, TX1, TY1, TZ1, torre, {'back': rejillas}), 'A'))
    if 'izquierda' not in q: camara.append(pz(Caja(TX0, TY0 + 2, TZ0 + 2, TX0 + 2, TY1 - 2, TZ1, torre, {'left': rejillas}), 'A'))
    if 'derecha' not in q: camara.append(pz(Caja(TX1 - 2, TY0 + 2, TZ0 + 2, TX1, TY1 - 2, TZ1, torre, {'left': hueco(TY1 - 2 - PUENTE[4], TZ1 - PUENTE[5], TY1 - 2 - PUENTE[1], TZ1 - PUENTE[2], 'paso de cables')}), 'A'))
    if 'techo' not in q: camara.append(pz(Caja(TX0, TY0 + 2, TZ1 - 2, TX1, TY1, TZ1, torre, {'top': rejillas}), 'A'))
    if 'frente' not in q: camara.append(pz(Caja(TX0, TY0, TZ0, TX1, TY0 + 2, TZ1, '#e4e9ef', {'front': tapa_camara}), 'D'))
    puente = [pz(Caja(TX1, PUENTE[1], PUENTE[2], 0, PUENTE[1] + 1.5, PUENTE[5], '#cbd5e1'), 'A'), pz(Caja(TX1, PUENTE[4] - 1.5, PUENTE[2], 0, PUENTE[4], PUENTE[5], '#cbd5e1'), 'A'),
              pz(Caja(TX1, PUENTE[1], PUENTE[2], 0, PUENTE[4], PUENTE[2] + 1.5, '#cbd5e1'), 'A'), pz(Caja(TX1, PUENTE[1], PUENTE[5] - 1.5, 0, PUENTE[4], PUENTE[5], '#cbd5e1'), 'A')]
    return cuerpo, camara, puente

def conectores_placa():
    """Conectores dupont puestos en la placa de expansión: hembra sobre los pines macho (hasta su
    plástico) y macho dentro de los zócalos hembra."""
    out = []
    for h in cables():
        x, y, z = h.puntos[-1]
        if abs(y - YP) < 1e-6:
            hembra = z in (ZF[('sup', 'hembra')], ZF[('inf', 'hembra')])
            out.append(Caja(x - DUP / 2, YP, z - DUP / 2, x + DUP / 2, 27.5 if hembra else 33.5, z + DUP / 2, NEGRO_DUP, borde='#0b0b0b'))
    return out

# ── Cables ──────────────────────────────────────────────────────────────
ROJO, NARANJA, NEGRO, VERDE, AZUL, AMARILLO = '#dc2626', '#ea580c', '#111827', '#16a34a', '#2563eb', '#eab308'
CORTOS = {'Pantalla OLED', 'LED RGB KY-016', 'Lector microSD HW-125', 'Buzzer KY-012'}   # jumpers de 10 cm
JUMPER_MAX = 65                             # mm de recorrido: 100 − 2 conectores de 14 − 7 de holgura
class Hilo:
    def __init__(self, pieza, desde, hasta, color, puntos):
        self.pieza, self.desde, self.hasta, self.color, self.puntos = pieza, desde, hasta, color, puntos
    def largo(self):
        return sum(sum(abs(a[i] - b[i]) for i in range(3)) for a, b in zip(self.puntos, self.puntos[1:]))

def limpiar(pts):
    out = [pts[0]]
    for p in pts[1:]:
        if p != out[-1]: out.append(p)
    return out

def cables():
    H_ = []
    PZ = {p.nombre: p for p in piezas()}
    def h(pieza, desde, hasta, color, pts): H_.append(Hilo(pieza, desde, hasta, color, limpiar(pts)))
    def s(pieza, pin_): return PZ[pieza].salidas[pin_]
    # DHT22 (abajo, pines arriba) → puente → fila inferior, macho
    for i, (p_, dest, color, k) in enumerate((('+', '3V3', ROJO, 0), ('out', 'GPIO 4', AMARILLO, k_de('inf', '4')), ('−', 'GND', NEGRO, 1))):
        x, y, z = s('DHT22', p_)
        yb = 22.5 + 2.5 * i; zb = 37 + 1.2 * i; xa = 4 + 1.2 * i; zv = 24 - 1.2 * i
        t = pin('inf', k, 'macho')
        h('DHT22', p_, dest, color, [(x, y, z), (x, y, 63), (x, yb, 63), (x, yb, zb), (xa, yb, zb), (xa, YC, zb), (xa, YC, zv), (t[0], YC, zv), (t[0], YC, t[2]), t])
    # CCS811 (arriba, pines abajo) → puente → fila superior, hembra
    for i, (p_, dest, color, k) in enumerate((('SCL', 'GPIO 42', AZUL, k_de('sup', '42')), ('SDA', 'GPIO 2', VERDE, k_de('sup', '2')), ('GND', 'GND', NEGRO, 1), ('VCC', '3V3', ROJO, 0))):
        x, y, z = s('CCS811', p_)
        yb = 26 + 1.2 * i; zb = 39.8 + 1.1 * i; xa = 4.5 + 1.0 * i
        zt = 76.6 - 0.9 * i; xb = 45 - 0.9 * i; zr = 64.4 + 0.35 * i
        t = pin('sup', k, 'hembra')
        h('CCS811', p_, dest, color, [(x, y, z), (x, y, 49.5), (x, yb, 49.5), (x, yb, zb), (xa, yb, zb), (xa, YC, zb), (xa, YC, zt), (xb, YC, zt), (xb, YC, zr), (t[0], YC, zr), (t[0], YC, t[2]), t])
    # Pantalla OLED → por encima de sus conectores → fila superior, macho
    for p_, dest, color, k, zt in (('GND', 'GND', NEGRO, 1, 72.2), ('VCC', '3V3', ROJO, 0, 72.8), ('SCL', 'GPIO 42', AZUL, k_de('sup', '42'), 72.8), ('SDA', 'GPIO 2', VERDE, k_de('sup', '2'), 72.2)):
        x, y, z = s('Pantalla OLED', p_)
        t = pin('sup', k, 'macho')
        h('Pantalla OLED', p_, dest, color, [(x, y, z), (x, y + 2.4, z), (x, y + 2.4, zt), (x, YC, zt), (t[0], YC, zt), (t[0], YC, t[2]), t])
    # LED RGB → curva a la izquierda de sus conectores → R, G, B a la fila superior (macho); − a G (hembra)
    for p_, dest, color, k, tipo in (('R', 'GPIO 38', ROJO, k_de('sup', '38'), 'macho'), ('G', 'GPIO 39', VERDE, k_de('sup', '39'), 'macho'),
                                     ('B', 'GPIO 40', AZUL, k_de('sup', '40'), 'macho'), ('−', 'G', NEGRO, k_de('sup', 'G'), 'hembra')):
        x, y, z = s('LED RGB KY-016', p_)
        t = pin('sup', k, tipo)
        h('LED RGB KY-016', p_, dest, color, [(x, y, z), (x - 2, y, z), (x - 2, YC, z), (t[0], YC, z), (t[0], YC, t[2]), t])
    # Buzzer → curva sobre el piso → fila inferior, macho
    for p_, dest, color, k, zh in (('S', 'GPIO 12', NARANJA, k_de('inf', '12'), 26), ('+', '3V3', ROJO, 25, 27), ('−', 'GND', NEGRO, 24, 28)):
        x, y, z = s('Buzzer KY-012', p_)
        t = pin('inf', k, 'macho')
        h('Buzzer KY-012', p_, dest, color, [(x, y, z), (x, y, 5), (x, YC, 5), (x, YC, zh), (t[0], YC, zh), (t[0], YC, t[2]), t])
    # microSD → bajan por detrás del lector y del LED RGB → fila inferior, hembra
    for p_, dest, color, nombre, zd in (('CS', 'GPIO 15', '#0e7490', '15', 40), ('SCK', 'GPIO 17', '#a21caf', '17', 40.6), ('MOSI', 'GPIO 16', '#06b6d4', '16', 41.2),
                                        ('MISO', 'GPIO 18', '#0891b2', '18', 41.8), ('VCC', '5V', NARANJA, '5V', 39.4), ('GND', 'G', NEGRO, 'G', 38.8)):
        x, y, z = s('Lector microSD HW-125', p_)
        t = pin('inf', k_de('inf', nombre), 'hembra')
        h('Lector microSD HW-125', p_, dest, color, [(x, y, z), (x, y, z + 2), (x, 13.5, z + 2), (x, 13.5, zd), (x, YC, zd), (t[0], YC, zd), (t[0], YC, t[2]), t])
    # Módulo de carga: SDA/SCL soldados → sobre el separador → fila superior, macho
    for i, (p_, dest, color, k) in enumerate((('SDA', 'GPIO 47', VERDE, k_de('sup', '47')), ('SCL', 'GPIO 21', AZUL, k_de('sup', '21')))):
        x0 = 66 + 2.54 * i; zt = 75.6 + 0.8 * i
        t = pin('sup', k, 'macho')
        h('Módulo de carga UNIT', p_, dest, color, [(x0, UNIT[1], UNIT[5]), (x0, YE, UNIT[5]), (x0, YE, zt), (x0, YC, zt), (t[0], YC, zt), (t[0], YC, t[2]), t])
    # STEP + / STEP − (5.0 V) → pasacables → pads 5V y GND de la placa
    for p_, dest, color, xu, zz, zp, xp in (('STEP +', '5V de la placa', NARANJA, 96, 31, 26, 85.5), ('STEP −', 'GND de la placa', NEGRO, 98, 29.8, 24.5, 87.1)):
        h('Módulo de carga UNIT', p_, dest, color, [(xu, UNIT[1], UNIT[2]), (xu, YE, UNIT[2]), (xu, YE, zz), (xu, PLACA[1] - 1, zz), (xu, PLACA[1] - 1, zp), (xp, PLACA[1] - 1, zp), (xp, PLACA[1], zp)])
    # Ventilador → STEP ± del módulo de carga (segundo cable en el mismo pad), por detrás de la cuna
    for p_, dest, color, xv, yv, zc, xu in (('+', 'STEP + del módulo de carga', NARANJA, 54, 54, 41, 96), ('−', 'STEP − del módulo de carga', NEGRO, 52, 55.5, 39.5, 98)):
        h('Ventilador 5 V', p_, dest, color, [(xv, yv, VENT[2]), (xv, yv, zc), (xu, yv, zc), (xu, 47, zc), (xu, 47, UNIT[2])])
    # Batería → conector JST del módulo de carga
    for p_, dest, color, yb, zb, xv, zj in (('+', 'JST + del módulo de carga', ROJO, 48.5, 34, 59, 55), ('−', 'JST − del módulo de carga', NEGRO, 50, 32, 60, 56.5)):
        h('Batería LiPo', p_, dest, color, [(BATERIA[3], yb, zb), (xv, yb, zb), (xv, yb, zj), (63, yb, zj)])
    return H_
