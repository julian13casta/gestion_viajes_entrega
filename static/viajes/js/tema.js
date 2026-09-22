/**
 * Cambio de tema claro/oscuro.
 * Persiste en localStorage y notifica a otros scripts (p. ej. Chart.js).
 * El tema por defecto es "claro" (paleta Conalca actual).
 */
(function () {
    "use strict";

    const CLAVE = "tema";
    const CLARO = "claro";
    const OSCURO = "oscuro";

    function obtenerTema() {
        try {
            const guardado = localStorage.getItem(CLAVE);
            if (guardado === OSCURO || guardado === CLARO) return guardado;
        } catch (_) { /* storage bloqueado */ }
        return CLARO;
    }

    function aplicarTema(tema) {
        document.documentElement.setAttribute("data-tema", tema);
        try {
            localStorage.setItem(CLAVE, tema);
        } catch (_) { /* ignore */ }

        document.querySelectorAll("[data-toggle-tema]").forEach((boton) => {
            const esOscuro = tema === OSCURO;
            boton.setAttribute("aria-pressed", esOscuro ? "true" : "false");
            boton.setAttribute(
                "aria-label",
                esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
            );
            boton.title = esOscuro ? "Tema claro" : "Tema oscuro";
            const iconoClaro = boton.querySelector(".icono-tema--claro");
            const iconoOscuro = boton.querySelector(".icono-tema--oscuro");
            if (iconoClaro && iconoOscuro) {
                iconoClaro.hidden = !esOscuro;
                iconoOscuro.hidden = esOscuro;
            }
        });

        window.dispatchEvent(new CustomEvent("tema-cambiado", { detail: { tema } }));
    }

    function alternarTema() {
        const actual = document.documentElement.getAttribute("data-tema") || obtenerTema();
        aplicarTema(actual === OSCURO ? CLARO : OSCURO);
    }

    // Asegura sincronía por si el script inline del <head> no corrió.
    aplicarTema(obtenerTema());

    document.addEventListener("click", (evento) => {
        const boton = evento.target.closest("[data-toggle-tema]");
        if (!boton) return;
        alternarTema();
    });
})();
