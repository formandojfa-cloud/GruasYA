/**
 * Motor de rutas: con `ROUTES_PROVIDER=estimada` (fijado en setup.ts) nunca se
 * toca la red y la ruta es la estimación en línea recta × rodeo, con el factor
 * de hora pico de Guatemala; la caché evita recalcular por 5 minutos.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { etaMinutes, roadDistanceKm } from "@/lib/geo";
import {
  clearRouteCache,
  estimatedRoute,
  getRoute,
  isRushHour,
  localHourGuatemala,
  parseGeometry,
  routeCacheSize,
  routesProvider,
  RUSH_HOUR_FACTOR,
} from "@/lib/routes";
import { northOf, T0, ZONA_10, ZONA_11 } from "./helpers";

/** 15:00Z = 09:00 Guatemala (sin pico); 23:00Z = 17:00 Guatemala (pico de la tarde). */
const CALM = T0;
const RUSH = new Date("2026-10-16T23:00:00.000Z");

afterEach(() => {
  clearRouteCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("routes.getRoute — sin red (estimada)", () => {
  it("las pruebas corren con ROUTES_PROVIDER=estimada y no llaman a fetch", async () => {
    expect(routesProvider()).toBe("estimada");
    const fetchSpy = vi.fn(() => {
      throw new Error("no debería haber red en pruebas");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const r = await getRoute(ZONA_10, ZONA_11, CALM);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.source).toBe("estimada");
    expect(r.distanceKm).toBe(roadDistanceKm(ZONA_10, ZONA_11));
    expect(r.distanceKm).toBe(7.35);
    expect(r.minutes).toBe(etaMinutes(7.35));
    expect(r.geometry).toEqual([ZONA_10, ZONA_11]);
  });

  it("aun con MAPBOX_TOKEN, `estimada` manda y no hay red", async () => {
    vi.stubEnv("MAPBOX_TOKEN", "pk.test");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await getRoute(ZONA_10, ZONA_11, CALM);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.source).toBe("estimada");
  });

  it("si la red falla, cae a la estimación en silencio (un solo aviso) y no rechaza", async () => {
    vi.stubEnv("ROUTES_PROVIDER", "osrm");
    const fetchSpy = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await getRoute(ZONA_10, ZONA_11, CALM);
    const b = await getRoute(ZONA_11, ZONA_10, CALM);
    expect(a.source).toBe("estimada");
    expect(b.source).toBe("estimada");
    expect(a.distanceKm).toBe(7.35);
    // Tras el primer fallo entra el enfriamiento: la segunda ruta ni intenta la red.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("con OSRM disponible lee distancia, duración y geometría (lng,lat → lat,lng)", async () => {
    vi.stubEnv("ROUTES_PROVIDER", "osrm");
    const json = {
      routes: [
        {
          distance: 8120,
          duration: 1140,
          geometry: { coordinates: [[ZONA_10.lng, ZONA_10.lat], [-90.53, 14.61], [ZONA_11.lng, ZONA_11.lat]] },
        },
      ],
    };
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const r = await getRoute(ZONA_10, ZONA_11, CALM);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String((fetchSpy.mock.calls as unknown[][])[0][0])).toContain(`router.project-osrm.org/route/v1/driving/${ZONA_10.lng},${ZONA_10.lat};${ZONA_11.lng},${ZONA_11.lat}`);
    expect(r.source).toBe("osrm");
    expect(r.distanceKm).toBe(8.12);
    expect(r.minutes).toBe(19);
    expect(r.geometry).toEqual([ZONA_10, { lat: 14.61, lng: -90.53 }, ZONA_11]);

    // En hora pico, OSRM (sin tráfico) se ajusta × 1.6.
    clearRouteCache();
    const rush = await getRoute(ZONA_10, ZONA_11, RUSH);
    expect(rush.minutes).toBe(Math.round(19 * RUSH_HOUR_FACTOR));
  });
});

describe("routes — caché", () => {
  it("la misma pareja (redondeada a 4 decimales) se calcula una vez", async () => {
    vi.stubEnv("ROUTES_PROVIDER", "osrm");
    const json = { routes: [{ distance: 1000, duration: 120, geometry: { coordinates: [[ZONA_10.lng, ZONA_10.lat], [ZONA_11.lng, ZONA_11.lat]] } }] };
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const a = await getRoute(ZONA_10, ZONA_11, CALM);
    const b = await getRoute({ lat: ZONA_10.lat + 0.00001, lng: ZONA_10.lng }, ZONA_11, CALM); // misma celda de 4 decimales
    expect(b).toBe(a);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(routeCacheSize()).toBe(1);

    await getRoute(northOf(ZONA_10, 1), ZONA_11, CALM); // otra pareja → otra consulta
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(routeCacheSize()).toBe(2);
  });

  it("la caché expira a los 5 minutos", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(T0);
      const a = await getRoute(ZONA_10, ZONA_11, CALM);
      vi.setSystemTime(new Date(T0.getTime() + 4 * 60_000));
      expect(await getRoute(ZONA_10, ZONA_11, CALM)).toBe(a);
      vi.setSystemTime(new Date(T0.getTime() + 5 * 60_000 + 1));
      const c = await getRoute(ZONA_10, ZONA_11, CALM);
      expect(c).not.toBe(a);
      expect(c).toEqual(a);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("routes — hora pico de Guatemala (UTC−6)", () => {
  it("6–9 y 16–20 hora local son pico", () => {
    expect(localHourGuatemala(CALM)).toBe(9);
    expect(localHourGuatemala(RUSH)).toBe(17);
    expect(isRushHour(CALM)).toBe(false);
    expect(isRushHour(RUSH)).toBe(true);
    expect(isRushHour(new Date("2026-10-16T12:00:00.000Z"))).toBe(true); // 06:00
    expect(isRushHour(new Date("2026-10-17T02:00:00.000Z"))).toBe(false); // 20:00
    expect(isRushHour(new Date("2026-10-17T01:59:00.000Z"))).toBe(true); // 19:59
  });

  it("la estimación multiplica los minutos (no la distancia) por 1.6 en hora pico", () => {
    const calm = estimatedRoute(ZONA_10, ZONA_11, CALM);
    const rush = estimatedRoute(ZONA_10, ZONA_11, RUSH);
    expect(calm.minutes).toBe(etaMinutes(7.35));
    expect(rush.minutes).toBe(Math.round(etaMinutes(7.35) * RUSH_HOUR_FACTOR));
    expect(rush.distanceKm).toBe(calm.distanceKm);
    expect(estimatedRoute(ZONA_10, ZONA_10, RUSH).minutes).toBe(0);
  });
});

describe("routes.parseGeometry", () => {
  it("acepta la lista guardada y rechaza basura", () => {
    expect(parseGeometry(JSON.stringify([ZONA_10, ZONA_11]))).toEqual([ZONA_10, ZONA_11]);
    expect(parseGeometry(null)).toBeNull();
    expect(parseGeometry("{")).toBeNull();
    expect(parseGeometry("[]")).toBeNull();
    expect(parseGeometry(JSON.stringify([{ lat: "x" }, ZONA_11]))).toBeNull();
  });
});
