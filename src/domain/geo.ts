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

export function largoRutaKm(ruta: Coordenada[]): number {
  let total = 0;
  for (let i = 1; i < ruta.length; i++) total += distanciaKm(ruta.at(i - 1)!, ruta.at(i)!);
  return total;
}

// Punto a cierta distancia desde el inicio de la ruta, para mover la grúa por las calles.
export function puntoEnRuta(ruta: Coordenada[], km: number): Coordenada {
  let resta = km;
  for (let i = 1; i < ruta.length; i++) {
    const a = ruta.at(i - 1)!;
    const b = ruta.at(i)!;
    const tramo = distanciaKm(a, b);
    if (resta <= tramo) return tramo === 0 ? b : avanzar(a, b, resta / tramo);
    resta -= tramo;
  }
  return ruta.at(-1)!;
}

// Horas pico de la capital; se usan cuando el servicio de rutas no da tráfico en vivo.
export const FACTOR_HORA_PICO = 1.6;
export function esHoraPico(hora: number): boolean {
  return (hora >= 6 && hora < 9) || (hora >= 16 && hora < 20);
}

// Parte de la ruta que falta por recorrer desde donde está el vehículo: se corta
// en el punto de la ruta más cercano a él, para que la línea se vaya "consumiendo"
// detrás de la grúa en vez de quedarse dibujada completa.
export function rutaRestante(ruta: Coordenada[], posicion: Coordenada): Coordenada[] {
  if (ruta.length < 2) return ruta;
  let mejor = 0;
  let mejorDist = Infinity;
  let mejorPunto = ruta[0];
  for (let i = 0; i < ruta.length - 1; i++) {
    const p = proyectar(ruta[i], ruta[i + 1], posicion);
    const d = distanciaKm(p, posicion);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = i;
      mejorPunto = p;
    }
  }
  // Si la grúa se salió mucho de la ruta (más de 300 m), se dibuja completa.
  if (mejorDist > 0.3) return ruta;
  return [mejorPunto, ...ruta.slice(mejor + 1)];
}

// Punto del segmento a→b más cercano a p (en grados, suficiente para tramos cortos).
function proyectar(a: Coordenada, b: Coordenada, p: Coordenada): Coordenada {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lng * cosLat, ay = a.lat, bx = b.lng * cosLat, by = b.lat, px = p.lng * cosLat, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2));
  return { lat: ay + dy * t, lng: (ax + dx * t) / cosLat };
}
