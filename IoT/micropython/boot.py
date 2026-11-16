# Se ejecuta primero en cada arranque. La red se conecta desde main.py para poder mostrar
# el avance en la pantalla y reintentar sin bloquear los sensores.
import gc

import esp

esp.osdebug(None)
gc.collect()

# Instala una actualización remota descargada o vuelve a la versión anterior si la nueva no
# arranca (actualizacion.py). Un error aquí nunca debe impedir el arranque.
try:
    import actualizacion

    actualizacion.aplicar()
except Exception as error:  # noqa: BLE001
    print("OTA:", error)
gc.collect()
