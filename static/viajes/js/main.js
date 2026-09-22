/**
 * Lógica de la página principal: filtrado dinámico (AJAX, sin recargar),
 * paginación por AJAX, validación de registros por AJAX y notificaciones.
 */

(function () {
    "use strict";

    const formFiltros = document.getElementById("form-filtros");
    const cuerpoTabla = document.getElementById("cuerpo-tabla");
    const contenedorPaginacion = document.getElementById("contenedor-paginacion");
    const textoResultados = document.getElementById("texto-resultados");
    const indicadorCarga = document.getElementById("indicador-carga");
    const enlaceCsv = document.getElementById("enlace-export-csv");
    const enlaceExcel = document.getElementById("enlace-export-excel");
    const btnLimpiar = document.getElementById("btn-limpiar-filtros");

    if (!formFiltros) return; // esta página no aplica (p.ej. dashboard)

    let paginaActual = 1;
    let temporizadorDebounce = null;

    function obtenerCookie(nombre) {
        const valor = `; ${document.cookie}`;
        const partes = valor.split(`; ${nombre}=`);
        if (partes.length === 2) return partes.pop().split(";").shift();
        return null;
    }
    const CSRF_TOKEN = obtenerCookie("csrftoken");

    function mostrarNotificacion(mensaje, tipo = "info") {
        const contenedor = document.getElementById("notificaciones");
        const nota = document.createElement("div");
        nota.className = `notificacion notificacion--${tipo}`;
        nota.textContent = mensaje;
        contenedor.appendChild(nota);
        requestAnimationFrame(() => nota.classList.add("notificacion--visible"));
        setTimeout(() => {
            nota.classList.remove("notificacion--visible");
            setTimeout(() => nota.remove(), 300);
        }, 3200);
    }

    function construirParametros() {
        const datos = new FormData(formFiltros);
        const params = new URLSearchParams();
        for (const [clave, valor] of datos.entries()) {
            if (valor !== null && String(valor).trim() !== "") {
                params.append(clave, valor);
            }
        }
        return params;
    }

    function actualizarEnlacesExportacion(params) {
        const query = params.toString();
        enlaceCsv.href = `${enlaceCsv.dataset.base || enlaceCsv.href.split("?")[0]}${query ? "?" + query : ""}`;
        enlaceExcel.href = `${enlaceExcel.dataset.base || enlaceExcel.href.split("?")[0]}${query ? "?" + query : ""}`;
    }
    // Guardamos la URL base una sola vez (antes de añadir querystring).
    enlaceCsv.dataset.base = enlaceCsv.href;
    enlaceExcel.dataset.base = enlaceExcel.href;

    async function actualizarTabla(pagina = 1) {
        paginaActual = pagina;
        const params = construirParametros();
        actualizarEnlacesExportacion(params);
        params.set("page", pagina);

        indicadorCarga.classList.remove("oculto");
        try {
            const resp = await fetch(`/api/vehiculos/?${params.toString()}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
            });
            if (!resp.ok) throw new Error("Error al consultar los registros.");
            const datos = await resp.json();

            cuerpoTabla.innerHTML = datos.html_filas;
            contenedorPaginacion.innerHTML = datos.html_paginacion;
            textoResultados.textContent = `${datos.total_filtrado} registro(s) encontrado(s)`;
        } catch (error) {
            mostrarNotificacion("No se pudieron cargar los registros. Intenta de nuevo.", "error");
        } finally {
            indicadorCarga.classList.add("oculto");
        }
    }

    function conDebounce(fn, espera) {
        return (...args) => {
            clearTimeout(temporizadorDebounce);
            temporizadorDebounce = setTimeout(() => fn(...args), espera);
        };
    }
    const actualizarConDebounce = conDebounce(() => actualizarTabla(1), 350);

    // Campos de texto/número: filtran mientras el usuario escribe (con debounce).
    formFiltros.querySelectorAll('input[type="text"], input[type="number"]').forEach((campo) => {
        campo.addEventListener("input", actualizarConDebounce);
    });
    // Fechas, selects: filtran de inmediato al cambiar.
    formFiltros.querySelectorAll('input[type="date"], select').forEach((campo) => {
        campo.addEventListener("change", () => actualizarTabla(1));
    });
    formFiltros.addEventListener("submit", (evento) => {
        evento.preventDefault();
        actualizarTabla(1);
    });

    btnLimpiar.addEventListener("click", () => {
        formFiltros.reset();
        actualizarTabla(1);
    });

    // Paginación: delegación de eventos porque el contenido se reemplaza.
    contenedorPaginacion.addEventListener("click", (evento) => {
        const boton = evento.target.closest(".boton-pagina");
        if (!boton || boton.disabled) return;
        actualizarTabla(Number(boton.dataset.pagina));
    });

    // Validación de un registro vía AJAX (sin formulario, sin recarga).
    cuerpoTabla.addEventListener("change", async (evento) => {
        const checkbox = evento.target.closest(".chk-validar");
        if (!checkbox) return;

        const id = checkbox.dataset.id;
        const nuevoEstado = checkbox.checked;
        const fila = checkbox.closest("tr");
        const pastilla = fila.querySelector(".pastilla-estado");

        checkbox.disabled = true;
        try {
            const resp = await fetch(`/api/vehiculos/${id}/validar/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": CSRF_TOKEN,
                    "X-Requested-With": "XMLHttpRequest",
                },
                body: JSON.stringify({ validado: nuevoEstado }),
            });
            if (!resp.ok) throw new Error("No autorizado o error del servidor");
            const datos = await resp.json();

            fila.classList.toggle("fila-vehiculo--validado", datos.validado);
            fila.classList.toggle("fila-vehiculo--pendiente", !datos.validado);
            pastilla.classList.toggle("pastilla-estado--ok", datos.validado);
            pastilla.classList.toggle("pastilla-estado--pendiente", !datos.validado);
            pastilla.textContent = datos.validado ? "✓ Validado" : "⏳ Pendiente";

            mostrarNotificacion(
                datos.validado ? "Registro validado correctamente." : "Registro marcado como pendiente.",
                "exito"
            );
        } catch (error) {
            checkbox.checked = !nuevoEstado; // revertimos el cambio visual
            mostrarNotificacion("No se pudo actualizar la validación.", "error");
        } finally {
            checkbox.disabled = false;
        }
    });

    // Estado inicial de los enlaces de exportación con los filtros ya presentes en la URL.
    actualizarEnlacesExportacion(construirParametros());
})();
