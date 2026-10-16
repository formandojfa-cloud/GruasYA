/**
 * Geometría: haversine, distancia urbana estimada (× 1.3), ETA a 25 km/h,
 * índice H3 y validación de coordenadas.
 */
import { getResolution, isValidCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { DISPATCH, PRICING } from "@/lib/config";
import {
  bearingDeg,
  etaMinutes,
  h3CellCenter,
  h3CellsAround,
  haversineKm,
  isValidLatLng,
  moveToward,
  roadDistanceKm,
  round2,
  toH3Cell,
} from "@/lib/geo";
import { ZONA_10, ZONA_11, northOf } from "./helpers";

describe("geo.haversineKm", () => {
  it("zona 10 → zona 11 son ≈ 5.65 km en línea recta", () => {
    expect(haversineKm(ZONA_10, ZONA_11)).toBeCloseTo(5.65, 1);
  });

  it("es simétrica y cero entre el mismo punto", () => {
    expect(haversineKm(ZONA_10, ZONA_10)).toBe(0);
    expect(haversineKm(ZONA_10, ZONA_11)).toBeCloseTo(haversineKm(ZONA_11, ZONA_10), 10);
  });

  it("un grado de latitud son ≈ 111.2 km", () => {
    expect(haversineKm({ lat: 14, lng: -90 }, { lat: 15, lng: -90 })).toBeCloseTo(111.19, 1);
    // El helper de las pruebas desplaza exactamente `km` hacia el norte.
    expect(haversineKm(ZONA_10, northOf(ZONA_10, 3))).toBeCloseTo(3, 3);
  });

  it("no rompe con antípodas (clamp del asin)", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * 6371, 0);
  });
});

describe("geo.roadDistanceKm", () => {
  it("multiplica la línea recta por el factor urbano 1.3 y redondea a 2 decimales", () => {
    expect(PRICING.roadFactor).toBe(1.3);
    expect(roadDistanceKm(ZONA_10, ZONA_11)).toBe(7.35);
    expect(roadDistanceKm(ZONA_10, ZONA_11)).toBeCloseTo(haversineKm(ZONA_10, ZONA_11) * 1.3, 2);
    expect(roadDistanceKm(ZONA_10, northOf(ZONA_10, 10))).toBeCloseTo(13, 2);
  });
});

describe("geo.etaMinutes", () => {
  it("usa 25 km/h por defecto", () => {
    expect(DISPATCH.avgSpeedKmh).toBe(25);
    expect(etaMinutes(25)).toBe(60);
    expect(etaMinutes(12.5)).toBe(30);
    expect(etaMinutes(7.35)).toBe(18);
  });

  it("devuelve 0 sin distancia y al menos 1 minuto para cualquier distancia positiva", () => {
    expect(etaMinutes(0)).toBe(0);
    expect(etaMinutes(-2)).toBe(0);
    expect(etaMinutes(0.05)).toBe(1);
  });

  it("acepta otra velocidad", () => {
    expect(etaMinutes(10, 50)).toBe(12);
  });
});

describe("geo.toH3Cell", () => {
  it("devuelve una celda H3 válida de resolución 8 (15 caracteres hex)", () => {
    const cell = toH3Cell(ZONA_10);
    expect(cell).toMatch(/^[0-9a-f]{15}$/);
    expect(isValidCell(cell)).toBe(true);
    expect(getResolution(cell)).toBe(DISPATCH.h3Resolution);
    expect(DISPATCH.h3Resolution).toBe(8);
  });

  it("es determinista y respeta la resolución pedida", () => {
    expect(toH3Cell(ZONA_10)).toBe(toH3Cell({ ...ZONA_10 }));
    expect(getResolution(toH3Cell(ZONA_10, 6))).toBe(6);
    expect(toH3Cell(ZONA_10)).not.toBe(toH3Cell(ZONA_11));
  });

  it("el centro de la celda queda cerca del punto (< 1 km en resolución 8)", () => {
    const center = h3CellCenter(toH3Cell(ZONA_10));
    expect(haversineKm(center, ZONA_10)).toBeLessThan(1);
  });

  it("h3CellsAround cubre el radio pedido e incluye la celda central", () => {
    const cells = h3CellsAround(ZONA_10, 2);
    expect(cells).toContain(toH3Cell(ZONA_10));
    expect(cells.length).toBeGreaterThan(7);
    expect(cells).toContain(toH3Cell(northOf(ZONA_10, 1.5)));
  });
});

describe("geo.isValidLatLng", () => {
  it("acepta coordenadas finitas dentro de rango", () => {
    expect(isValidLatLng(ZONA_10)).toBe(true);
    expect(isValidLatLng({ lat: -90, lng: 180 })).toBe(true);
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(true);
  });

  it("rechaza nulos, campos faltantes, NaN, strings y fuera de rango", () => {
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng(undefined)).toBe(false);
    expect(isValidLatLng({})).toBe(false);
    expect(isValidLatLng({ lat: 14.6 })).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: -90 })).toBe(false);
    expect(isValidLatLng({ lat: Infinity, lng: -90 })).toBe(false);
    expect(isValidLatLng({ lat: 90.1, lng: -90 })).toBe(false);
    expect(isValidLatLng({ lat: 14.6, lng: -180.5 })).toBe(false);
    expect(isValidLatLng({ lat: "14.6", lng: "-90.5" } as unknown as Partial<{ lat: number; lng: number }>)).toBe(false);
  });
});

describe("geo.bearingDeg / moveToward / round2", () => {
  it("el rumbo hacia el norte es 0° y hacia el este ≈ 90°", () => {
    expect(bearingDeg(ZONA_10, northOf(ZONA_10, 5))).toBeCloseTo(0, 5);
    expect(bearingDeg(ZONA_10, { lat: ZONA_10.lat, lng: ZONA_10.lng + 0.05 })).toBeCloseTo(90, 0);
    expect(bearingDeg(northOf(ZONA_10, 5), ZONA_10)).toBeCloseTo(180, 5);
  });

  it("moveToward interpola y acota la fracción a [0, 1]", () => {
    expect(moveToward(ZONA_10, ZONA_11, 0)).toEqual(ZONA_10);
    expect(moveToward(ZONA_10, ZONA_11, 1)).toEqual(ZONA_11);
    expect(moveToward(ZONA_10, ZONA_11, 2)).toEqual(ZONA_11);
    expect(moveToward(ZONA_10, ZONA_11, -1)).toEqual(ZONA_10);
    const mid = moveToward(ZONA_10, ZONA_11, 0.5);
    expect(mid.lat).toBeCloseTo((ZONA_10.lat + ZONA_11.lat) / 2, 10);
    expect(mid.lng).toBeCloseTo((ZONA_10.lng + ZONA_11.lng) / 2, 10);
  });

  it("round2 redondea a 2 decimales", () => {
    expect(round2(7.3549)).toBe(7.35);
    expect(round2(7.356)).toBe(7.36);
    expect(round2(-1.005)).toBe(-1);
  });
});
