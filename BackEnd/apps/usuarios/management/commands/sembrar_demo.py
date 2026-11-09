import random
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from django.utils import timezone
from rest_framework.authtoken.models import Token

from apps.alertas.models import Alerta, Notificacion
from apps.dispositivos.models import Dispositivo, Sensor
from apps.mediciones.models import Lectura
from apps.mediciones.simulacion import Generador
from apps.organizaciones.models import Area, Organizacion
from apps.reportes import ia, servicios
from apps.reportes.models import ProgramacionReporte, Reporte
from apps.umbrales.models import Umbral
from apps.usuarios.models import TelefonoPush, Usuario
from common import roles

DOMINIO_ORG = "grupoaltamira.mx"
DOMINIO_CLINICA = "clinicasanrafael.mx"

AREAS = [
    ("Moldeo", "Línea 1 · Línea 2 · Línea 3 · Almacén de molde"),
    ("Laboratorio", "Sala limpia · Esclusa · Bodega fría · Control de calidad"),
    ("Guardería", "Aula 1 · Aula 3 · Comedor · Patio techado"),
    ("Almacén", "Andén de carga · Racks · Cuarto frío"),
]

# (rol, área o None, nombre, primer apellido, segundo apellido, activo, acceso al agente)
USUARIOS = [
    (roles.ADMIN, None, "Andrés", "Villalobos", "Ruiz", True, True),
    (roles.ADMIN, None, "Lucía", "Paredes", "Ochoa", True, True),
    (roles.SUPERVISOR, "Laboratorio", "Yadira", "Salazar", "Uribe", True, True),
    (roles.SUPERVISOR, "Moldeo", "Mariana", "Cruz", "León", True, True),
    (roles.SUPERVISOR, "Guardería", "Rubén", "Castillo", "Mora", True, True),
    (roles.SUPERVISOR, "Almacén", "Héctor", "Ibarra", "Lugo", True, True),
    (roles.ANALISTA, None, "Karla", "Méndez", "Soto", True, True),
    (roles.ANALISTA, "Moldeo", "Tomás", "Aguilar", "Rey", True, True),
    (roles.OPERADOR, "Moldeo", "Luis", "Ortega", "Paz", True, True),
    (roles.OPERADOR, "Moldeo", "Jorge", "Ramírez", "Luna", False, False),
    (roles.OPERADOR, "Laboratorio", "Diana", "Ríos", "Vega", True, False),
    (roles.OPERADOR, "Laboratorio", "Elena", "Cota", "Félix", True, True),
    (roles.OPERADOR, "Guardería", "Paola", "Herrera", "Gil", True, False),
    (roles.OPERADOR, "Almacén", "Iván", "Soto", "Medina", True, True),
]

# (área, nombre, código MQTT, operador (nombre) o None, intervalo, batería, horas sin conexión)
# NUC-001 es el código del ESP32 real (IoT/micropython/secrets.example.py).
DISPOSITIVOS = [
    ("Moldeo", "Núcleo T-01", "NC-0341", "Luis", 30, 86, 0),
    ("Moldeo", "Núcleo T-02", "NC-0342", None, 30, 64, 0),
    ("Moldeo", "Núcleo T-03", "NC-0343", None, 30, 78, 0),
    ("Moldeo", "Núcleo T-04", "NC-0344", None, 60, 52, 0),
    ("Laboratorio", "Núcleo L-07", "NC-0417", "Diana", 15, 22, 0),
    ("Laboratorio", "Núcleo L-08", "NC-0418", "Elena", 15, 70, 0),
    ("Laboratorio", "Núcleo L-09", "NC-0419", None, 30, 88, 0),
    ("Laboratorio", "Núcleo ESP32 piloto", "NUC-001", None, 30, 95, 0),
    ("Guardería", "Núcleo E-03", "NC-0288", "Paola", 60, 91, 0),
    ("Guardería", "Núcleo E-04", "NC-0289", None, 60, 67, 0),
    ("Guardería", "Núcleo E-05", "NC-0290", None, 60, 12, 0),
    ("Guardería", "Núcleo E-06", "NC-0291", None, 60, 31, 2),
    ("Almacén", "Núcleo A-01", "NC-0501", "Iván", 60, 81, 0),
    ("Almacén", "Núcleo A-02", "NC-0502", None, 60, 58, 0),
    ("Almacén", "Núcleo A-03", "NC-0503", None, 120, 40, 26),
]

# (variable, peligro_min, advertencia_min, advertencia_max, peligro_max) por área.
UMBRALES = {
    "Moldeo": [("TEMP", 18, 20, 26.5, 28), ("HUM", 30, 35, 60, 65), ("AIRE", 0, 0, 1100, 1500)],
    "Laboratorio": [("TEMP", 16, 18, 23, 25), ("HUM", 35, 38, 57, 62), ("AIRE", 0, 0, 800, 1000)],
    "Guardería": [("TEMP", 18, 20, 26, 28), ("HUM", 30, 35, 60, 65), ("AIRE", 0, 0, 950, 1100)],
    "Almacén": [("TEMP", 10, 14, 25, 28), ("HUM", 35, 40, 65, 72), ("AIRE", 0, 0, 900, 1200)],
    "Urgencias": [("TEMP", 19, 20, 24, 26), ("HUM", 35, 40, 55, 60), ("AIRE", 0, 0, 900, 1100)],
}
SENSORES = [("DHT22", "Temperatura y humedad relativa"), ("CCS811", "Calidad del aire (eCO2)")]
SENSOR_DE = {"TEMP": "DHT22", "HUM": "DHT22", "AIRE": "CCS811"}

# Lecturas finales forzadas para que la demostración arranque con alertas pendientes.
FORZADAS = {"NC-0417": ("HUM", 71.0), "NC-0342": ("TEMP", 27.8), "NC-0502": ("HUM", 73.5)}

OBSERVACIONES = {
    "ATENDIDA": [
        "Se ajustó la extracción de la línea.",
        "Se ventiló el área y se normalizó.",
        "Se revisó el deshumidificador.",
        "Se cerró la puerta del andén.",
        "Se ajustó el aire acondicionado.",
    ],
    "DESCARTADA": [
        "Puerta abierta durante la carga.",
        "Limpieza programada en el área.",
        "Lectura durante mantenimiento del equipo.",
    ],
}
PASO = timedelta(minutes=10)


def correo(nombre, apellido, dominio):
    import unicodedata

    texto = unicodedata.normalize("NFD", f"{nombre}.{apellido}".lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn") + f"@{dominio}"


class Command(BaseCommand):
    help = (
        "Crea datos de demostración de volumen mediano: dos organizaciones, áreas, un usuario "
        "de cada rol (y varios operadores), 17 dispositivos con sus sensores y umbrales, "
        "días de lecturas cada 10 minutos, las alertas que provocan, notificaciones, "
        "reportes y programaciones. Todas las cuentas usan la misma contraseña."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--password", default="Nucleo2026", help="Contraseña de todas las cuentas."
        )
        parser.add_argument("--dias", type=int, default=14, help="Días de historial de lecturas.")
        parser.add_argument(
            "--reiniciar",
            action="store_true",
            help="Borra antes todas las organizaciones, usuarios, dispositivos, lecturas, "
            "alertas y reportes (los catálogos se conservan).",
        )
        parser.add_argument("--semilla", type=int, default=7, help="Semilla del azar.")

    def handle(self, *args, password, dias, reiniciar, semilla, **opciones):
        if not settings.DEBUG:
            raise CommandError("Este comando solo se ejecuta con DJANGO_DEBUG=True.")
        if Organizacion.objects.exists() and not reiniciar:
            raise CommandError("Ya hay datos. Usa --reiniciar para borrarlos y sembrar de nuevo.")
        self.azar = random.Random(semilla)
        self.password = password
        self.ahora = timezone.now().replace(second=0, microsecond=0)
        if reiniciar:
            self._reiniciar()
        with transaction.atomic():
            self._catalogo_de_cuentas()
            self._dispositivos()
        self._lecturas_y_alertas(dias)
        self._reportes()
        self._resumen()

    # --- Limpieza ---------------------------------------------------------------------------
    def _reiniciar(self):
        with connections["iot"].cursor() as cursor:
            cursor.execute("TRUNCATE TABLE lectura")
        with transaction.atomic():
            Notificacion.objects.all().delete()
            Alerta.objects.all().delete()
            Reporte.objects.all().delete()
            ProgramacionReporte.objects.all().delete()
            Umbral.objects.all().delete()
            Sensor.objects.all().delete()
            Dispositivo.objects.all().delete()
            Token.objects.all().delete()
            TelefonoPush.objects.all().delete()
            Usuario.objects.all().delete()
            Area.objects.all().delete()
            Organizacion.objects.all().delete()
        self.stdout.write("Datos anteriores borrados.")

    # --- Organizaciones, áreas y usuarios ----------------------------------------------------
    def _usuario(self, rol, organizacion, area, nombre, apellido, segundo, activo, agente, dominio):
        usuario = Usuario.objects.create_user(
            correo(nombre, apellido, dominio),
            self.password,
            organizacion=organizacion,
            area=area,
            rol_id=rol,
            nombre=nombre,
            primer_apellido=apellido,
            segundo_apellido=segundo,
            estado_usuario_id=roles.USUARIO_ACTIVO if activo else roles.USUARIO_INACTIVO,
            acceso_agente=agente,
        )
        minutos = self.azar.randint(2, 60 * 30) if activo else 60 * 24 * 80
        Usuario.objects.filter(pk=usuario.pk).update(
            last_login=self.ahora - timedelta(minutes=minutos)
        )
        return usuario

    def _catalogo_de_cuentas(self):
        Usuario.objects.create_superuser(
            "plataforma@nucleo.local", self.password, nombre="Pablo", primer_apellido="Plataforma"
        )
        self.org = Organizacion.objects.create(
            nombre="Grupo Altamira",
            dir_calle="Blvd. Industrial",
            dir_numero="1450",
            dir_colonia="Ciudad Industrial",
            ciudad="Tijuana",
            telefono="6646231100",
        )
        self.areas = {
            nombre: Area.objects.create(organizacion=self.org, nombre=nombre, descripcion=desc)
            for nombre, desc in AREAS
        }
        self.usuarios = {}
        for rol, area, nombre, apellido, segundo, activo, agente in USUARIOS:
            self.usuarios[nombre] = self._usuario(
                rol,
                self.org,
                self.areas.get(area),
                nombre,
                apellido,
                segundo,
                activo,
                agente,
                DOMINIO_ORG,
            )

        # Segunda organización: comprueba que cada cliente solo ve sus datos.
        self.clinica = Organizacion.objects.create(
            nombre="Clínica San Rafael",
            dir_calle="Av. Revolución",
            dir_numero="820",
            dir_colonia="Zona Centro",
            ciudad="Tijuana",
            telefono="6646880202",
        )
        urgencias = Area.objects.create(
            organizacion=self.clinica, nombre="Urgencias", descripcion="Sala de espera · Triage"
        )
        self.areas["Urgencias"] = urgencias
        self.usuarios["Sofía"] = self._usuario(
            roles.ADMIN,
            self.clinica,
            None,
            "Sofía",
            "Navarro",
            "Ibarra",
            True,
            True,
            DOMINIO_CLINICA,
        )
        self.usuarios["Raúl"] = self._usuario(
            roles.OPERADOR,
            self.clinica,
            urgencias,
            "Raúl",
            "Beltrán",
            "Cano",
            True,
            False,
            DOMINIO_CLINICA,
        )

    # --- Dispositivos, sensores y umbrales ---------------------------------------------------
    def _dispositivos(self):
        lista = [
            *DISPOSITIVOS,
            ("Urgencias", "Núcleo U-01", "NC-0901", "Raúl", 30, 74, 0),
            ("Urgencias", "Núcleo U-02", "NC-0902", None, 30, 63, 0),
        ]
        self.dispositivos = []
        for area, nombre, codigo, operador, intervalo, bateria, horas_sin in lista:
            organizacion = self.areas[area].organizacion
            admin = Usuario.objects.filter(organizacion=organizacion, rol_id=roles.ADMIN).first()
            ultima = self.ahora - timedelta(hours=horas_sin)
            if horas_sin:
                estado = roles.DISPOSITIVO_SIN_CONEXION
            elif bateria < settings.NUCLEO_BATERIA_BAJA_PCT:
                estado = roles.DISPOSITIVO_BATERIA_BAJA
            else:
                estado = roles.DISPOSITIVO_EN_LINEA
            dispositivo = Dispositivo.objects.create(
                area=self.areas[area],
                nombre=nombre,
                codigo_mqtt=codigo,
                operador=self.usuarios.get(operador),
                registrado_por=admin,
                intervalo_muestreo_seg=intervalo,
                nivel_bateria=bateria,
                ultima_conexion=ultima,
                ultimo_arranque=self.ahora - timedelta(days=self.azar.randint(2, 9)),
                estado_dispositivo_id=estado,
            )
            for modelo, funcion in SENSORES:
                Sensor.objects.create(
                    dispositivo=dispositivo,
                    modelo=modelo,
                    funcion=funcion,
                    fecha_acondicionamiento=(self.ahora - timedelta(days=60)).date(),
                    fecha_calibracion=(
                        self.ahora - timedelta(days=self.azar.randint(5, 40))
                    ).date(),
                )
            supervisor = Usuario.objects.filter(
                area=self.areas[area], rol_id=roles.SUPERVISOR
            ).first()
            for variable, pmin, amin, amax, pmax in UMBRALES[area]:
                Umbral.objects.create(
                    dispositivo=dispositivo,
                    variable_id=variable,
                    configurado_por=supervisor or admin,
                    peligro_min=pmin,
                    advertencia_min=amin,
                    advertencia_max=amax,
                    peligro_max=pmax,
                )
            self.dispositivos.append((dispositivo, area, horas_sin))
        # Un sensor pendiente de calibración, para que se vea en el detalle.
        Sensor.objects.filter(dispositivo__codigo_mqtt="NC-0419", modelo="CCS811").update(
            estado_sensor_id=roles.SENSOR_REQUIERE_CALIBRACION
        )

    # --- Lecturas, alertas y notificaciones --------------------------------------------------
    def _lecturas_y_alertas(self, dias):
        total_lecturas = 0
        total_alertas = 0
        inicio = self.ahora - timedelta(days=dias)
        pasos = int((self.ahora - inicio) / PASO)
        for i, (dispositivo, area, horas_sin) in enumerate(self.dispositivos):
            generador = Generador(area, semilla=f"{dispositivo.codigo_mqtt}")
            ruido = random.Random(i)
            sensores = {s.modelo: s for s in dispositivo.sensores.all()}
            fin = self.ahora - timedelta(hours=horas_sin)
            forzada = FORZADAS.get(dispositivo.codigo_mqtt)
            lecturas = []
            for paso in range(pasos + 1):
                fecha = inicio + paso * PASO
                if fecha > fin:
                    break
                for variable in ("TEMP", "HUM", "AIRE"):
                    valor = generador.valor(variable, fecha, ruido)
                    if forzada and forzada[0] == variable and fin - fecha <= timedelta(minutes=30):
                        valor = forzada[1] + ruido.uniform(-0.3, 0.3)
                    lecturas.append(
                        Lectura(
                            sensor_num=sensores[SENSOR_DE[variable]].pk,
                            variable_codigo=variable,
                            valor=Decimal(str(round(valor, 2))),
                            fecha_hora=fecha,
                            recibida_en=fecha + timedelta(seconds=1),
                            estabilizada=True,
                        )
                    )
            lecturas = Lectura.objects.bulk_create(lecturas, batch_size=5000)
            total_lecturas += len(lecturas)
            total_alertas += self._alertas_de(dispositivo, lecturas)
            Dispositivo.objects.filter(pk=dispositivo.pk).update(
                ultima_conexion=lecturas[-1].fecha_hora
            )
        self.stdout.write(f"{total_lecturas} lecturas y {total_alertas} alertas.")

    def _alertas_de(self, dispositivo, lecturas):
        umbrales = {u.variable_id: u for u in dispositivo.umbrales.all()}
        area = dispositivo.area
        responsables = list(Usuario.objects.filter(area=area, rol_id=roles.SUPERVISOR)) or list(
            Usuario.objects.filter(organizacion=area.organizacion, rol_id=roles.ADMIN)
        )
        quien_atiende = responsables[0]
        peso = {None: 0, "ADVERTENCIA": 1, "PELIGRO": 2}
        previo = {}
        ultima_por_par = {}
        creadas = []
        for lectura in lecturas:
            umbral = umbrales[lectura.variable_codigo]
            clase = umbral.clasificar(lectura.valor)
            nivel = clase[0] if clase else None
            antes = previo.get(lectura.variable_codigo)
            previo[lectura.variable_codigo] = nivel
            if nivel is None or peso[nivel] <= peso[antes]:
                continue
            par = (umbral.pk, nivel)
            anterior = ultima_por_par.get(par)
            if anterior and lectura.fecha_hora - anterior.fecha_hora < timedelta(minutes=45):
                continue
            alerta = Alerta(
                umbral=umbral,
                lectura_num=lectura.pk,
                lectura_fecha_hora=lectura.fecha_hora,
                lectura_valor=lectura.valor,
                nivel=nivel,
                tipo=clase[1],
                fecha_hora=lectura.fecha_hora + timedelta(seconds=4),
            )
            ultima_por_par[par] = alerta
            creadas.append(alerta)

        # Queda pendiente la última de cada umbral y nivel (solo puede haber una) si es de las
        # últimas horas, y algunas más antiguas que nadie atendió.
        recientes = {
            id(a)
            for a in ultima_por_par.values()
            if self.ahora - a.fecha_hora < timedelta(hours=8) or self.azar.random() < 0.2
        }
        for alerta in creadas:
            if id(alerta) in recientes:
                continue
            estado = "ATENDIDA" if self.azar.random() < 0.78 else "DESCARTADA"
            alerta.estado = estado
            alerta.atendida_por = quien_atiende
            alerta.fecha_atencion = alerta.fecha_hora + timedelta(minutes=self.azar.randint(4, 95))
            alerta.observaciones = self.azar.choice(OBSERVACIONES[estado])
        for alerta in creadas:
            if id(alerta) in recientes:
                alerta.estado = "PENDIENTE"
        Alerta.objects.bulk_create(creadas)

        notificaciones = []
        for alerta in creadas:
            envio = alerta.fecha_hora + timedelta(seconds=self.azar.randint(5, 50))
            for usuario in responsables:
                notificaciones.append(
                    Notificacion(
                        alerta=alerta,
                        usuario=usuario,
                        canal="CORREO",
                        estado_envio="ENVIADA",
                        fecha_envio=envio,
                    )
                )
            if dispositivo.operador_id:
                notificaciones.append(
                    Notificacion(
                        alerta=alerta,
                        usuario_id=dispositivo.operador_id,
                        canal="PUSH",
                        estado_envio="ENVIADA",
                        fecha_envio=envio,
                    )
                )
        Notificacion.objects.bulk_create(notificaciones)
        return len(creadas)

    # --- Reportes y programaciones -----------------------------------------------------------
    def _reportes(self):
        dia = timedelta(days=1)
        hoy = timezone.localtime(self.ahora).replace(hour=0, minute=0)
        solicitudes = [
            (self.org, "Moldeo", hoy - 7 * dia, hoy, "MANUAL", "Mariana", 0.3),
            (self.org, "Laboratorio", hoy - 7 * dia, hoy, "PROGRAMADO", None, 0.5),
            (self.org, "Guardería", hoy - 5 * dia, hoy, "PROGRAMADO", None, 2),
            (self.org, "Almacén", hoy - 3 * dia, hoy, "MANUAL", "Karla", 1),
            (self.org, None, hoy - 14 * dia, hoy, "MANUAL", "Andrés", 0.1),
            (self.org, "Laboratorio", hoy - 14 * dia, hoy - 7 * dia, "PROGRAMADO", None, 7),
        ]
        hechos = 0
        for organizacion, area, inicio, fin, origen, autor, hace_dias in solicitudes:
            try:
                reporte = servicios.generar_reporte(
                    organizacion,
                    self.areas.get(area),
                    inicio,
                    fin,
                    origen,
                    usuario=self.usuarios.get(autor),
                )
            except ia.IANoDisponible:
                self.stdout.write(self.style.WARNING("Sin IA_PROVEEDOR: no se generaron reportes."))
                break
            Reporte.objects.filter(pk=reporte.pk).update(
                fecha_generacion=self.ahora - timedelta(days=hace_dias)
            )
            hechos += 1

        programaciones = [
            ("Laboratorio", "Yadira", "SEMANAL", ["Yadira", "Karla", "Andrés"]),
            (None, "Andrés", "MENSUAL", ["Andrés", "Lucía", "Mariana", "Rubén", "Héctor", "Karla"]),
            ("Moldeo", "Mariana", "DIARIA", ["Mariana", "Tomás"]),
        ]
        for area, autor, frecuencia, destinatarios in programaciones:
            ProgramacionReporte.objects.create(
                organizacion=self.org,
                area=self.areas.get(area),
                creada_por=self.usuarios[autor],
                frecuencia=frecuencia,
                destinatarios=[self.usuarios[n].pk for n in destinatarios],
                proxima_ejecucion=servicios.desplazar(self.ahora, frecuencia, 1),
                ultima_ejecucion=self.ahora - timedelta(days=1),
            )
        self.stdout.write(f"{hechos} reportes y {len(programaciones)} programaciones.")

    def _resumen(self):
        self.stdout.write(
            self.style.SUCCESS(
                f"Datos de demostración listos. Contraseña de todas las cuentas: {self.password}"
            )
        )
        for u in Usuario.objects.select_related("rol", "organizacion").order_by(
            "organizacion__nombre", "rol_id"
        ):
            organizacion = u.organizacion.nombre if u.organizacion else "Plataforma"
            estado = "" if u.estado_usuario_id == roles.USUARIO_ACTIVO else "  (inactiva)"
            self.stdout.write(f"  {organizacion:<20} {u.rol.nombre:<28} {u.correo}{estado}")
