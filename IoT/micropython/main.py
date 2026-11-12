import sys
import time

import machine

import secrets

# MODO = "puente": este ESP solo es el puente de Nico AI (nucleo/puente.py).
# MODO = "ambos": mide y publica lecturas, y el puente corre en otro hilo.
# Otro valor o sin MODO: solo mide y publica lecturas por MQTT (nucleo/aplicacion.py).
MODO = getattr(secrets, "MODO", "sensores")

try:
    if MODO == "puente":
        from nucleo.puente import ejecutar

        ejecutar()
    elif MODO == "ambos":
        from nucleo.aplicacion import ejecutar
        from nucleo.puente import Puente

        ejecutar(puente=Puente(compartido=True))
    else:
        from nucleo.aplicacion import ejecutar

        ejecutar()
except KeyboardInterrupt:
    raise
except Exception as error:
    sys.print_exception(error)
    time.sleep(10)
    machine.reset()
