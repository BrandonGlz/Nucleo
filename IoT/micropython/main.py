import sys
import time

import machine

# Un solo programa: mide y publica lecturas (si hay sensores) y es la llave de Nico AI (latido y
# firma de peticiones por MQTT). MODO = "puente" en secrets.py: sin sensores, solo la llave.
from nucleo.aplicacion import ejecutar

try:
    ejecutar()
except KeyboardInterrupt:
    raise
except Exception as error:
    sys.print_exception(error)
    time.sleep(10)
    machine.reset()
