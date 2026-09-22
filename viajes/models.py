"""
Modelos de la app `viajes`.

`Vehiculo` es el modelo central: representa un registro de viaje/entrega
realizado por un vehículo en un rango de fechas. `HistorialValidacion` es un
modelo secundario que guarda un log de cada cambio de estado de validación,
lo que permite trazabilidad (quién validó/invalidó y cuándo) y sirve como
caso de uso real para `prefetch_related` en las vistas.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class TipoVehiculo(models.TextChoices):
    """Catálogo cerrado de tipos de vehículo (evita valores libres inconsistentes)."""

    TURBO = "Turbo", "Turbo"
    SENCILLO = "Sencillo", "Sencillo"
    ELECTRICO = "Eléctrico", "Eléctrico"


class Vehiculo(models.Model):
    """Un registro de viaje/servicio asociado a un vehículo."""

    codigo = models.CharField(
        "Código",
        max_length=20,
        unique=True,
        help_text="Identificador único del registro, p. ej. VJ-00001",
    )
    placa = models.CharField(
        "Placa",
        max_length=10,
        db_index=True,
        help_text="Placa del vehículo, p. ej. ABC123",
    )
    tipo_vehiculo = models.CharField(
        "Tipo de vehículo",
        max_length=20,
        choices=TipoVehiculo.choices,
        db_index=True,
    )
    fecha_inicio = models.DateField("Fecha de inicio", db_index=True)
    fecha_fin = models.DateField("Fecha de fin", null=True, blank=True)
    numero_entregas = models.PositiveIntegerField("Número de entregas", default=0)
    facturacion = models.DecimalField(
        "Facturación", max_digits=12, decimal_places=2, default=0
    )
    observacion = models.TextField("Observación", blank=True)
    cliente = models.CharField("Cliente", max_length=100)
    validado = models.BooleanField("Validado", default=False, db_index=True)

    # Trayecto geográfico (origen → destino) para visualizar la ruta en el mapa.
    origen = models.CharField("Origen", max_length=80, blank=True, default="")
    destino = models.CharField("Destino", max_length=80, blank=True, default="")
    origen_lat = models.FloatField("Latitud origen", null=True, blank=True)
    origen_lng = models.FloatField("Longitud origen", null=True, blank=True)
    destino_lat = models.FloatField("Latitud destino", null=True, blank=True)
    destino_lng = models.FloatField("Longitud destino", null=True, blank=True)

    # Campos de auditoría / trazabilidad.
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Registrado por",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="vehiculos_registrados",
    )
    creado_en = models.DateTimeField("Creado en", auto_now_add=True)
    actualizado_en = models.DateTimeField("Actualizado en", auto_now=True)

    class Meta:
        verbose_name = "Vehículo"
        verbose_name_plural = "Vehículos"
        ordering = ["-fecha_inicio"]
        indexes = [
            models.Index(fields=["-fecha_inicio"]),
            models.Index(fields=["validado", "-fecha_inicio"]),
        ]

    def __str__(self) -> str:
        return f"{self.codigo} · {self.placa} ({self.fecha_inicio:%Y-%m-%d})"

    @property
    def facturacion_por_entrega(self):
        """KPI de eficiencia: facturación promedio por entrega realizada."""
        if self.numero_entregas:
            return self.facturacion / self.numero_entregas
        return 0

    @property
    def dias_en_servicio(self):
        fin = self.fecha_fin or timezone.localdate()
        return max((fin - self.fecha_inicio).days, 0)


class HistorialValidacion(models.Model):
    """Log de cambios de estado de validación de un `Vehiculo`.

    Se usa con `prefetch_related` desde la vista de detalle/exportación para
    evitar una consulta adicional por cada vehículo al mostrar el último
    movimiento de validación.
    """

    vehiculo = models.ForeignKey(
        Vehiculo, on_delete=models.CASCADE, related_name="historial_validaciones"
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="validaciones_realizadas",
    )
    estado_nuevo = models.BooleanField("Nuevo estado validado")
    fecha = models.DateTimeField("Fecha del cambio", auto_now_add=True)

    class Meta:
        verbose_name = "Historial de validación"
        verbose_name_plural = "Historial de validaciones"
        ordering = ["-fecha"]

    def __str__(self) -> str:
        estado = "validado" if self.estado_nuevo else "invalidado"
        return f"{self.vehiculo.codigo} -> {estado} el {self.fecha:%Y-%m-%d %H:%M}"
