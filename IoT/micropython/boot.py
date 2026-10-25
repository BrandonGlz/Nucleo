# Se ejecuta primero en cada arranque. La red se conecta desde main.py para poder mostrar
# el avance en la pantalla y reintentar sin bloquear los sensores.
import gc

import esp

esp.osdebug(None)
gc.collect()
