"""
Capa de servicios: aquí vive la lógica de negocio (construcción de filtros,
agregaciones para el dashboard y preparación de datos para exportar) para
mantener las vistas delgadas y los templates limpios, tal como pide la
separación de responsabilidades del proyecto.
"""

from dataclasses import dataclass
from datetime import datetime

from django.db.models import Count, Q, QuerySet, Sum

from .models import Vehiculo


@dataclass
class FiltrosVehiculo:
    """Representa los filtros aplicables, ya parseados y con tipos correctos."""

    placa: str = ""
    fecha_desde: "datetime.date | None" = None
    fecha_hasta: "datetime.date | None" = None
    validado: "bool | None" = None  # None = todos, True/False = filtra
    cliente: str = ""
    facturacion_min: "float | None" = None
    facturacion_max: "float | None" = None
    entregas_min: "int | None" = None
    entregas_max: "int | None" = None
    tipo_vehiculo: str = ""

    @classmethod
    def desde_request(cls, params) -> "FiltrosVehiculo":
        """Construye los filtros a partir de un QueryDict (request.GET)."""

        def parse_fecha(valor):
            if not valor:
                return None
            try:
                return datetime.strptime(valor, "%Y-%m-%d").date()
            except ValueError:
                return None

        def parse_decimal(valor):
            if valor in (None, ""):
                return None
            try:
                return float(valor)
            except ValueError:
                return None

        def parse_int(valor):
            if valor in (None, ""):
                return None
            try:
                return int(valor)
            except ValueError:
                return None

        validado_raw = params.get("validado", "")
        validado = {"1": True, "0": False}.get(validado_raw, None)

        return cls(
            placa=params.get("placa", "").strip(),
            fecha_desde=parse_fecha(params.get("fecha_desde")),
            fecha_hasta=parse_fecha(params.get("fecha_hasta")),
            validado=validado,
            cliente=params.get("cliente", "").strip(),
            facturacion_min=parse_decimal(params.get("facturacion_min")),
            facturacion_max=parse_decimal(params.get("facturacion_max")),
            entregas_min=parse_int(params.get("entregas_min")),
            entregas_max=parse_int(params.get("entregas_max")),
            tipo_vehiculo=params.get("tipo_vehiculo", "").strip(),
        )


def aplicar_filtros(queryset: QuerySet, filtros: FiltrosVehiculo) -> QuerySet:
    """Aplica los filtros de `FiltrosVehiculo` sobre un queryset de Vehiculo."""

    if filtros.placa:
        queryset = queryset.filter(placa__icontains=filtros.placa)
    if filtros.fecha_desde:
        queryset = queryset.filter(fecha_inicio__gte=filtros.fecha_desde)
    if filtros.fecha_hasta:
        queryset = queryset.filter(fecha_inicio__lte=filtros.fecha_hasta)
    if filtros.validado is not None:
        queryset = queryset.filter(validado=filtros.validado)
    if filtros.cliente:
        queryset = queryset.filter(cliente__icontains=filtros.cliente)
    if filtros.facturacion_min is not None:
        queryset = queryset.filter(facturacion__gte=filtros.facturacion_min)
    if filtros.facturacion_max is not None:
        queryset = queryset.filter(facturacion__lte=filtros.facturacion_max)
    if filtros.entregas_min is not None:
        queryset = queryset.filter(numero_entregas__gte=filtros.entregas_min)
    if filtros.entregas_max is not None:
        queryset = queryset.filter(numero_entregas__lte=filtros.entregas_max)
    if filtros.tipo_vehiculo:
        queryset = queryset.filter(tipo_vehiculo=filtros.tipo_vehiculo)
    return queryset


def queryset_base() -> QuerySet:
    """Queryset base optimizado: trae `registrado_por` en el mismo JOIN
    (select_related) para evitar una consulta extra por fila al pintar
    quién registró cada vehículo."""

    return Vehiculo.objects.select_related("registrado_por")


def obtener_vehiculos_filtrados(params) -> QuerySet:
    filtros = FiltrosVehiculo.desde_request(params)
    return aplicar_filtros(queryset_base(), filtros).order_by("-fecha_inicio", "-id")


def calcular_indicadores(queryset: QuerySet) -> dict:
    """Calcula los indicadores (KPIs) de tarjetas del dashboard con una sola
    consulta de agregación (evita traer todos los objetos a Python)."""

    agregados = queryset.aggregate(
        total_registros=Count("id"),
        total_entregas=Sum("numero_entregas"),
        total_facturacion=Sum("facturacion"),
        total_validados=Count("id", filter=Q(validado=True)),
    )
    total_registros = agregados["total_registros"] or 0
    total_entregas = agregados["total_entregas"] or 0
    total_facturacion = agregados["total_facturacion"] or 0
    total_validados = agregados["total_validados"] or 0

    facturacion_por_entrega = (
        (total_facturacion / total_entregas) if total_entregas else 0
    )
    porcentaje_validados = (
        (total_validados / total_registros * 100) if total_registros else 0
    )

    return {
        "total_registros": total_registros,
        "total_entregas": total_entregas,
        # Se castea a float explícitamente: Decimal no es serializable a
        # JSON por defecto y este diccionario viaja tanto por contexto de
        # plantilla (json.dumps) como por el endpoint AJAX (JsonResponse).
        "total_facturacion": float(total_facturacion),
        "total_validados": total_validados,
        "porcentaje_validados": round(porcentaje_validados, 1),
        "facturacion_por_entrega": round(float(facturacion_por_entrega), 2),
    }


def serie_vehiculos_por_dia(queryset: QuerySet) -> list[dict]:
    """Cantidad de vehículos (registros) agrupados por fecha_inicio, para el
    gráfico de barras principal del dashboard."""

    # `fecha_inicio` ya es un DateField (no DateTimeField), así que se agrupa
    # directamente sobre él: no hace falta truncar. (Se evita `TruncDate`
    # aquí a propósito porque, con USE_TZ=True, added tzinfo params rompen
    # en SQLite al aplicarse sobre un DateField en vez de un DateTimeField.)
    filas = (
        queryset.values("fecha_inicio")
        .annotate(cantidad=Count("id"))
        .order_by("fecha_inicio")
    )
    return [{"fecha": fila["fecha_inicio"].isoformat(), "cantidad": fila["cantidad"]} for fila in filas]


def serie_facturacion_por_tipo(queryset: QuerySet) -> list[dict]:
    """Facturación total agrupada por tipo de vehículo (gráfico adicional)."""

    filas = (
        queryset.values("tipo_vehiculo")
        .annotate(total=Sum("facturacion"))
        .order_by("-total")
    )
    return [
        {"tipo": fila["tipo_vehiculo"], "total": float(fila["total"] or 0)} for fila in filas
    ]


def serie_distribucion_tipo(queryset: QuerySet) -> list[dict]:
    """Cantidad de registros por tipo de vehículo (gráfico de distribución)."""

    filas = queryset.values("tipo_vehiculo").annotate(cantidad=Count("id")).order_by("-cantidad")
    return [{"tipo": fila["tipo_vehiculo"], "cantidad": fila["cantidad"]} for fila in filas]


def datos_dashboard(params) -> dict:
    """Empaqueta todo lo que necesita el dashboard (KPIs + series de los 3
    gráficos) a partir de los filtros recibidos. Usado tanto por la vista
    inicial (contexto de plantilla) como por el endpoint JSON de AJAX, para
    que ambos caminos devuelvan exactamente los mismos números."""

    queryset = obtener_vehiculos_filtrados(params)
    return {
        "indicadores": calcular_indicadores(queryset),
        "por_dia": serie_vehiculos_por_dia(queryset),
        "facturacion_por_tipo": serie_facturacion_por_tipo(queryset),
        "distribucion_tipo": serie_distribucion_tipo(queryset),
    }
