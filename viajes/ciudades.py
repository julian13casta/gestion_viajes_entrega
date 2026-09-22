"""
Catálogo de ciudades colombianas con coordenadas para rutas de viajes.
Usado por el generador de datos y, en el frontend, como respaldo.
"""

# lon/lat en orden OSRM (lng, lat) se arma en el servicio/JS.
CIUDADES = {
    "Bogotá": {"lat": 4.7110, "lng": -74.0721},
    "Medellín": {"lat": 6.2476, "lng": -75.5658},
    "Cali": {"lat": 3.4516, "lng": -76.5320},
    "Barranquilla": {"lat": 10.9685, "lng": -74.7813},
    "Cartagena": {"lat": 10.3910, "lng": -75.4794},
    "Bucaramanga": {"lat": 7.1193, "lng": -73.1227},
    "Pereira": {"lat": 4.8087, "lng": -75.6906},
    "Manizales": {"lat": 5.0703, "lng": -75.5138},
    "Ibagué": {"lat": 4.4389, "lng": -75.2322},
    "Santa Marta": {"lat": 11.2408, "lng": -74.1990},
    "Villavicencio": {"lat": 4.1420, "lng": -73.6268},
    "Cúcuta": {"lat": 7.8891, "lng": -72.4967},
    "Neiva": {"lat": 2.9273, "lng": -75.2819},
    "Pasto": {"lat": 1.2136, "lng": -77.2811},
    "Armenia": {"lat": 4.5339, "lng": -75.6811},
}

NOMBRES_CIUDADES = list(CIUDADES.keys())
