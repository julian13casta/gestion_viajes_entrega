from django.contrib.auth.views import LogoutView
from django.urls import path

from . import views

urlpatterns = [
    path("", views.principal, name="principal"),
    path("login/", views.LoginView2.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("exportar/csv/", views.exportar_csv_view, name="exportar_csv"),
    path("exportar/excel/", views.exportar_excel_view, name="exportar_excel"),
    path("api/vehiculos/", views.api_vehiculos, name="api_vehiculos"),
    path("api/vehiculos/<int:pk>/validar/", views.api_validar_vehiculo, name="api_validar_vehiculo"),
    path("api/dashboard/", views.api_dashboard, name="api_dashboard"),
]
