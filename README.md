# Gestión de Viajes de Vehículos

Aplicación Django para la gestión de registros de viajes de vehículos, con
tabla de registros filtrable/exportable y un dashboard interactivo con
indicadores y gráficos (Chart.js).

---

## 1. Descripción general y arquitectura

El proyecto sigue la estructura estándar de Django con **una sola app**
(`viajes`) porque el dominio es pequeño y cohesionado (un modelo central,
un modelo de auditoría asociado). Dentro de la app, la lógica está separada
en capas para que cada archivo tenga una única responsabilidad:

```
gestion_viajes/          → Configuración del proyecto (settings, urls raíz)
viajes/
  models.py               → Vehiculo, HistorialValidacion (datos)
  services.py              → Filtros, agregaciones y queries reutilizables
  exportadores.py          → Generación de CSV y Excel (openpyxl)
  forms.py                 → Formulario de login estilizado
  views.py                 → Orquestación request → services → template/JSON
  urls.py                  → Rutas de la app
  admin.py                 → Registro en el admin de Django
  management/commands/
    generar_viajes.py      → Generador de datos de prueba
templates/viajes/          → HTML (herencia con {% block %}, partials AJAX)
static/viajes/
  css/style.css             → Estilos (un único archivo, sin frameworks)
  js/main.js                → AJAX de la tabla principal
  js/dashboard.js            → Gráficos y AJAX del dashboard
  js/vendor/chart.umd.js     → Chart.js vendorizado localmente
data_export/                → Export de ejemplo (CSV y XLSX) generado por el propio sistema
screenshots/                → Capturas de cada vista
```

**Por qué esta separación:** las vistas (`views.py`) nunca arman queries a
mano; siempre llaman a `services.py`, así la misma lógica de filtrado se
reutiliza en tres lugares sin duplicarla: la tabla principal (HTML),
el endpoint AJAX de filtrado y las exportaciones CSV/Excel. Si mañana se
agrega un filtro nuevo, se toca un solo archivo (`FiltrosVehiculo` en
`services.py`) y los tres consumidores lo heredan automáticamente.

---

## 2. Instalación

```bash
# 1. Crear y activar entorno virtual
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Migraciones
python manage.py migrate

# 4. Crear un usuario administrador (o usar las credenciales de ejemplo abajo)
python manage.py createsuperuser
```

El proyecto usa **SQLite** por defecto (`db.sqlite3`), no requiere ningún
servicio externo.

---

## 3. Generar datos de prueba

```bash
python manage.py generar_viajes                 # genera 50 registros
python manage.py generar_viajes --cantidad 100   # genera 100 registros
python manage.py generar_viajes --limpiar        # borra los existentes antes de generar
```

El comando (`viajes/management/commands/generar_viajes.py`) genera datos
**coherentes, no puramente aleatorios**:

- La facturación se calcula a partir del número de entregas y una tarifa
  base que varía según `tipo_vehiculo` (Turbo > Sencillo > Eléctrico), con
  un margen de ruido aleatorio — no es un número desconectado del resto de
  la fila.
- `fecha_fin` siempre es posterior o igual a `fecha_inicio` (o `None` para
  simular un viaje aún en curso, ~15% de los casos).
- Los clientes se toman de una cartera fija de ~18 empresas (vía `Faker`,
  locale `es_CO`) para simular clientes recurrentes, en vez de un nombre
  distinto en cada fila.
- Cada registro creado también genera una entrada en `HistorialValidacion`
  con su estado inicial, para que el historial de auditoría no arranque
  vacío.

Este repositorio se entrega **con datos ya generados** (`db.sqlite3` con 70
registros) para que puedas explorar la aplicación de inmediato sin pasos
adicionales; el comando de arriba sirve para regenerarlos o ampliarlos.

---

## 4. Ejecutar el proyecto

```bash
python manage.py runserver
```

Abre `http://127.0.0.1:8000/` en el navegador.

### Credenciales de acceso de ejemplo

| Usuario  | Contraseña    | Rol                                                   |
|----------|---------------|--------------------------------------------------------|
| `admin`  | `admin12345`  | Staff — puede validar/invalidar registros y ver el admin de Django (`/admin/`) |
| `viewer` | `viewer12345` | Usuario regular — puede ver y filtrar, **no** puede validar (el checkbox aparece deshabilitado) |

(Ambos usuarios ya existen en el `db.sqlite3` incluido en esta entrega. Si
partes de una base de datos vacía, crea `admin` con `createsuperuser` como
se indicó arriba, y crea `viewer` con
`python manage.py shell -c "from django.contrib.auth import get_user_model; get_user_model().objects.create_user('viewer', password='viewer12345')"`.
Si no existe ningún usuario en la base de datos, `generar_viajes` crea
automáticamente uno de respaldo, `operador1` / `operador123`, para poder
asociar el campo `registrado_por` de los registros generados.)

### Recorrido por la aplicación

1. **Login** (`/login/`) — formulario tradicional (POST, no AJAX). Con
   credenciales inválidas muestra un mensaje de error sin recargar el
   diseño de la página.
2. **Registros** (`/` — página principal tras iniciar sesión) — tabla de
   viajes ordenada por `fecha_inicio` descendente, con filtros, validación
   por checkbox (AJAX) y exportación CSV/Excel.
3. **Dashboard** (`/dashboard/`) — indicadores (tarjetas KPI) y tres
   gráficos, con los mismos filtros de fecha/estado/tipo aplicados en vivo.
4. **Admin de Django** (`/admin/`, solo staff) — gestión CRUD completa de
   `Vehiculo` y `HistorialValidacion`, útil para corregir datos a mano.

---

## 5. Decisiones técnicas

**`select_related` / `prefetch_related`.** `Vehiculo.registrado_por` es una
FK a `User`; todas las queries de listado usan
`Vehiculo.objects.select_related("registrado_por")` (ver
`services.queryset_base`) para traer ese dato en el mismo `JOIN` y evitar
una consulta N+1 por cada fila de la tabla al mostrar la columna
"Registrado por". Se agregó también `HistorialValidacion` (FK a `Vehiculo`
y a `User`) como caso de uso real de `prefetch_related`/`select_related` en
el panel de historial del admin (`HistorialValidacionInline` con
`list_select_related`), y como bitácora de auditoría de cada cambio de
estado de validación.

**Agregaciones en la base de datos, no en Python.** Los indicadores del
dashboard (`calcular_indicadores`) y las series de los gráficos
(`serie_vehiculos_por_dia`, `serie_facturacion_por_tipo`,
`serie_distribucion_tipo`) se calculan con `aggregate()`/`annotate()` de
Django, es decir, **una consulta SQL de agregación por gráfico**, nunca
trayendo todos los objetos a Python para sumarlos ahí. Esto escala bien
incluso si la tabla crece a decenas de miles de registros.

**Dashboard: contexto de plantilla *y* endpoint JSON (híbrido, justificado).**
La carga inicial del dashboard viaja por contexto de plantilla
(`datos_json` inyectado como `window.DATOS_DASHBOARD_INICIALES`), para que
los gráficos aparezcan pintados en el primer render sin esperar un
round-trip AJAX adicional. Cada cambio de filtro posterior se resuelve
contra `/api/dashboard/` (JSON) y Chart.js actualiza los datasets con
`chart.update()` en vez de recrear los gráficos — así la experiencia es
fluida y sin parpadeo. Ambos caminos llaman exactamente a la misma función
(`services.datos_dashboard`), así que nunca pueden mostrar números
distintos entre la carga inicial y una actualización filtrada.

**Filtrado dinámico sin recargar la página (tabla principal).** El
formulario de filtros no hace un `submit` tradicional: `main.js` intercepta
los cambios (con *debounce* de 350 ms en los campos de texto/número, e
inmediato en fechas/selects), arma el query string y pide
`/api/vehiculos/`, que responde con el HTML ya renderizado de las filas
(`_tabla_filas.html`) y la paginación (`_paginacion.html`). Se optó por
devolver HTML parcial en vez de JSON crudo para no duplicar el markup de
la fila en dos lenguajes (Python/Django templates y JavaScript).

**Validación por AJAX con control de permisos real.** El endpoint
`POST /api/vehiculos/<id>/validar/` actualiza `validado` sin formulario ni
recarga, y registra el cambio en `HistorialValidacion`. Solo usuarios
`is_staff` pueden validar: el checkbox llega deshabilitado desde el
template para usuarios regulares, **y** el servidor rechaza la petición
con `403` aunque alguien intente forzarla manualmente — la restricción no
depende únicamente del JavaScript del cliente.

**Chart.js vendorizado localmente (no vía CDN).** Durante el desarrollo se
detectó que cargar Chart.js desde un CDN público puede fallar en redes con
política de salida restringida (proxies corporativos, entornos de
evaluación sin acceso a internet, etc.), dejando el dashboard en blanco sin
ningún error visible para el usuario final. Por eso el bundle UMD de
Chart.js se copió a `static/viajes/js/vendor/chart.umd.js` y se sirve como
cualquier otro estático del proyecto: el dashboard funciona sin depender de
conectividad externa.

**Paleta de colores no arbitraria.** Los tres tipos de vehículo tienen un
color fijo y consistente en toda la aplicación (badges de la tabla, dona de
distribución, barras de facturación y tabla de resumen): azul para Turbo,
naranja para Sencillo, verde/aqua para Eléctrico. El color identifica
siempre a la misma entidad — nunca se reasigna según el orden u origen de
los datos — y la paleta fue elegida por contraste y distinguibilidad (no
por gusto estético): tonos con suficiente separación perceptual entre sí
incluso para personas con daltonismo, evitando el clásico problema de
"colores que se ven casi iguales" en gráficos con muchas categorías.
También se evitó el uso de un solo color (rojo/verde) como único portador
de significado en los estados de validación: cada badge lleva además un
ícono y el texto "Validado"/"Pendiente".

**Exportación CSV + Excel con formato (no solo CSV).** El CSV incluye BOM
UTF-8 para que Excel en Windows no rompa tildes/ñ al abrirlo directamente.
El Excel (`openpyxl`) va más allá de un volcado de datos: encabezado con
relleno de color y texto en blanco, columnas con ancho ajustado al
contenido, fila congelada (`freeze_panes`) y **color de fila según estado
de validación** (igual que en la tabla web), para que el archivo sea
legible por sí mismo sin necesitar la aplicación.

**Búsqueda avanzada como sección colapsable.** Los filtros de uso más
frecuente (placa, fechas, estado, tipo) están siempre visibles; los de uso
ocasional (cliente, rango de facturación, rango de entregas) están detrás
de un `<details>` "Búsqueda avanzada" para no saturar la vista por defecto,
pero se abren automáticamente si la URL ya trae alguno de esos filtros
aplicados (por ejemplo, al recargar la página con esos parámetros en el
query string).

**`FiltrosVehiculo` como dataclass.** Parsear `request.GET` (strings) a
tipos reales (fechas, booleanos, decimales, enteros) se hace una sola vez
en `FiltrosVehiculo.desde_request`, con manejo explícito de valores
vacíos/ inválidos (nunca lanza una excepción por un query string mal
formado, simplemente ignora ese filtro). Esto evita repetir
`request.GET.get(...)` con casts dispersos por todo `views.py`.

---

## 6. Funcionalidades implementadas

### Requisitos base

- Modelo `Vehiculo` con todos los campos solicitados + modelo
  `HistorialValidacion` para trazabilidad.
- Autenticación con Django (`LoginView` con formulario propio estilizado,
  `LogoutView`, `@login_required` en todas las vistas).
- 70 registros generados por management command (`generar_viajes`), no
  cargados a mano.
- Base de datos SQLite.
- Queries optimizadas con `select_related` (ver sección 5).
- Tabla principal ordenada por `fecha_inicio` descendente, sin mostrar
  `observacion`.
- Filtros: placa (texto), rango de fecha de inicio, estado de validación.
- Validación de registros vía AJAX (checkbox, sin formulario ni recarga).
- Exportación a CSV y a Excel de los datos **filtrados actualmente**.
- Estilo propio: colores por columna/estado, tipografía y espaciado
  cuidados, sin un framework CSS de terceros.
- Dashboard con gráfico de barras (vehículos por día), tarjetas de
  indicadores (entregas, facturación) y filtros propios sincronizados con
  el gráfico y los indicadores.
- Chart.js como librería de gráficos (ver justificación en sección 5).
- Frontend con `{% extends %}`, `{% block %}`, `{% include %}`,
  `{% for %}`; validaciones básicas de formulario en cliente
  (`type="date"`, `type="number"`, `min`); funciones JS para AJAX.

### Diferenciales implementados

1. **Gráficos adicionales:** facturación por tipo de vehículo (barras
   horizontales) y distribución por tipo (dona), además del gráfico de
   barras por día — y un KPI de eficiencia (facturación promedio por
   entrega) que no estaba explícitamente pedido.
2. **Exportación CSV + Excel con formato real** (colores, encabezado
   estilizado, anchos de columna, fila congelada).
3. **Búsqueda avanzada:** por cliente, rango de facturación y rango de
   número de entregas, además de tipo de vehículo.
4. **Paginación** en la tabla principal (15 registros por página).
5. **Indicadores visuales de estado:** badges de validación con ícono +
   texto, y color de fila (verde/ámbar) según estado, tanto en la tabla
   web como en el Excel exportado.
6. **Filtrado dinámico en tiempo real**, sin recargar la página, tanto en
   la tabla principal como en el dashboard.
7. **Mejoras de UX:** notificaciones tipo *toast* al validar un registro o
   ante errores de red, indicador de "Actualizando…" durante el fetch,
   reversión automática del checkbox si la petición AJAX falla, botón
   "Limpiar filtros".
8. **Roles/permisos:** solo usuarios `is_staff` pueden validar registros
   (verificado también en el servidor, no solo ocultando el control en el
   cliente).

---

## 7. Notas de calidad de código

- Nomenclatura en español para el dominio del negocio (coherente con el
  enunciado) y en inglés solo para lo estrictamente técnico/Django.
- Manejo de errores: parseo de filtros nunca lanza excepción ante un
  query string inválido; el endpoint de validación devuelve `403` con un
  mensaje claro si el usuario no tiene permiso, y `404` si el registro no
  existe (`get_object_or_404`); el JavaScript revierte la UI si el
  `fetch` falla y muestra una notificación de error.
- `HttpResponse` de exportación usa `.iterator()` sobre el queryset para
  no cargar en memoria más filas de las necesarias mientras se escribe el
  archivo.
- Los tres archivos JS están comentados donde la lógica no es obvia a
  primera vista (debounce, delegación de eventos, CSRF).
