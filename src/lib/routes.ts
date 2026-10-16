/**
 * Motor de rutas por calles. Con `MAPBOX_TOKEN` se usa Mapbox Directions con
 * tráfico en vivo; sin él, el OSRM público (gratis, sin tráfico) más un ajuste
 * por hora pico. Si ninguno responde (o `ROUTES_PROVIDER=estimada`), se cae a la
 * estimación en línea recta de `geo.ts` para no dejar a nadie sin precio ni ETA.
 *
 * Los resultados se guardan en memoria 5 min por par de coordenadas redondeadas,
 * así el sondeo cada 2–3 s de las interfaces no dispara una petición por lectura.
 */
import { etaMinutes, roadDistanceKm, round2, type LatLng } from "./geo";

export type RouteSource = "mapbox" | "osrm" | "estimada";

export type Route = {
  /** Distancia por calles (km, 2 decimales). */
  distanceKm: number;
  /** Minutos de recorrido (entero ≥ 1 salvo distancia cero). */
  minutes: number;
  /** Polilínea de la ruta; con `estimada` son solo los dos extremos. */
  geometry: LatLng[];
  source: RouteSource;
};

/** `auto` elige Mapbox si hay token y si no OSRM; `estimada` nunca toca la red. */
export type RoutesProvider = "auto" | "mapbox" | "osrm" | "estimada";

const TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 5 * 60_000;
/** Tras un fallo de red se deja de intentar un rato para no frenar cada lectura 4 s. */
const NETWORK_COOLDOWN_MS = 60_000;
const WARN_EVERY_MS = 10 * 60_000;

/** Horas pico en Ciudad de Guatemala (hora local, UTC−6 sin horario de verano). */
export const RUSH_HOUR_FACTOR = 1.6;
const GUATEMALA_UTC_OFFSET_HOURS = -6;

export function localHourGuatemala(at: Date): number {
  return (((at.getUTCHours() + GUATEMALA_UTC_OFFSET_HOURS) % 24) + 24) % 24;
}

export function isRushHour(at: Date): boolean {
  const h = localHourGuatemala(at);
  return (h >= 6 && h < 9) || (h >= 16 && h < 20);
}

export function rushHourFactor(at: Date): number {
  return isRushHour(at) ? RUSH_HOUR_FACTOR : 1;
}

export function routesProvider(): RoutesProvider {
  const v = process.env.ROUTES_PROVIDER;
  if (v === "mapbox" || v === "osrm" || v === "estimada") return v;
  return "auto";
}

// ---------- Caché ----------

const cache = new Map<string, { route: Route; expiresAt: number }>();
let networkDownUntil = 0;
let lastWarnAt = 0;

function key(from: LatLng, to: LatLng): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(from.lat)},${r(from.lng)}|${r(to.lat)},${r(to.lng)}`;
}

/** Solo para pruebas: vacía la caché y el enfriamiento de red. */
export function clearRouteCache(): void {
  cache.clear();
  networkDownUntil = 0;
  lastWarnAt = 0;
}

export function routeCacheSize(): number {
  return cache.size;
}

// ---------- Estimación sin red ----------

/** Ruta estimada con línea recta × factor de rodeo y hora pico (sin red). */
export function estimatedRoute(from: LatLng, to: LatLng, at: Date = new Date()): Route {
  const distanceKm = roadDistanceKm(from, to);
  const base = etaMinutes(distanceKm);
  return {
    distanceKm,
    minutes: base === 0 ? 0 : Math.max(1, Math.round(base * rushHourFactor(at))),
    geometry: [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }],
    source: "estimada",
  };
}

// ---------- Proveedores remotos ----------

type DirectionsResponse = {
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
};

const pair = (a: LatLng, b: LatLng) => `${a.lng},${a.lat};${b.lng},${b.lat}`;

async function fetchJson(url: string): Promise<DirectionsResponse> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DirectionsResponse;
}

function parseDirections(json: DirectionsResponse, source: "mapbox" | "osrm", at: Date): Route {
  const r = json.routes?.[0];
  if (!r || !Array.isArray(r.geometry?.coordinates) || r.geometry.coordinates.length < 2) {
    throw new Error("sin ruta");
  }
  // Mapbox driving-traffic ya trae el tráfico; a OSRM se le aplica la hora pico.
  const factor = source === "osrm" ? rushHourFactor(at) : 1;
  const minutes = (r.duration / 60) * factor;
  return {
    distanceKm: round2(r.distance / 1000),
    minutes: minutes <= 0 ? 0 : Math.max(1, Math.round(minutes)),
    geometry: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    source,
  };
}

async function fetchMapbox(from: LatLng, to: LatLng, token: string, at: Date): Promise<Route> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${pair(from, to)}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
  return parseDirections(await fetchJson(url), "mapbox", at);
}

async function fetchOsrm(from: LatLng, to: LatLng, at: Date): Promise<Route> {
  const url = `https://router.project-osrm.org/route/v1/driving/${pair(from, to)}?overview=full&geometries=geojson`;
  return parseDirections(await fetchJson(url), "osrm", at);
}

function warnOnce(err: unknown): void {
  const now = Date.now();
  if (now - lastWarnAt < WARN_EVERY_MS) return;
  lastWarnAt = now;
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[routes] sin motor de rutas, usando estimación en línea recta (${msg})`);
}

async function fetchRemote(from: LatLng, to: LatLng, at: Date): Promise<Route | null> {
  const provider = routesProvider();
  if (provider === "estimada") return null;
  if (Date.now() < networkDownUntil) return null;

  const token = process.env.MAPBOX_TOKEN;
  const tryMapbox = !!token && provider !== "osrm";
  const tryOsrm = provider !== "mapbox";
  let lastErr: unknown = new Error("sin proveedor de rutas configurado");

  if (tryMapbox) {
    try {
      return await fetchMapbox(from, to, token!, at);
    } catch (err) {
      lastErr = err;
    }
  }
  if (tryOsrm) {
    try {
      return await fetchOsrm(from, to, at);
    } catch (err) {
      lastErr = err;
    }
  }
  networkDownUntil = Date.now() + NETWORK_COOLDOWN_MS;
  warnOnce(lastErr);
  return null;
}

// ---------- API ----------

/**
 * Ruta por calles de `from` a `to`. Nunca rechaza: si no hay red o motor,
 * devuelve la estimación (`source: "estimada"`). `at` fija la hora para el
 * factor de hora pico (útil en pruebas).
 */
export async function getRoute(from: LatLng, to: LatLng, at: Date = new Date()): Promise<Route> {
  const k = key(from, to);
  const hit = cache.get(k);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.route;

  const route = (await fetchRemote(from, to, at)) ?? estimatedRoute(from, to, at);
  cache.set(k, { route, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 2_000) {
    for (const [ck, v] of cache) if (v.expiresAt <= Date.now()) cache.delete(ck);
  }
  return route;
}

/** Geometría guardada como JSON en la BD → lista de puntos (o null si no hay/está corrupta). */
export function parseGeometry(json: string | null | undefined): LatLng[] | null {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return null;
    const pts = v.filter(
      (p): p is LatLng => !!p && typeof p === "object" && typeof (p as LatLng).lat === "number" && typeof (p as LatLng).lng === "number",
    );
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
}
