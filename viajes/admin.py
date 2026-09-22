from django.contrib import admin

from .models import HistorialValidacion, Vehiculo


class HistorialValidacionInline(admin.TabularInline):
    model = HistorialValidacion
    extra = 0
    readonly_fields = ("usuario", "estado_nuevo", "fecha")
    can_delete = False


@admin.register(Vehiculo)
class VehiculoAdmin(admin.ModelAdmin):
    list_display = (
        "codigo",
        "placa",
        "tipo_vehiculo",
        "cliente",
        "origen",
        "destino",
        "fecha_inicio",
        "fecha_fin",
        "numero_entregas",
        "facturacion",
        "validado",
    )
    list_filter = ("tipo_vehiculo", "validado", "fecha_inicio", "origen", "destino")
    search_fields = ("codigo", "placa", "cliente", "origen", "destino")
    date_hierarchy = "fecha_inicio"
    inlines = [HistorialValidacionInline]
    autocomplete_fields = ()
    list_select_related = ("registrado_por",)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("registrado_por")


@admin.register(HistorialValidacion)
class HistorialValidacionAdmin(admin.ModelAdmin):
    list_display = ("vehiculo", "usuario", "estado_nuevo", "fecha")
    list_filter = ("estado_nuevo",)
    list_select_related = ("vehiculo", "usuario")
