/**
 * Clima en el punto de recogida (Open-Meteo, gratis y sin clave), como en el
 * prototipo: precipitación de la última hora y código WMO → NONE | RAIN |
 * HEAVY_RAIN. Caché de 10 min por coordenada redondeada (~1 km). Si no responde,
 * se usa el clima manual de `Settings.weather`. El clima manual además
 * refuerza: si la central marcó lluvia, la lluvia se cobra aunque la API diga
 * seco (el ajuste existe para eso). Un `console.warn` como máximo cada 10 min.
 *
 * `WEATHER_PROVIDER=off` desactiva la red (pruebas, entornos sin salida).
 */
import type { Weather } from "@/generated/prisma/enums";
import type { LatLng } from "./geo";
import type { Fetcher } from "./routes";

const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 4_000;
const WARN_EVERY_MS = 10 * 60_000;

const RANK: Record<Weather, number> = { NONE: 0, RAIN: 1, HEAVY_RAIN: 2 };

export function worseWeather(a: Weather, b: Weather): Weather {
  return RANK[a] >= RANK[b] ? a : b;
}

type CacheEntry = { value: Weather | null; at: number };
const cache = new Map<string, CacheEntry>();
let lastWarnAt = 0;

export type WeatherOptions = {
  fetcher?: Fetcher;
  noCache?: boolean;
  now?: number;
};

function key(p: LatLng): string {
  return `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
}

/** Interpretación de Open-Meteo, igual que el prototipo. */
export function classifyPrecipitation(mm: number, code: number): Weather {
  if (mm >= 4 || code >= 95) return "HEAVY_RAIN";
  if (mm >= 0.3 || (code >= 51 && code <= 82)) return "RAIN";
  return "NONE";
}

function networkDisabled(): boolean {
  return (process.env.WEATHER_PROVIDER ?? "open-meteo").toLowerCase() === "off";
}

/** Lectura de la API (o null si no responde). Con caché. */
export async function fetchWeather(p: LatLng, opts: WeatherOptions = {}): Promise<Weather | null> {
  if (networkDisabled()) return null;
  const now = opts.now ?? Date.now();
  const k = key(p);
  if (!opts.noCache) {
    const hit = cache.get(k);
    if (hit && now - hit.at < CACHE_MS) return hit.value;
  }
  let value: Weather | null = null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await (opts.fetcher ?? fetch)(
      `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=precipitation,weather_code`,
      { signal: ctrl.signal },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = (await r.json()) as { current?: { precipitation?: number; weather_code?: number } };
    value = classifyPrecipitation(json.current?.precipitation ?? 0, json.current?.weather_code ?? 0);
  } catch (err) {
    if (now - lastWarnAt >= WARN_EVERY_MS) {
      lastWarnAt = now;
      console.warn("Open-Meteo no respondió; se usa el clima manual de Ajustes", err instanceof Error ? err.message : err);
    }
  } finally {
    clearTimeout(t);
  }
  if (!opts.noCache) cache.set(k, { value, at: now });
  return value;
}

/**
 * Clima efectivo para cotizar: lo que diga la API, reforzado por el ajuste
 * manual; si la API no responde, el ajuste manual.
 */
export async function getWeather(p: LatLng, manual: Weather, opts: WeatherOptions = {}): Promise<Weather> {
  const fromApi = await fetchWeather(p, opts);
  if (fromApi === null) return manual;
  return worseWeather(fromApi, manual);
}

/** Pruebas: vacía la caché y el límite de avisos. */
export function resetWeatherCache(): void {
  cache.clear();
  lastWarnAt = 0;
}
