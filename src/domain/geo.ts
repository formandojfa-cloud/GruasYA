import type { Coordenada } from './tipos';

const RADIO_TIERRA_KM = 6371;

export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h));
}

// Mientras no se conecte un servicio de rutas (Google Maps u OSRM), se estima la
// distancia por calle como la línea recta por un factor de rodeo típico de ciudad.
export const FACTOR_RODEO = 1.35;
export const VELOCIDAD_CIUDAD_KMH = 20;

export function distanciaRutaKm(a: Coordenada, b: Coordenada): number {
  return distanciaKm(a, b) * FACTOR_RODEO;
}

export function minutosEstimados(a: Coordenada, b: Coordenada): number {
  return (distanciaRutaKm(a, b) / VELOCIDAD_CIUDAD_KMH) * 60;
}

// Punto intermedio, para simular el avance de la grúa en la demo.
export function avanzar(desde: Coordenada, hacia: Coordenada, fraccion: number): Coordenada {
  const f = Math.min(1, Math.max(0, fraccion));
  return { lat: desde.lat + (hacia.lat - desde.lat) * f, lng: desde.lng + (hacia.lng - desde.lng) * f };
}
