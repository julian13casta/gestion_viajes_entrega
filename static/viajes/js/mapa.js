/**
 * Modal de mapa: muestra la ruta origen → destino de un viaje
 * usando Leaflet + OSRM (ruta real por carretera) y anima un
 * marcador de camión a lo largo del recorrido.
 */
(function () {
    "use strict";

    const modal = document.getElementById("modal-ruta");
    if (!modal || typeof L === "undefined") return;

    const elMapa = document.getElementById("mapa-ruta");
    const elTitulo = document.getElementById("modal-ruta-titulo");
    const elSubtitulo = document.getElementById("modal-ruta-subtitulo");
    const elOrigen = document.getElementById("modal-ruta-origen");
    const elDestino = document.getElementById("modal-ruta-destino");
    const elDistancia = document.getElementById("modal-ruta-distancia");
    const btnReproducir = document.getElementById("btn-reproducir-ruta");

    let mapa = null;
    let capaRuta = null;
    let marcadorCamion = null;
    let marcadorOrigen = null;
    let marcadorDestino = null;
    let puntosRuta = []; // [[lat, lng], ...]
    let animacionId = null;
    let viajeActual = null;

    const iconoCamion = L.divIcon({
        className: "marcador-camion",
        html: '<div class="marcador-camion__icono" aria-hidden="true">🚚</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });
    const iconoOrigen = L.divIcon({
        className: "marcador-punto marcador-punto--origen",
        html: '<span>A</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });
    const iconoDestino = L.divIcon({
        className: "marcador-punto marcador-punto--destino",
        html: '<span>B</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });

    function notificar(mensaje, tipo) {
        const contenedor = document.getElementById("notificaciones");
        if (!contenedor) return;
        const nota = document.createElement("div");
        nota.className = `notificacion notificacion--${tipo || "info"} notificacion--visible`;
        nota.textContent = mensaje;
        contenedor.appendChild(nota);
        setTimeout(() => nota.remove(), 3200);
    }

    function asegurarMapa() {
        if (mapa) {
            setTimeout(() => mapa.invalidateSize(), 50);
            return;
        }
        mapa = L.map(elMapa, { zoomControl: true, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapa);
    }

    function limpiarCapas() {
        if (animacionId) {
            cancelAnimationFrame(animacionId);
            animacionId = null;
        }
        if (capaRuta) {
            mapa.removeLayer(capaRuta);
            capaRuta = null;
        }
        [marcadorCamion, marcadorOrigen, marcadorDestino].forEach((m) => {
            if (m) mapa.removeLayer(m);
        });
        marcadorCamion = marcadorOrigen = marcadorDestino = null;
        puntosRuta = [];
    }

    function formatearKm(metros) {
        if (!metros && metros !== 0) return "";
        const km = metros / 1000;
        return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
    }

    function formatearDuracion(segundos) {
        if (!segundos) return "";
        const h = Math.floor(segundos / 3600);
        const m = Math.round((segundos % 3600) / 60);
        if (h > 0) return `${h} h ${m} min`;
        return `${m} min`;
    }

    async function obtenerRutaOsrm(olat, olng, dlat, dlng) {
        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${olng},${olat};${dlng},${dlat}?overview=full&geometries=geojson`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("OSRM no disponible");
        const data = await resp.json();
        if (data.code !== "Ok" || !data.routes?.length) throw new Error("Sin ruta");
        const ruta = data.routes[0];
        // GeoJSON es [lng, lat] → Leaflet quiere [lat, lng]
        const coords = ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        return { coords, distancia: ruta.distance, duracion: ruta.duration };
    }

    function rutaRecta(olat, olng, dlat, dlng) {
        // Fallback: interpola puntos en línea recta para poder animar.
        const pasos = 40;
        const coords = [];
        for (let i = 0; i <= pasos; i++) {
            const t = i / pasos;
            coords.push([olat + (dlat - olat) * t, olng + (dlng - olng) * t]);
        }
        const R = 6371e3;
        const toRad = (g) => (g * Math.PI) / 180;
        const dLat = toRad(dlat - olat);
        const dLng = toRad(dlng - olng);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(olat)) * Math.cos(toRad(dlat)) * Math.sin(dLng / 2) ** 2;
        const distancia = 2 * R * Math.asin(Math.sqrt(a));
        return { coords, distancia, duracion: null };
    }

    function dibujarRuta(coords, viaje) {
        puntosRuta = coords;
        capaRuta = L.polyline(coords, {
            color: "#F78C2D",
            weight: 5,
            opacity: 0.9,
            lineJoin: "round",
        }).addTo(mapa);

        marcadorOrigen = L.marker(coords[0], { icon: iconoOrigen })
            .addTo(mapa)
            .bindPopup(`<strong>Origen</strong><br>${viaje.origen}`);
        marcadorDestino = L.marker(coords[coords.length - 1], { icon: iconoDestino })
            .addTo(mapa)
            .bindPopup(`<strong>Destino</strong><br>${viaje.destino}`);
        marcadorCamion = L.marker(coords[0], { icon: iconoCamion, zIndexOffset: 500 }).addTo(mapa);

        mapa.fitBounds(capaRuta.getBounds(), { padding: [40, 40] });
    }

    function animarRecorrido() {
        if (!puntosRuta.length || !marcadorCamion) return;
        if (animacionId) cancelAnimationFrame(animacionId);

        const total = puntosRuta.length - 1;
        const duracionMs = Math.min(12000, Math.max(4000, total * 40));
        const inicio = performance.now();
        btnReproducir.disabled = true;
        btnReproducir.textContent = "Recorriendo…";

        function frame(ahora) {
            const t = Math.min(1, (ahora - inicio) / duracionMs);
            // Ease in-out suave
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const idx = eased * total;
            const i = Math.floor(idx);
            const frac = idx - i;
            const a = puntosRuta[i];
            const b = puntosRuta[Math.min(i + 1, total)];
            const lat = a[0] + (b[0] - a[0]) * frac;
            const lng = a[1] + (b[1] - a[1]) * frac;
            marcadorCamion.setLatLng([lat, lng]);

            if (t < 1) {
                animacionId = requestAnimationFrame(frame);
            } else {
                animacionId = null;
                btnReproducir.disabled = false;
                btnReproducir.textContent = "▶ Reproducir recorrido";
                notificar("El camión llegó al destino.", "exito");
            }
        }
        animacionId = requestAnimationFrame(frame);
    }

    async function abrirModal(viaje) {
        viajeActual = viaje;
        elTitulo.textContent = `Ruta · ${viaje.codigo}`;
        elSubtitulo.textContent = `Placa ${viaje.placa}`;
        elOrigen.textContent = viaje.origen;
        elDestino.textContent = viaje.destino;
        elDistancia.textContent = "Calculando ruta…";

        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-abierto");

        asegurarMapa();
        limpiarCapas();

        let resultado;
        try {
            resultado = await obtenerRutaOsrm(viaje.olat, viaje.olng, viaje.dlat, viaje.dlng);
        } catch (_) {
            resultado = rutaRecta(viaje.olat, viaje.olng, viaje.dlat, viaje.dlng);
            notificar("Usando trayecto estimado (sin servicio de rutas).", "info");
        }

        dibujarRuta(resultado.coords, viaje);
        const partes = [formatearKm(resultado.distancia)];
        if (resultado.duracion) partes.push(formatearDuracion(resultado.duracion));
        elDistancia.textContent = partes.filter(Boolean).join(" · ");

        // Reproduce automáticamente al abrir.
        setTimeout(animarRecorrido, 400);
    }

    function cerrarModal() {
        if (animacionId) {
            cancelAnimationFrame(animacionId);
            animacionId = null;
        }
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-abierto");
        btnReproducir.disabled = false;
        btnReproducir.textContent = "▶ Reproducir recorrido";
    }

    document.addEventListener("click", (evento) => {
        const boton = evento.target.closest(".btn-ver-ruta");
        if (boton) {
            evento.preventDefault();
            abrirModal({
                codigo: boton.dataset.codigo,
                placa: boton.dataset.placa,
                origen: boton.dataset.origen,
                destino: boton.dataset.destino,
                olat: parseFloat(boton.dataset.olat),
                olng: parseFloat(boton.dataset.olng),
                dlat: parseFloat(boton.dataset.dlat),
                dlng: parseFloat(boton.dataset.dlng),
            });
            return;
        }
        if (evento.target.closest("[data-cerrar-modal]")) {
            cerrarModal();
        }
    });

    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape" && !modal.hidden) cerrarModal();
    });

    btnReproducir.addEventListener("click", () => {
        if (!viajeActual || !puntosRuta.length) return;
        if (marcadorCamion) marcadorCamion.setLatLng(puntosRuta[0]);
        animarRecorrido();
    });
})();
