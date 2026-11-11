import sys
import time

import machine

import secrets

# MODO = "puente": este ESP solo es el puente de Nico AI (nucleo/puente.py); si no, mide y
# publica lecturas por MQTT (nucleo/aplicacion.py).
if getattr(secrets, "MODO", "sensores") == "puente":
    from nucleo.puente import ejecutar
else:
    from nucleo.aplicacion import ejecutar

try:
    ejecutar()
except KeyboardInterrupt:
    raise
except Exception as error:
    sys.print_exception(error)
    time.sleep(10)
    machine.reset()
