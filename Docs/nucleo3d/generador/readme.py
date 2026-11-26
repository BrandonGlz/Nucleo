"""Escribe Docs/nucleo3d/README.md a partir del modelo (piezas impresas, tornillería, módulos y cables)."""
import os, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import modelo2 as m, verificar

hilos, errores, cruces = verificar.revisar()
assert not errores and not cruces, (errores, cruces)
f = lambda v: '%g' % round(v / 10, 2)
T = m.TABIQUE
zona = {'sensores': 'Cámara de sensores', 'frente': 'Frente (tapa C)', 'centro': 'Centro (separador B)', 'energia': 'Energía'}
def caja(cs):
    return (min(c.b[0] for c in cs), min(c.b[1] for c in cs), min(c.b[2] for c in cs), max(c.b[3] for c in cs), max(c.b[4] for c in cs), max(c.b[5] for c in cs))
def ficha(p, clave):
    return next((t for a, t in p.ficha if a == clave), '')
filas = '\n'.join(f'| {p.num} | {p.nombre} | {zona[p.zona]} | {" × ".join(f(v) for v in p.dims)} | {f(caja(p.cajas)[0])} · {f(caja(p.cajas)[1])} · {f(caja(p.cajas)[2])} | {ficha(p, "Sujeción")} |' for p in m.piezas())
cu, ca, pu = m.carcasa(())
todas = cu + ca + pu + m.esqueleto_extra()
NOMBRES = {'A': 'Base', 'B': 'Separador', 'C': 'Tapa frontal', 'D': 'Tapa de la cámara'}
QUE = {'A': 'cuerpo, cámara de sensores, puente de cables, postes de las tapas, cuna de la batería, rieles del CCS811 y del DHT22, topes del separador',
       'B': 'tabique con rejilla y pasacables, 4 postes M3 de la placa de expansión, repisa y gancho del módulo de carga, 2 patas al piso',
       'C': 'ventana de la pantalla, barreno del LED RGB con chaflán, rejilla del buzzer, postes de la pantalla y del lector microSD, guías del LED RGB y del buzzer',
       'D': 'rejilla y pestaña que sujeta al DHT22'}
partes = '\n'.join(f'| {k} | {NOMBRES[k]} | {" × ".join(f(b[i+3]-b[i]) for i in range(3))} | {QUE[k]} |' for k in 'ABCD' for b in [caja([c for c in todas if c.parte == k])])
tornillos = '\n'.join(f'| {c} | {med} | {donde} |' for c, med, donde in m.TORNILLOS)

def destino(h):
    x, y, z = h.puntos[-1]
    if abs(y - m.YP) < 1e-6:
        fila = 'superior' if z > 48 else 'inferior'
        tipo = 'hembra' if z in (m.ZF[('sup', 'hembra')], m.ZF[('inf', 'hembra')]) else 'macho'
        return f'**{h.hasta}** (placa de expansión, fila {fila}, pin {tipo})'
    return h.hasta

def recorrido(h):
    pasa, pts = [], h.puntos
    if any(p[0] < 0 for p in pts) and any(p[0] > 0 for p in pts): pasa.append('puente de cables')
    if any(p[1] > T[4] for p in pts) and any(p[1] < T[1] for p in pts):
        hx0, hz0, hx1, hz1 = m.HUECO_TAB
        por_hueco = any(hx0 < p[0] < hx1 and hz0 < p[2] < hz1 and p[1] < T[1] for p in pts)
        pasa.append('pasacables del separador' if por_hueco else 'sobre el separador')
    return ', '.join(pasa) or 'directo'

cab = []
for h in hilos:
    largo = h.largo()
    cable = f'jumper de 10 cm (recorrido {f(largo)} cm)' if h.pieza in m.CORTOS else f'{max(1, round(largo/10) + 3)} cm'
    cab.append(f'| {h.pieza} | {h.desde} | {destino(h)} | {recorrido(h)} | {cable} |')
cab = '\n'.join(cab)

txt = f'''# Núcleo en 3D (beta)

Referencia para modelar, imprimir y renderizar la carcasa de Núcleo. Todas las hojas salen del
mismo modelo, con las **medidas reales de cada módulo** (placa, componentes, pines y conectores
dupont), así que medidas, posiciones y cables coinciden entre sí. Las medidas van en
**centímetros**, desde la esquina inferior izquierda del frente del cuerpo (x a la derecha, y
hacia atrás, z hacia arriba). Las que dicen «verificar» son de la ficha de la tienda o de la foto:
mide tu módulo antes de imprimir.

![Núcleo beta](portada.svg)

## Hojas

| Hoja | Qué muestra |
| --- | --- |
| [Exterior](exterior.svg) | Cuatro perspectivas con las medidas generales |
| [Carcasa en 4 piezas](esqueleto.svg) | Base, separador y las dos tapas, cada una con sus soportes rotulados y medidos; explotada con tornillos; tablas de medidas y tornillería |
| [Medidas de cada módulo](medidas.svg) | Cada módulo de frente y de lado con cotas, su ficha (placa, pines, sujeción, fuente) y su posición |
| [Ensamblado paso a paso](ensamblado.svg) | Los 8 pasos de armado; en morado lo que se agrega en cada uno |
| [Interior y cableado](interior.svg) | Todo montado con cables y conectores: corte desde el frente, frente transparente, energía y desde arriba |
| [Mapa de cables](cableado.svg) | Vistas planas del cableado con el nombre de cada pin y las capas de fondo medidas |
| [Pieza por pieza](piezas.svg) | Una tarjeta por módulo: medidas, posición, sujeción y a qué pin va cada cable |
| [Planos](planos.svg) | Vistas ortogonales con medidas y cortes interiores |

### Exterior

![Exterior](exterior.svg)

### Carcasa en 4 piezas

![Carcasa en 4 piezas](esqueleto.svg)

### Medidas de cada módulo

![Medidas de cada módulo](medidas.svg)

### Ensamblado paso a paso

![Ensamblado paso a paso](ensamblado.svg)

### Interior y cableado

![Interior y cableado](interior.svg)

### Mapa de cables

![Mapa de cables](cableado.svg)

### Pieza por pieza

![Pieza por pieza](piezas.svg)

### Planos

![Planos](planos.svg)

## Piezas impresas

Son 4. Las tapas cierran con tornillos pequeños en las esquinas, que roscan en postes de la base.

| Pieza | Nombre | Envolvente x × y × z (cm) | Qué lleva |
| --- | --- | --- | --- |
{partes}

- **Paredes:** cuerpo {f(m.P)} cm, cámara 0.2 cm, separador {f(T[4]-T[1])} cm.
- **Ranuras para placas:** 0.16 cm para placas de 0.16 cm; si tu impresora cierra los huecos,
  súbelas a 0.19 cm.
- **Barrenos:** para rosca directa en el plástico M2 Ø 0.16, M2.5 Ø 0.21, M3 Ø 0.25 cm; pasantes
  M2 Ø 0.24, M2.5 Ø 0.29, M3 Ø 0.34 cm.
- **Impresión sugerida:** PETG o PLA, capa de 0.2 mm, 3 perímetros; las tapas acostadas por su cara
  exterior y la base de pie sobre el piso.

### Tornillería

| Cantidad | Medida | Dónde |
| --- | --- | --- |
{tornillos}

## Cómo está armado

- **El ESP32 va acostado y girado:** antena hacia la cámara de sensores (izquierda), USB a la
  derecha y la fila de los pines **19, 20 y 21 arriba**. Cada módulo queda del lado de los pines
  que usa, igual que en el prototipo:
  - **Arriba (lado 19-21):** pantalla OLED, LED RGB, CCS811 y módulo de carga.
  - **Abajo (lado contrario):** buzzer, lector microSD y DHT22.
- **Cuerpo:** {f(m.W)} × {f(m.D)} × {f(m.H)} cm. **Cámara de sensores:** {f(m.TX1-m.TX0)} × {f(m.TY1-m.TY0)} × {f(m.TZ1-m.TZ0)} cm
  a la izquierda, separada {f(-m.TX1)} cm para que no le llegue el calor, unida solo por el **puente
  de cables**. El **CCS811 va arriba** (placa acostada en dos rieles, sensor hacia la rejilla
  superior) y el **DHT22 abajo** (de pie en su riel, pines hacia arriba): el calor del CCS811 sube
  y no llega al DHT22.
- **Capas de fondo**, de adelante hacia atrás:
  1. **Tapa C y frente** (0–1.36 cm): la pantalla atornillada contra la ventana, el LED RGB
     apoyado detrás de un barreno de {f(m.LED_HUECO)} cm con chaflán (sin difusor ni acrílico), el lector
     microSD atornillado con la ranura de la tarjeta hacia el piso, y el LED RGB y el buzzer
     deslizados en sus guías.
  2. **Cables y conectores** ({f(m.YC)}–{f(m.PLACA[1])} cm): plano de cables a {f(m.YC)} cm del frente,
     conectores dupont ({f(m.DUP)} × {f(m.DUP)} × {f(m.DUP_L)} cm) y el ESP32.
  3. **Placa de expansión** atornillada a 4 postes del **separador B** (a {f(T[1])} cm del frente).
     Cada GPIO tiene un pin macho y uno hembra, con 3V3 y GND en los extremos: la pantalla y el
     CCS811 comparten el bus I2C sin empalmes.
  4. **Energía** (detrás del separador): el **módulo de carga UNIT** en la repisa del separador
     con el USB-C por la pared derecha; la **batería LiPo** de pie en su cuna; el **ventilador de
     3 cm** atornillado a la pared trasera y conectado a la salida STEP del módulo.
- **Jumpers cortos:** la pantalla, el LED RGB, el lector microSD y el buzzer usan jumpers dupont
  de 10 cm. Ningún recorrido pasa de {f(m.JUMPER_MAX)} cm; lo que sobra se dobla arriba o abajo de la
  placa de expansión.
- Solo lleva los módulos del prototipo armado: sin LED de Wi-Fi, sin MOSFET (el ventilador gira
  siempre que hay 5 V) y sin interruptor aparte (la batería va en el JST del módulo de carga).

## Ensamblado

1. Imprime A, B, C y D; lija las ranuras y repasa los barrenos con un tornillo.
2. **Tapa C:** pantalla con el vidrio en la ventana (4 × M2 × 5) y lector microSD de pie
   (4 × M2 × 5), con sus jumpers ya puestos.
3. **Tapa C:** desliza el LED RGB en sus guías hasta que la punta del LED apoye en su barreno
   (sin difusor: la luz sale directo por el agujero) y el buzzer en las suyas, con sus jumpers puestos.
4. **Base A:** ventilador contra la pared trasera (4 × M3 × 12 desde afuera) y batería en su cuna
   con cinta velcro.
5. **Separador B:** módulo de carga en la repisa; suelda SDA, SCL, STEP ± y el ventilador, y
   conecta la batería al JST. Mete B por el frente hasta los topes (2 × M2.5 × 6 al piso).
6. Placa de expansión a los postes de B (4 × M3 × 6); STEP ± por el pasacables a los pads 5V y
   GND; encaja el ESP32 con los pines 19-21 arriba.
7. **Cámara:** CCS811 por sus rieles, DHT22 en su riel, sus cables por el puente; cierra la tapa D
   (4 × {m.TORN_D}).
8. Conecta los jumpers del frente (ver el mapa de cables) y cierra la tapa C (4 × {m.TORN_C}).

## Módulos

Medidas del módulo sin cables. Posición: esquina inferior izquierda delantera, con conectores.

| # | Módulo | Zona | Medidas x × y × z (cm) | Posición x · y · z (cm) | Sujeción |
| --- | --- | --- | --- | --- | --- |
{filas}

## Cables

{len(hilos)} cables. El generador revisa que:

- **Nada se encime:** módulos, conectores dupont, soportes y paredes no ocupan el mismo espacio.
- **Continuidad:** cada cable sale del conector de su módulo y llega a su pin, sin cortes.
- **Sin choques:** ningún cable atraviesa un módulo, un soporte ni una pared; solo cruzan por el
  puente, el pasacables o por encima del separador.
- **Sin cruces:** ningún cable se cruza con los de otro módulo en el plano de cables del frente.
- **Los jumpers de 10 cm alcanzan:** recorrido de {f(m.JUMPER_MAX)} cm como máximo.

En la placa de expansión llegan con conector dupont: hembra en los pines macho y macho en los
pines hembra. Los cables del módulo de carga van soldados. El largo de los demás ya incluye 3 cm
de holgura.

| Módulo | Pin | Va a | Pasa por | Cable |
| --- | --- | --- | --- | --- |
{cab}

- El CCS811 lleva su pin **WAK** puenteado a GND en el propio módulo.
- La salida **STEP** del módulo de carga se ajusta a **5.0 V** (switch STEP UP en ON) antes de
  conectarla a la placa de expansión; ver [Conexiones del ESP32](../../Context/iot/conexiones.md#batería).

## Generador

Las hojas y este README salen de `generador/` (Python 3, sin dependencias):

```bash
cd Docs/nucleo3d/generador
python3 verificar.py   # encimados, continuidad, choques, cruces y largo de los jumpers
python3 render2.py     # las 9 hojas SVG
python3 readme.py      # este README
```

Las medidas de los módulos, los soportes y las 4 piezas impresas están en `modelo2.py`.
'''
open(os.path.join(os.path.dirname(AQUI), 'README.md'), 'w').write(txt)
print(len(hilos), 'cables')
