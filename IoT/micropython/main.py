import sys
import time

import machine

from nucleo.aplicacion import ejecutar

try:
    ejecutar()
except KeyboardInterrupt:
    raise
except Exception as error:
    sys.print_exception(error)
    time.sleep(10)
    machine.reset()
