"""
Management command para poblar la base de datos con registros de viajes
aleatorios pero *coherentes*: la facturación guarda relación con el número
de entregas y el tipo de vehículo, las fechas de fin son posteriores a las
de inicio, y las placas/clientes siguen formatos realistas.

Uso:
    python manage.py generar_viajes                # genera 50 registros
    python manage.py generar_viajes --cantidad 120  # genera 120 registros
    python manage.py generar_viajes --limpiar       # borra los existentes antes
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from faker import Faker

from viajes.ciudades import CIUDADES, NOMBRES_CIUDADES
from viajes.models import HistorialValidacion, TipoVehiculo, Vehiculo

fake = Faker("es_CO")

# Tarifa base aproximada por entrega según el tipo de vehículo (en COP),
# usada únicamente para que la facturación generada sea coherente con el
# número de entregas y el tipo de vehículo, no un valor puramente al azar.
TARIFA_BASE_POR_TIPO = {
    TipoVehiculo.TURBO: (180_000, 260_000),
    TipoVehiculo.SENCILLO: (90_000, 150_000),
    TipoVehiculo.ELECTRICO: (60_000, 110_000),
}

OBSERVACIONES_POSIBLES = [
    "Entrega sin novedad.",
    "Retraso menor por tráfico en la vía principal.",
    "Cliente solicitó reprogramación de una entrega.",
    "Vehículo presentó novedad mecánica leve, resuelta en sitio.",
    "Ruta optimizada, entregas completadas antes de lo previsto.",
    "Pendiente confirmación de recibido por parte del cliente.",
    "",  # una observación vacía es un caso válido y común
    "",
]


def generar_placa() -> str:
    letras = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ", k=3))
    numeros = "".join(random.choices("0123456789", k=3))
    return f"{letras}{numeros}"


class Command(BaseCommand):
    help = "Genera registros de viajes de vehículos aleatorios pero coherentes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--cantidad",
            type=int,
            default=50,
            help="Cantidad de registros a generar (por defecto 50).",
        )
        parser.add_argument(
            "--limpiar",
            action="store_true",
            help="Elimina los registros existentes antes de generar los nuevos.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        cantidad = options["cantidad"]
        limpiar = options["limpiar"]

        if limpiar:
            borrados, _ = Vehiculo.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Se eliminaron {borrados} registros previos."))

        User = get_user_model()
        usuarios = list(User.objects.all())
        if not usuarios:
            # Aseguramos al menos un usuario para poder asociar 'registrado_por'.
            usuarios = [
                User.objects.create_user(
                    username="operador1", password="operador123", is_staff=True
                )
            ]
            self.stdout.write(self.style.WARNING("No había usuarios: se creó 'operador1'."))

        ultimo_codigo = (
            Vehiculo.objects.count()
        )
        clientes = [fake.company() for _ in range(18)]  # cartera fija de clientes recurrentes

        hoy = timezone.localdate()
        nuevos = []
        historiales = []

        for i in range(cantidad):
            tipo = random.choice(list(TipoVehiculo.values))
            fecha_inicio = hoy - timedelta(days=random.randint(0, 120))
            duracion = random.randint(0, 6)
            # ~15% de los registros siguen en curso (sin fecha_fin).
            fecha_fin = None if random.random() < 0.15 else fecha_inicio + timedelta(days=duracion)

            entregas = random.randint(1, 40)
            tarifa_min, tarifa_max = TARIFA_BASE_POR_TIPO[tipo]
            tarifa_unitaria = random.uniform(tarifa_min, tarifa_max)
            # Pequeño ruido adicional para que no sea un producto perfecto.
            facturacion = Decimal(str(round(entregas * tarifa_unitaria * random.uniform(0.95, 1.08), 2)))

            validado = random.random() < 0.55

            codigo = f"VJ-{ultimo_codigo + i + 1:05d}"
            ciudad_origen, ciudad_destino = random.sample(NOMBRES_CIUDADES, 2)
            coords_o = CIUDADES[ciudad_origen]
            coords_d = CIUDADES[ciudad_destino]
            # Ligera variación para que no todos los puntos caigan exactamente
            # en el centro de la ciudad (simula bodegas/puntos de entrega).
            ruido = lambda: random.uniform(-0.04, 0.04)
            vehiculo = Vehiculo(
                codigo=codigo,
                placa=generar_placa(),
                tipo_vehiculo=tipo,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                numero_entregas=entregas,
                facturacion=facturacion,
                observacion=random.choice(OBSERVACIONES_POSIBLES),
                cliente=random.choice(clientes),
                validado=validado,
                registrado_por=random.choice(usuarios),
                origen=ciudad_origen,
                destino=ciudad_destino,
                origen_lat=coords_o["lat"] + ruido(),
                origen_lng=coords_o["lng"] + ruido(),
                destino_lat=coords_d["lat"] + ruido(),
                destino_lng=coords_d["lng"] + ruido(),
            )
            nuevos.append(vehiculo)

        Vehiculo.objects.bulk_create(nuevos)

        # El historial se crea en un segundo paso porque bulk_create no
        # garantiza el `pk` de vuelta en todas las bases de datos; para
        # SQLite sí lo hace, pero mantenemos el patrón explícito y portable
        # consultando de nuevo los objetos recién creados.
        creados = Vehiculo.objects.filter(codigo__in=[v.codigo for v in nuevos])
        for vehiculo in creados:
            historiales.append(
                HistorialValidacion(
                    vehiculo=vehiculo,
                    usuario=vehiculo.registrado_por,
                    estado_nuevo=vehiculo.validado,
                )
            )
        HistorialValidacion.objects.bulk_create(historiales)

        self.stdout.write(
            self.style.SUCCESS(
                f"Se generaron {len(nuevos)} registros de viajes (+{len(historiales)} "
                "entradas de historial de validación)."
            )
        )
