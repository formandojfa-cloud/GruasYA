import { handle, ok } from "@/lib/api-helpers";

/**
 * Búsqueda y geocodificación inversa vía Nominatim (OpenStreetMap), limitada a
 * Guatemala. Si el servicio no responde, devuelve lista vacía y la interfaz
 * cae a "marca el punto en el mapa".
 */
type GeoResult = { label: string; lat: number; lng: number };

const NOMINATIM = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const HEADERS = {
  "User-Agent": process.env.NOMINATIM_USER_AGENT ?? "asistencia-vial-gt/0.1 (dev)",
  "Accept-Language": "es",
};

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(4_000), cache: "no-store" });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  return res.json();
}

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  try {
    if (q && q.length >= 3) {
      const params = new URLSearchParams({ q, format: "jsonv2", countrycodes: "gt", limit: "6", addressdetails: "0" });
      const data = (await fetchJson(`${NOMINATIM}/search?${params}`)) as Array<{ display_name: string; lat: string; lon: string }>;
      const results: GeoResult[] = data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
      return ok({ results });
    }
    if (lat && lng) {
      const params = new URLSearchParams({ lat, lon: lng, format: "jsonv2", zoom: "17" });
      const d = (await fetchJson(`${NOMINATIM}/reverse?${params}`)) as { display_name?: string };
      const results: GeoResult[] = d.display_name ? [{ label: d.display_name, lat: Number(lat), lng: Number(lng) }] : [];
      return ok({ results });
    }
    return ok({ results: [] as GeoResult[] });
  } catch (err) {
    console.warn("geocoder unavailable", err instanceof Error ? err.message : err);
    return ok({ results: [] as GeoResult[], unavailable: true });
  }
});
