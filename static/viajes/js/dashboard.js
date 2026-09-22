/**
 * Dashboard: dibuja los gráficos con Chart.js a partir de los datos
 * iniciales inyectados por el template (contexto de Django) y los
 * vuelve a pedir a `/api/dashboard/` (JSON) cada vez que cambia un
 * filtro, sin recargar la página. Ver README → "Decisiones técnicas"
 * para la justificación de este enfoque híbrido (contexto + JSON).
 *
 * Paleta: colores categóricos fijos por tipo de vehículo (nunca se
 * reasignan según el orden/posición de los datos), tal como indica la
 * guía de visualización del proyecto: el color sigue a la entidad, no
 * a su posición en el ranking.
 */

(function () {
    "use strict";

    function cssVar(nombre, fallback) {
        const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
        return valor || fallback;
    }

    function coloresTema() {
        const oscuro = document.documentElement.getAttribute("data-tema") === "oscuro";
        return {
            porTipo: {
                Turbo: oscuro ? "#A8B4C4" : "#2F374A",
                Sencillo: "#F78C2D",
                Eléctrico: oscuro ? "#4CAF75" : "#2E7D4F",
            },
            muted: cssVar("--chart-texto", "#58615F"),
            grid: cssVar("--chart-grid", "#E2E5E7"),
            superficie: cssVar("--chart-superficie", "#FFFFFF"),
            tooltip: oscuro ? "#0F131A" : "#2F374A",
            barra: "#F78C2D",
        };
    }

    let colores = coloresTema();

    Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    Chart.defaults.color = colores.muted;
    Chart.defaults.plugins.tooltip.backgroundColor = colores.tooltip;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;

    const formateadorMoneda = new Intl.NumberFormat("es-CO", {
        style: "currency", currency: "COP", maximumFractionDigits: 0,
    });
    const formateadorNumero = new Intl.NumberFormat("es-CO");

    function formatearFechaCorta(iso) {
        const [anio, mes, dia] = iso.split("-");
        return `${dia}/${mes}`;
    }

    // ---------- Gráfico 1: vehículos por día (barras, un solo hue) ----------
    const ctxDia = document.getElementById("grafico-por-dia").getContext("2d");
    const graficoPorDia = new Chart(ctxDia, {
        type: "bar",
        data: {
            labels: [],
            datasets: [{
                label: "Vehículos",
                data: [],
                backgroundColor: colores.barra,
                borderRadius: 4,
                maxBarThickness: 28,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => `Fecha ${items[0].label}`,
                        label: (item) => `${item.formattedValue} vehículo(s)`,
                    },
                },
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: colores.muted, maxRotation: 0, autoSkip: true } },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: colores.muted },
                    grid: { color: colores.grid },
                },
            },
        },
    });

    // ---------- Gráfico 2: distribución por tipo (donut) ----------
    const ctxDistribucion = document.getElementById("grafico-distribucion-tipo").getContext("2d");
    const graficoDistribucion = new Chart(ctxDistribucion, {
        type: "doughnut",
        data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, borderColor: colores.superficie }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: {
                legend: { position: "bottom", labels: { boxWidth: 12, padding: 14, color: colores.muted } },
                tooltip: {
                    callbacks: {
                        label: (item) => `${item.label}: ${item.formattedValue} registro(s)`,
                    },
                },
            },
        },
    });

    // ---------- Gráfico 3: facturación por tipo (barras horizontales) ----------
    const ctxFacturacion = document.getElementById("grafico-facturacion-tipo").getContext("2d");
    const graficoFacturacion = new Chart(ctxFacturacion, {
        type: "bar",
        data: { labels: [], datasets: [{ label: "Facturación", data: [], backgroundColor: [], borderRadius: 4 }] },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => formateadorMoneda.format(item.raw),
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: colores.muted, callback: (valor) => formateadorMoneda.format(valor) },
                    grid: { color: colores.grid },
                },
                y: { grid: { display: false }, ticks: { color: colores.muted } },
            },
        },
    });

    let ultimoDistribucion = [];
    let ultimoFacturacion = [];

    function aplicarColoresGraficos() {
        colores = coloresTema();
        Chart.defaults.color = colores.muted;
        Chart.defaults.plugins.tooltip.backgroundColor = colores.tooltip;

        graficoPorDia.data.datasets[0].backgroundColor = colores.barra;
        graficoPorDia.options.scales.x.ticks.color = colores.muted;
        graficoPorDia.options.scales.y.ticks.color = colores.muted;
        graficoPorDia.options.scales.y.grid.color = colores.grid;

        graficoDistribucion.data.datasets[0].borderColor = colores.superficie;
        graficoDistribucion.options.plugins.legend.labels.color = colores.muted;
        if (ultimoDistribucion.length) {
            graficoDistribucion.data.datasets[0].backgroundColor = ultimoDistribucion.map(
                (d) => colores.porTipo[d.tipo] || colores.muted
            );
        }

        graficoFacturacion.options.scales.x.ticks.color = colores.muted;
        graficoFacturacion.options.scales.x.grid.color = colores.grid;
        graficoFacturacion.options.scales.y.ticks.color = colores.muted;
        if (ultimoFacturacion.length) {
            graficoFacturacion.data.datasets[0].backgroundColor = ultimoFacturacion.map(
                (f) => colores.porTipo[f.tipo] || colores.muted
            );
        }

        graficoPorDia.update("none");
        graficoDistribucion.update("none");
        graficoFacturacion.update("none");
        if (ultimoDistribucion.length) {
            renderizarTablaResumen(ultimoDistribucion, ultimoFacturacion);
        }
    }

    function renderizarKpis(indicadores) {
        document.getElementById("kpi-registros").textContent = formateadorNumero.format(indicadores.total_registros);
        document.getElementById("kpi-entregas").textContent = formateadorNumero.format(indicadores.total_entregas);
        document.getElementById("kpi-facturacion").textContent = formateadorMoneda.format(indicadores.total_facturacion);
        document.getElementById("kpi-porcentaje").textContent = `${indicadores.porcentaje_validados}%`;
        document.getElementById("kpi-eficiencia").textContent = formateadorMoneda.format(indicadores.facturacion_por_entrega);
    }

    function renderizarGraficoPorDia(porDia) {
        graficoPorDia.data.labels = porDia.map((f) => formatearFechaCorta(f.fecha));
        graficoPorDia.data.datasets[0].data = porDia.map((f) => f.cantidad);
        graficoPorDia.update();
    }

    function renderizarDistribucion(distribucion) {
        ultimoDistribucion = distribucion;
        graficoDistribucion.data.labels = distribucion.map((d) => d.tipo);
        graficoDistribucion.data.datasets[0].data = distribucion.map((d) => d.cantidad);
        graficoDistribucion.data.datasets[0].backgroundColor = distribucion.map(
            (d) => colores.porTipo[d.tipo] || colores.muted
        );
        graficoDistribucion.update();
    }

    function renderizarFacturacionTipo(facturacionPorTipo) {
        ultimoFacturacion = facturacionPorTipo;
        graficoFacturacion.data.labels = facturacionPorTipo.map((f) => f.tipo);
        graficoFacturacion.data.datasets[0].data = facturacionPorTipo.map((f) => f.total);
        graficoFacturacion.data.datasets[0].backgroundColor = facturacionPorTipo.map(
            (f) => colores.porTipo[f.tipo] || colores.muted
        );
        graficoFacturacion.update();
    }

    function renderizarTablaResumen(distribucion, facturacionPorTipo) {
        const facturacionPorNombre = Object.fromEntries(facturacionPorTipo.map((f) => [f.tipo, f.total]));
        const cuerpo = document.getElementById("cuerpo-resumen-tipo");
        if (!distribucion.length) {
            cuerpo.innerHTML = '<tr><td colspan="3" class="fila-vacia">Sin datos para los filtros actuales.</td></tr>';
            return;
        }
        cuerpo.innerHTML = distribucion.map((d) => {
            const color = colores.porTipo[d.tipo] || colores.muted;
            return `
            <tr>
                <td><span class="etiqueta-tipo" style="background:${color}22;color:${color}">${d.tipo}</span></td>
                <td class="celda-numero">${formateadorNumero.format(d.cantidad)}</td>
                <td class="celda-numero">${formateadorMoneda.format(facturacionPorNombre[d.tipo] || 0)}</td>
            </tr>`;
        }).join("");
    }

    function renderizarTodo(datos) {
        renderizarKpis(datos.indicadores);
        renderizarGraficoPorDia(datos.por_dia);
        renderizarDistribucion(datos.distribucion_tipo);
        renderizarFacturacionTipo(datos.facturacion_por_tipo);
        renderizarTablaResumen(datos.distribucion_tipo, datos.facturacion_por_tipo);
    }

    window.addEventListener("tema-cambiado", aplicarColoresGraficos);

    // Primer pintado: usa los datos que ya vinieron con la página (sin round-trip).
    renderizarTodo(window.DATOS_DASHBOARD_INICIALES);

    // ---------- Filtros del dashboard (AJAX) ----------
    const formFiltros = document.getElementById("form-filtros-dash");
    const btnLimpiar = document.getElementById("btn-limpiar-filtros-dash");

    async function actualizarDashboard() {
        const datosForm = new FormData(formFiltros);
        const params = new URLSearchParams();
        for (const [clave, valor] of datosForm.entries()) {
            if (String(valor).trim() !== "") params.append(clave, valor);
        }
        try {
            const resp = await fetch(`/api/dashboard/?${params.toString()}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
            });
            if (!resp.ok) throw new Error("Error al consultar el dashboard.");
            renderizarTodo(await resp.json());
        } catch (error) {
            const contenedor = document.getElementById("notificaciones");
            const nota = document.createElement("div");
            nota.className = "notificacion notificacion--error notificacion--visible";
            nota.textContent = "No se pudo actualizar el dashboard.";
            contenedor.appendChild(nota);
            setTimeout(() => nota.remove(), 3200);
        }
    }

    formFiltros.querySelectorAll("input, select").forEach((campo) => {
        campo.addEventListener("change", actualizarDashboard);
    });
    btnLimpiar.addEventListener("click", () => {
        formFiltros.reset();
        actualizarDashboard();
    });
})();
