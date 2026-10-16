import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import { DISPATCH, PRICING } from "./config";

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distancia en línea recta (km). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distancia estimada por carretera (km). Mientras no haya un motor de rutas,
 * se aproxima con la línea recta por un factor de rodeo urbano.
 */
export function roadDistanceKm(a: LatLng, b: LatLng): number {
  return round2(haversineKm(a, b) * PRICING.roadFactor);
}

/** Minutos estimados para recorrer `km` a la velocidad promedio configurada. */
export function etaMinutes(km: number, speedKmh: number = DISPATCH.avgSpeedKmh): number {
  if (km <= 0) return 0;
  return Math.max(1, Math.round((km / speedKmh) * 60));
}

/** Rumbo inicial de a → b en grados (0 = norte). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

// ---------- H3 (índice hexagonal de Uber) ----------

export function toH3Cell(p: LatLng, resolution: number = DISPATCH.h3Resolution): string {
  return latLngToCell(p.lat, p.lng, resolution);
}

export function h3CellCenter(cell: string): LatLng {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

/**
 * Celdas H3 que cubren un radio alrededor de un punto. Sirve como prefiltro
 * barato antes de calcular distancias exactas.
 */
export function h3CellsAround(
  p: LatLng,
  radiusKm: number,
  resolution: number = DISPATCH.h3Resolution,
): string[] {
  const center = latLngToCell(p.lat, p.lng, resolution);
  // Distancia aproximada entre centros de hexágonos vecinos por resolución (km).
  const edgeKm = H3_EDGE_KM[resolution] ?? 0.46;
  const k = Math.max(1, Math.ceil(radiusKm / (edgeKm * 1.7)));
  return gridDisk(center, k);
}

// Longitud de arista promedio por resolución H3 (km), de la documentación de H3.
const H3_EDGE_KM: Record<number, number> = {
  5: 8.54,
  6: 3.23,
  7: 1.22,
  8: 0.46,
  9: 0.17,
  10: 0.066,
};

/**
 * Simula el avance de `from` hacia `to` una fracción del camino (0..1).
 * Útil para pruebas y para el modo demo de la app del proveedor.
 */
export function moveToward(from: LatLng, to: LatLng, fraction: number): LatLng {
  const f = Math.min(1, Math.max(0, fraction));
  return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f };
}
