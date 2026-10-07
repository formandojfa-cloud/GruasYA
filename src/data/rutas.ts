// Rutas por calles y clima. Con VITE_MAPBOX_TOKEN se usa Mapbox con tráfico en
// vivo; sin él, OSRM (gratis, sin tráfico) más un ajuste por hora pico. Si
// ninguno responde, se estima con línea recta para no dejar al conductor sin precio.
import {
  distanciaRutaKm,
  esHoraPico,
  FACTOR_HORA_PICO,
  minutosEstimados,
} from '../domain/geo';
import type { Clima, Coordenada, FuenteRuta } from '../domain/tipos';

export interface Ruta {
  distanciaKm: number;
  minutos: number;
  geometria: Coordenada[];
  fuente: FuenteRuta;
  conTrafico: boolean;
}

const TOKEN_MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const ESPERA_MS = 6000;

async function pedirJson(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ESPERA_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const par = (a: Coordenada, b: Coordenada) => `${a.lng},${a.lat};${b.lng},${b.lat}`;

interface RespuestaRuta {
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

function leerRuta(json: RespuestaRuta) {
  const r = json.routes?.[0];
  if (!r) throw new Error('sin ruta');
  return {
    distanciaKm: r.distance / 1000,
    minutos: r.duration / 60,
    geometria: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  };
}

export async function calcularRuta(a: Coordenada, b: Coordenada, hora: number): Promise<Ruta> {
  const pico = esHoraPico(hora) ? FACTOR_HORA_PICO : 1;
  if (TOKEN_MAPBOX) {
    try {
      const json = await pedirJson(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${par(a, b)}?geometries=geojson&overview=full&access_token=${TOKEN_MAPBOX}`,
      );
      return { ...leerRuta(json), fuente: 'mapbox', conTrafico: true };
    } catch {
      // se intenta con OSRM
    }
  }
  try {
    const json = await pedirJson(`https://router.project-osrm.org/route/v1/driving/${par(a, b)}?geometries=geojson&overview=full`);
    const r = leerRuta(json);
    return { ...r, minutos: r.minutos * pico, fuente: 'osrm', conTrafico: false };
  } catch {
    return {
      distanciaKm: distanciaRutaKm(a, b),
      minutos: minutosEstimados(a, b) * pico,
      geometria: [a, b],
      fuente: 'estimada',
      conTrafico: false,
    };
  }
}

// Open-Meteo: gratis y sin clave. Precipitación en mm de la última hora y código WMO.
export async function consultarClima(p: Coordenada): Promise<Clima> {
  try {
    const json = await pedirJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=precipitation,weather_code`,
    );
    const mm: number = json.current?.precipitation ?? 0;
    const codigo: number = json.current?.weather_code ?? 0;
    if (mm >= 4 || codigo >= 95) return 'lluvia_fuerte';
    if (mm >= 0.3 || (codigo >= 51 && codigo <= 82)) return 'lluvia';
    return 'seco';
  } catch {
    return 'seco';
  }
}
