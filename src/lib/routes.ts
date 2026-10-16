/**
 * Rutas por calles (prototipo GruaYa `src/data/rutas.ts`): Mapbox con tráfico
 * si hay `MAPBOX_TOKEN`; si no, OSRM público (gratis, sin tráfico) con ajuste
 * por hora pico; si ninguno responde, línea recta × factor de rodeo a la
 * velocidad promedio, para no dejar al conductor sin precio.
 *
 * Caché de 5 min por par de puntos redondeados. `ROUTES_PROVIDER=estimada`
 * desactiva la red (pruebas, entornos sin salida).
 */
import { DISPATCH, PRICING, TIME_ZONE } from "./config";
import { haversineKm, round2, type LatLng } from "./geo";

export type RouteSource = "mapbox" | "osrm" | "estimada";

export type RouteResult = {
  distanceKm: number;
  /** Duración estimada (min, 1 decimal). */
  minutes: number;
  geometry: LatLng[];
  source: RouteSource;
  /** La duración incluye tráfico en vivo (solo Mapbox). */
  withTraffic: boolean;
};

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type RouteOptions = {
  at?: Date;
  /** Para pruebas: reemplaza `fetch`. */
  fetcher?: Fetcher;
  /** Para pruebas: ignora la caché. */
  noCache?: boolean;
};

const TIMEOUT_MS = 4_000;
const CACHE_MS = 5 * 60_000;
/** Tras un fallo de red se deja de intentar ese proveedor durante este tiempo. */
const BACKOFF_MS = 60_000;

/** Horas pico de la capital; se usan cuando la ruta no trae tráfico en vivo. */
export const FACTOR_HORA_PICO = 1.6;
export function esHoraPico(hora: number): boolean {
  return (hora >= 6 && hora < 9) || (hora >= 16 && hora < 20);
}

function hourIn(at: Date, timeZone: string = TIME_ZONE): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(at));
  return Number.isFinite(h) ? h % 24 : at.getHours();
}

type CacheEntry = { value: RouteResult; at: number };
const cache = new Map<string, CacheEntry>();
const backoffUntil: Record<"mapbox" | "osrm", number> = { mapbox: 0, osrm: 0 };

function key(a: LatLng, b: LatLng): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(a.lat)},${r(a.lng)};${r(b.lat)},${r(b.lng)}`;
}

const pair = (a: LatLng, b: LatLng) => `${a.lng},${a.lat};${b.lng},${b.lat}`;

type RouteApiResponse = {
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
};

async function fetchJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetcher(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function readRoute(json: unknown): Omit<RouteResult, "source" | "withTraffic"> {
  const r = (json as RouteApiResponse).routes?.[0];
  if (!r || !Array.isArray(r.geometry?.coordinates)) throw new Error("sin ruta");
  return {
    distanceKm: round2(r.distance / 1000),
    minutes: round1(r.duration / 60),
    geometry: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  };
}

/** Estimación sin red: línea recta × rodeo urbano, a la velocidad promedio, con hora pico. */
export function estimateRoute(a: LatLng, b: LatLng, at: Date = new Date()): RouteResult {
  const pico = esHoraPico(hourIn(at)) ? FACTOR_HORA_PICO : 1;
  const distanceKm = round2(haversineKm(a, b) * PRICING.roadFactor);
  const minutes = distanceKm > 0 ? round1(((distanceKm / DISPATCH.avgSpeedKmh) * 60) * pico) : 0;
  return { distanceKm, minutes, geometry: [a, b], source: "estimada", withTraffic: false };
}

function networkDisabled(): boolean {
  return (process.env.ROUTES_PROVIDER ?? "auto").toLowerCase() === "estimada";
}

export async function getRoute(a: LatLng, b: LatLng, opts: RouteOptions = {}): Promise<RouteResult> {
  const at = opts.at ?? new Date();
  const k = key(a, b);
  const now = Date.now();
  if (!opts.noCache) {
    const hit = cache.get(k);
    if (hit && now - hit.at < CACHE_MS) return hit.value;
  }
  const result = await compute(a, b, at, opts.fetcher ?? fetch, now);
  if (!opts.noCache) {
    cache.set(k, { value: result, at: now });
    if (cache.size > 2000) {
      for (const [ck, entry] of cache) if (now - entry.at >= CACHE_MS) cache.delete(ck);
    }
  }
  return result;
}

async function compute(a: LatLng, b: LatLng, at: Date, fetcher: Fetcher, now: number): Promise<RouteResult> {
  if (networkDisabled()) return estimateRoute(a, b, at);
  const token = process.env.MAPBOX_TOKEN;
  if (token && backoffUntil.mapbox <= now) {
    try {
      const json = await fetchJson(
        fetcher,
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${pair(a, b)}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`,
      );
      return { ...readRoute(json), source: "mapbox", withTraffic: true };
    } catch {
      backoffUntil.mapbox = now + BACKOFF_MS;
    }
  }
  if (backoffUntil.osrm <= now) {
    try {
      const json = await fetchJson(
        fetcher,
        `https://router.project-osrm.org/route/v1/driving/${pair(a, b)}?geometries=geojson&overview=full`,
      );
      const r = readRoute(json);
      const pico = esHoraPico(hourIn(at)) ? FACTOR_HORA_PICO : 1;
      return { ...r, minutes: round1(r.minutes * pico), source: "osrm", withTraffic: false };
    } catch {
      backoffUntil.osrm = now + BACKOFF_MS;
    }
  }
  return estimateRoute(a, b, at);
}

/** Pruebas: vacía la caché y el tiempo de espera tras fallos. */
export function resetRouteCache(): void {
  cache.clear();
  backoffUntil.mapbox = 0;
  backoffUntil.osrm = 0;
}

export function parseGeometry(raw: string | null | undefined): LatLng[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.filter(
      (p): p is LatLng => !!p && typeof (p as LatLng).lat === "number" && typeof (p as LatLng).lng === "number",
    );
  } catch {
    return null;
  }
}

/** Geometría compacta para guardar (5 decimales ≈ 1 m). */
export function serializeGeometry(points: LatLng[]): string {
  return JSON.stringify(points.map((p) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 })));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
