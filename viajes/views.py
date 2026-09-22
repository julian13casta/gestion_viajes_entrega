"""
Vistas de la app `viajes`.

Se mantienen deliberadamente delgadas: parsean el request, delegan en
`services.py` la construcción de queries/agregaciones, y delegan en
`exportadores.py` la generación de archivos. Esto evita duplicar lógica de
filtrado entre la vista HTML, el endpoint AJAX y las exportaciones.
"""

import json

from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView
from django.core.paginator import Paginator
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET, require_POST

from .exportadores import exportar_csv, exportar_excel
from .forms import LoginForm
from .models import HistorialValidacion, TipoVehiculo, Vehiculo
from .services import datos_dashboard, obtener_vehiculos_filtrados


class LoginView2(LoginView):
    """Login tradicional (form POST, no AJAX) usando el formulario estilizado."""

    template_name = "viajes/login.html"
    authentication_form = LoginForm
    redirect_authenticated_user = True


def _paginar(queryset, request, por_pagina=15):
    paginator = Paginator(queryset, por_pagina)
    numero_pagina = request.GET.get("page", 1)
    return paginator.get_page(numero_pagina)


@login_required
def principal(request):
    """Página principal: tabla de registros con filtros, paginación y
    exportación. La carga inicial es server-rendered (rápida, indexable,
    funciona sin JavaScript); los filtros posteriores se aplican vía AJAX
    contra `api_vehiculos` sin recargar la página (ver static/viajes/js/main.js)."""

    vehiculos = obtener_vehiculos_filtrados(request.GET)
    pagina = _paginar(vehiculos, request)

    contexto = {
        "pagina": pagina,
        "tipos_vehiculo": TipoVehiculo.choices,
        "filtros_actuales": request.GET,
        "es_staff": request.user.is_staff,
        "total_filtrado": vehiculos.count(),
    }
    return render(request, "viajes/principal.html", contexto)


@login_required
@require_GET
def api_vehiculos(request):
    """Endpoint AJAX que devuelve la tabla ya filtrada/paginada como HTML
    parcial (evita duplicar el markup de la fila en JS) más metadatos de
    paginación en JSON. Se usa para el filtrado dinámico sin recarga."""

    vehiculos = obtener_vehiculos_filtrados(request.GET)
    pagina = _paginar(vehiculos, request)

    html_filas = render_to_string(
        "viajes/_tabla_filas.html",
        {"pagina": pagina, "es_staff": request.user.is_staff},
        request=request,
    )
    html_paginacion = render_to_string(
        "viajes/_paginacion.html",
        {"pagina": pagina, "filtros_actuales": request.GET},
        request=request,
    )
    return JsonResponse(
        {
            "html_filas": html_filas,
            "html_paginacion": html_paginacion,
            "total_filtrado": vehiculos.count(),
        }
    )


@login_required
@require_POST
def api_validar_vehiculo(request, pk):
    """Alterna (o fija) el estado `validado` de un vehículo vía AJAX.

    Solo usuarios `is_staff` pueden validar registros (control simple de
    permisos/roles): un usuario regular puede ver la tabla pero el
    checkbox llega deshabilitado desde el template y, aunque intentara
    forzar la petición, el servidor la rechaza igualmente.
    """

    if not request.user.is_staff:
        return HttpResponseForbidden(
            json.dumps({"error": "No tienes permiso para validar registros."}),
            content_type="application/json",
        )

    vehiculo = get_object_or_404(Vehiculo, pk=pk)
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        payload = {}

    nuevo_estado = payload.get("validado")
    if nuevo_estado is None:
        # Sin valor explícito: alterna el estado actual.
        nuevo_estado = not vehiculo.validado
    vehiculo.validado = bool(nuevo_estado)
    vehiculo.save(update_fields=["validado", "actualizado_en"])

    HistorialValidacion.objects.create(
        vehiculo=vehiculo, usuario=request.user, estado_nuevo=vehiculo.validado
    )

    return JsonResponse({"id": vehiculo.id, "validado": vehiculo.validado})


@login_required
def exportar_csv_view(request):
    vehiculos = obtener_vehiculos_filtrados(request.GET)
    return exportar_csv(vehiculos)


@login_required
def exportar_excel_view(request):
    vehiculos = obtener_vehiculos_filtrados(request.GET)
    return exportar_excel(vehiculos)


@login_required
def dashboard(request):
    """Vista de dashboard. Los datos iniciales viajan por contexto de
    plantilla (primer pintado inmediato, sin esperar un round-trip AJAX);
    los cambios de filtro posteriores se resuelven contra `api_dashboard`
    en JSON y Chart.js redibuja sin recargar la página. Ver justificación
    completa en el README (sección "Decisiones técnicas")."""

    datos = datos_dashboard(request.GET)
    contexto = {
        "datos_json": json.dumps(datos),
        "indicadores": datos["indicadores"],
        "tipos_vehiculo": TipoVehiculo.choices,
        "filtros_actuales": request.GET,
    }
    return render(request, "viajes/dashboard.html", contexto)


@login_required
@require_GET
def api_dashboard(request):
    return JsonResponse(datos_dashboard(request.GET))
