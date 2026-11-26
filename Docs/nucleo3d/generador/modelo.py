"""Modelo de la carcasa beta de Núcleo en milímetros (x: ancho, y: fondo desde el frente, z: alto)."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso import Caja

LOGO = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../FrontEnd/src/assets/logos/nucleo-logo-verde.svg')).read()
LOGO_VB = re.search(r'viewBox="([^"]+)"', LOGO).group(1)
LOGO_CUERPO = re.sub(r'<title>.*?</title>', '', LOGO.split('>', 1)[1].rsplit('</svg>', 1)[0], flags=re.S)
LOGO_CUERPO = re.sub(r'fill="#[0-9A-Fa-f]{3,6}"', 'fill="#111111"', LOGO_CUERPO)
def logo(x, y, w):
    vb = [float(v) for v in LOGO_VB.split()]
    h = w * vb[3] / vb[2]
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h:.2f}" viewBox="{LOGO_VB}">{LOGO_CUERPO}</svg>'

W, D, H, P = 110, 40, 80, 2.5          # cuerpo y grosor de pared
TX0, TX1, TY0, TY1, TZ0, TZ1 = -34, -6, 2, 38, 4, 76   # cámara de sensores

# ── Calcomanías (coordenadas locales en mm, origen arriba a la izquierda de la cara) ──
def frente_tapa(w, h):
    s = [f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="5" fill="none" stroke="#94a3b8" stroke-width="0.4"/>']
    s.append('<rect x="11" y="16" width="24" height="14" rx="1.5" fill="#0b1220" stroke="#334155" stroke-width="0.8"/>')
    s.append('<text x="13" y="20.5" font-size="2.6" fill="#7dd3fc" font-weight="600">NC-0501 · Wi-Fi</text>')
    s.append('<text x="13" y="25" font-size="3.6" fill="#e0f2fe" font-weight="700">23.4°C 48%</text>')
    s.append('<text x="13" y="28.6" font-size="2.6" fill="#bae6fd">eCO2 412 ppm</text>')
    s.append('<circle cx="86.5" cy="25.5" r="11" fill="none" stroke="#22c55e" stroke-width="2.6"/>')
    s.append('<circle cx="86.5" cy="25.5" r="12.6" fill="none" stroke="#22c55e" stroke-opacity="0.35" stroke-width="1.6"/>')
    s.append('<circle cx="86.5" cy="25.5" r="8.5" fill="#e5e7eb" stroke="#94a3b8" stroke-width="0.4"/>')
    s.append('<circle cx="15.5" cy="43.5" r="2.5" fill="#38bdf8" stroke="#0369a1" stroke-width="0.4"/>')
    s.append('<text x="19.5" y="44.6" font-size="3" fill="#475569" font-weight="600">Wi-Fi</text>')
    for i in range(4):
        for j in range(4):
            s.append(f'<circle cx="{81.1+i*3.6:.1f}" cy="{52.1+j*3.6:.1f}" r="1" fill="#475569"/>')
    s.append(logo(8, 53, 40))
    s.append('<rect x="52" y="66" width="14" height="5.5" rx="2.75" fill="#7c3aed"/><text x="59" y="70" font-size="3.4" font-weight="800" fill="#fff" text-anchor="middle">BETA</text>')
    for cx, cy in ((5, 5), (w-5, 5), (5, h-5), (w-5, h-5)):
        s.append(f'<circle cx="{cx}" cy="{cy}" r="1.6" fill="#cbd5e1" stroke="#64748b" stroke-width="0.4"/><circle cx="{cx}" cy="{cy}" r="0.6" fill="#64748b"/>')
    return ''.join(s)

def rejillas(w, h, margen=4, paso=4.5):
    s = []; y = margen
    while y < h - margen:
        s.append(f'<rect x="{margen}" y="{y:.1f}" width="{w-2*margen}" height="2" rx="1" fill="#475569"/>'); y += paso
    return ''.join(s)

def fondo_inferior(w, h):  # cara de abajo: x a la derecha, y hacia atrás
    return ('<rect x="50" y="5" width="16" height="2.2" rx="0.8" fill="#111827"/>'
            '<text x="58" y="11" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">microSD</text>'
            '<rect x="72" y="3.5" width="10" height="5" rx="1" fill="#475569"/><rect x="73" y="4.3" width="4.5" height="3.4" rx="0.6" fill="#f8fafc"/>'
            '<text x="77" y="13" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">encendido</text>'
            '<rect x="89" y="14" width="9" height="3.4" rx="1.7" fill="#111827"/>'
            '<text x="93.5" y="21.5" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">USB-C carga</text>'
            + ''.join(f'<circle cx="{x}" cy="{y}" r="2.2" fill="#cbd5e1" stroke="#64748b" stroke-width="0.4"/>' for x, y in ((8, 34), (102, 34), (8, 6), (102, 6) ) if False))

def trasera(w, h):  # u = 110 - x, v = 80 - z
    s = ['<circle cx="17.5" cy="13.5" r="11.5" fill="#1f2937"/>']
    for r in (10, 7, 4):
        s.append(f'<circle cx="17.5" cy="13.5" r="{r}" fill="none" stroke="#94a3b8" stroke-width="1"/>')
    s.append('<line x1="6" y1="13.5" x2="29" y2="13.5" stroke="#94a3b8" stroke-width="1"/><line x1="17.5" y1="2" x2="17.5" y2="25" stroke="#94a3b8" stroke-width="1"/>')
    s.append('<text x="17.5" y="30" font-size="2.8" text-anchor="middle" fill="#334155" font-weight="600">salida de aire</text>')
    for u in (25, 85):
        s.append(f'<circle cx="{u}" cy="58" r="2.6" fill="#1f2937"/><rect x="{u-1.1}" y="58" width="2.2" height="6" rx="1.1" fill="#1f2937"/>')
    s.append('<text x="55" y="62" font-size="2.8" text-anchor="middle" fill="#334155" font-weight="600">ranuras para colgar</text>')
    return ''.join(s)

def derecha(w, h):  # u = y, v = 80 - z
    return ('<rect x="13" y="22.5" width="9" height="4" rx="2" fill="#111827"/>'
            '<text x="17.5" y="31" font-size="2.6" text-anchor="middle" fill="#334155" font-weight="600">USB del ESP</text>'
            '<text x="17.5" y="34" font-size="2.6" text-anchor="middle" fill="#334155">(programar)</text>')

def tapa_superior(w, h):
    return ''

def esp_frente(w, h):  # 69 × 26, antena a la izquierda y USB a la derecha
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
    def f(w, h):
        return extra + f'<text x="{w/2:.1f}" y="{h/2+tam/3:.1f}" font-size="{tam}" text-anchor="middle" fill="{color_txt}" font-weight="700">{texto}</text>'
    return f

def oled_frente(w, h):
    return ('<rect x="1" y="5" width="25" height="15" fill="#020617"/>'
            '<text x="3" y="11" font-size="3" fill="#7dd3fc" font-weight="700">OLED</text>'
            '<text x="3" y="15" font-size="2.2" fill="#7dd3fc">0.96″ · 0x3C</text>')

def bateria_frente(w, h):
    return (f'<rect x="3" y="{h/2-9}" width="{w-6}" height="18" rx="1.5" fill="#1d4ed8" fill-opacity="0.85"/>'
            f'<text x="{w/2}" y="{h/2-1.5}" font-size="4" text-anchor="middle" fill="#fff" font-weight="800">LiPo 3.7 V</text>'
            f'<text x="{w/2}" y="{h/2+4.5}" font-size="3.2" text-anchor="middle" fill="#dbeafe">~3000 mAh</text>')

def ventilador_cara(w, h):
    c = w / 2
    s = [f'<circle cx="{c}" cy="{c}" r="{c-1.5}" fill="#0f172a"/>', f'<circle cx="{c}" cy="{c}" r="4" fill="#334155"/>']
    for k in range(5):
        s.append(f'<path d="M{c} {c} q 5 -8 9 -9" stroke="#64748b" stroke-width="2.2" fill="none" transform="rotate({k*72} {c} {c})"/>')
    return ''.join(s)

def dht_frente(w, h):
    s = [f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="1" fill="#f1f5f9"/>']
    for i in range(4):
        for j in range(6):
            s.append(f'<rect x="{2.2+i*3.2:.1f}" y="{2.5+j*3.6:.1f}" width="2" height="2.4" fill="#94a3b8"/>')
    return ''.join(s)

def ccs_frente(w, h):
    return (f'<rect x="{w/2-3}" y="{h/2-3}" width="6" height="6" fill="#111827"/>'
            f'<text x="{w/2}" y="{h-2}" font-size="2.4" text-anchor="middle" fill="#ede9fe" font-weight="700">CCS811</text>')

def perforada(w, h):
    return (f'<rect width="{w}" height="{h}" fill="url(#perf)"/>')

# ── Piezas (posición y tamaño en mm) ────────────────────────────────────
def piezas():
    """Devuelve {capa: [Caja]} con capa en: sensores, frente, placa, energia."""
    c = {}
    c['sensores'] = [
        Caja(-28, 15, 44, -12, 23, 70, '#f1f5f9', {'front': dht_frente}, 'DHT22|16 × 8 × 26 mm · con rejilla al frente'),
        Caja(-30, 24, 12, -10, 26, 30, '#6d28d9', {'front': ccs_frente}, 'CCS811|21 × 2 × 18 mm · WAK a GND'),
    ]
    c['frente'] = [
        Caja(9, P, 44, 36, P + 4, 71, '#1e3a8a', {'front': oled_frente}, 'Pantalla OLED|27 × 4 × 27 mm · tras la ventana'),
        Caja(13, P, 34, 18, 9, 39, '#38bdf8', None, 'LED de Wi-Fi|5 mm · con resistencia de 220 Ω'),
        Caja(77, P + 3, 47, 96, P + 5, 62, '#18181b', {'front': pcb('KY-016')}),
        Caja(83.5, P, 51.5, 89.5, P + 3, 57.5, '#f8fafc', None, 'LED RGB KY-016|19 × 15 mm · detrás del anillo'),
        Caja(77, P + 9, 15, 96, P + 11, 30, '#18181b', {'front': pcb('KY-012')}),
        Caja(80.5, P, 16.5, 92.5, P + 9, 28.5, '#111827', {'front': lambda w, h: f'<circle cx="{w/2}" cy="{h/2}" r="{w/2-0.6}" fill="#1f2937" stroke="#4b5563" stroke-width="0.6"/><circle cx="{w/2}" cy="{h/2}" r="1.4" fill="#4b5563"/>'}, 'Buzzer KY-012|19 × 15 mm · detrás de la rejilla'),
        Caja(46, 4, P, 70, 10, 44.5, '#1e40af', {'front': pcb('HW-125', extra='<rect x="5" y="34" width="14" height="7" rx="0.5" fill="#cbd5e1"/>')}, 'Lector microSD HW-125|24 × 6 × 42 mm · ranura abajo'),
        Caja(72, 3.5, 0, 82, 9, 8, '#334155', None, 'Interruptor|10 × 5.5 mm · sale por abajo'),
    ]
    c['placa'] = [
        Caja(16, 20, 28, 97, 21.6, 76, '#b08850', {'front': perforada}, 'Placa perforada|81 × 48 mm · soporte del ESP'),
        Caja(22, 14, 42, 91, 20, 68, '#111111', {'front': esp_frente}, 'ESP32-S3 (girado)|69 × 26 mm · antena a la izquierda'),
        Caja(80, 14, P, 106, 17, 19.5, '#1d4ed8', {'front': pcb('TP4056', tam=3)}, 'Módulo de carga TP4056|26 × 17 mm · USB-C abajo'),
        Caja(40, 14, P, 76, 17, 19.5, '#1d4ed8', {'front': pcb('MT3608 · 5 V', tam=3, extra='<rect x="24" y="4" width="7" height="7" rx="1" fill="#334155"/>')}, 'Elevador MT3608|36 × 17 mm · a 5 V'),
    ]
    c['energia'] = [
        Caja(46, 26, 3, 106, 36, 53, '#c9ced6', {'front': bateria_frente}, 'Batería LiPo|60 × 10 × 50 mm (~3000 mAh)'),
        Caja(80, 27.5, 54, 105, 37.5, 79 - P, '#111827', {'front': ventilador_cara, 'back': ventilador_cara}, 'Ventilador 5 V|25 × 25 × 10 mm · saca el aire por atrás'),
        Caja(55, 33, 56, 78, 35, 74, '#27272a', {'front': pcb('MAX17048', tam=2.6)}, 'MAX17048|23 × 18 mm · bus I2C propio'),
    ]
    return c

def carcasa(quitar=()):
    """Cuerpo, cámara de sensores y puente. quitar: paredes a omitir para ver por dentro
    ('frente', 'techo', 'derecha', 'izquierda', 'atras')."""
    gris, torre = '#e9edf2', '#dde3ea'
    q = set(quitar)
    cuerpo = [Caja(0, 0, 0, W, D, P, gris, {'bottom': fondo_inferior})]
    if 'atras' not in q: cuerpo.append(Caja(0, D - P, P, W, D, H - P, gris, {'back': trasera}))
    if 'izquierda' not in q: cuerpo.append(Caja(0, P, P, P, D - P, H - P, gris))
    if 'derecha' not in q: cuerpo.append(Caja(W - P, P, P, W, D - P, H - P, gris, {'right': derecha}))
    if 'techo' not in q: cuerpo.append(Caja(0, P, H - P, W, D, H, gris))
    if 'frente' not in q: cuerpo.append(Caja(0, 0, 0, W, P, H, gris, {'front': frente_tapa}))
    camara = [Caja(TX0, TY0, TZ0, TX1, TY1, TZ0 + 2, torre)]
    if 'atras' not in q: camara.append(Caja(TX0, TY1 - 2, TZ0 + 2, TX1, TY1, TZ1, torre, {'back': rejillas}))
    if 'izquierda' not in q: camara.append(Caja(TX0, TY0 + 2, TZ0 + 2, TX0 + 2, TY1 - 2, TZ1, torre, {'left': rejillas}))
    if 'derecha' not in q: camara.append(Caja(TX1 - 2, TY0 + 2, TZ0 + 2, TX1, TY1 - 2, TZ1, torre))
    if 'techo' not in q: camara.append(Caja(TX0, TY0, TZ1 - 2, TX1, TY1, TZ1, torre, {'top': rejillas}))
    if 'frente' not in q: camara.append(Caja(TX0, TY0, TZ0 + 2, TX1, TY0 + 2, TZ1 - 2, torre, {'front': rejillas}))
    puente = [Caja(TX1, 14, 34, 0, 26, 46, '#cbd5e1')]
    return cuerpo, camara, puente
