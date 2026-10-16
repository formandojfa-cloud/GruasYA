"use client";

/**
 * Llamadas a /api/geocode y geocodificación inversa con retardo para el patrón
 * "pin fijo al centro". Si el geocodificador no está disponible, la interfaz
 * sigue funcionando con coordenadas.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LatLng } from "@/lib/geo";

export type GeoResult = { label: string; lat: number; lng: number };
export type GeoResponse = { results: GeoResult[]; unavailable?: boolean };

export function searchPlaces(q: string): Promise<GeoResponse> {
  return api.get<GeoResponse>(`/api/geocode?q=${encodeURIComponent(q)}`);
}

export function reverseGeocode(p: LatLng): Promise<GeoResponse> {
  return api.get<GeoResponse>(`/api/geocode?lat=${p.lat}&lng=${p.lng}`);
}

export type ReverseState = { label: string | null; loading: boolean; unavailable: boolean };

type Resolved = { key: string; label: string | null; unavailable: boolean };

function keyOf(lat: number | undefined, lng: number | undefined): string {
  return lat != null && lng != null ? `${lat.toFixed(5)},${lng.toFixed(5)}` : "";
}

/** Dirección del punto, consultada 600 ms después del último movimiento. */
export function useReverseGeocode(p: LatLng | null, delayMs = 600): ReverseState {
  const [resolved, setResolved] = useState<Resolved>({ key: "", label: null, unavailable: false });
  const lat = p?.lat;
  const lng = p?.lng;
  const key = keyOf(lat, lng);

  useEffect(() => {
    if (!key || lat == null || lng == null) return;
    let cancelled = false;
    const t = setTimeout(() => {
      reverseGeocode({ lat, lng }).then(
        (res) => {
          if (!cancelled) setResolved({ key, label: res.results[0]?.label ?? null, unavailable: !!res.unavailable });
        },
        () => {
          if (!cancelled) setResolved({ key, label: null, unavailable: true });
        },
      );
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, lat, lng, delayMs]);

  const fresh = resolved.key === key;
  return {
    label: fresh ? resolved.label : null,
    loading: key !== "" && !fresh,
    unavailable: fresh && resolved.unavailable,
  };
}
