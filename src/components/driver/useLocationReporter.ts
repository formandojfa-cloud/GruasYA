"use client";

/**
 * Ubicación del gruero: sigue el GPS mientras está conectado o en servicio y la
 * manda a `POST /api/provider/location` cada ~4 s y de inmediato si se movió
 * más de 20 m. Si el GPS falla (escritorio, permiso denegado) el gruero puede
 * fijar su posición tocando el mapa; esa posición manual se guarda localmente
 * y tiene prioridad hasta que la quite.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { LatLng } from "@/lib/geo";
import { useGeolocationWatch, useLocalStorage } from "@/lib/hooks";
import { bearingDeg, distanceMeters } from "./util";

export type DriverPosition = LatLng & { heading: number | null };

export type LocationReporter = {
  /** Posición que se usa y se reporta (manual > GPS). */
  position: DriverPosition | null;
  source: "manual" | "gps" | null;
  /** GPS disponible aunque se esté usando la manual. */
  gpsPosition: DriverPosition | null;
  geoError: string | null;
  geoSupported: boolean;
  manual: LatLng | null;
  setManual: (p: LatLng | null) => void;
  lastSentAt: number | null;
  sendError: string | null;
};

const LS_MANUAL = "driver.manualPosition";
const PING_MS = 4_000;
const MOVE_THRESHOLD_M = 20;

function sanitizeHeading(h: number | null | undefined): number | null {
  if (h == null || !Number.isFinite(h)) return null;
  const n = ((h % 360) + 360) % 360;
  return n;
}

export function useLocationReporter(enabled: boolean): LocationReporter {
  const geo = useGeolocationWatch(enabled);
  const [manual, setManualStored] = useLocalStorage<LatLng | null>(LS_MANUAL, null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const gpsPosition = useMemo<DriverPosition | null>(
    () => (geo.position ? { lat: geo.position.lat, lng: geo.position.lng, heading: sanitizeHeading(geo.position.heading) } : null),
    [geo.position],
  );

  const position = useMemo<DriverPosition | null>(() => {
    if (manual && Number.isFinite(manual.lat) && Number.isFinite(manual.lng)) return { lat: manual.lat, lng: manual.lng, heading: null };
    return gpsPosition;
  }, [manual, gpsPosition]);

  const source: LocationReporter["source"] = manual ? "manual" : gpsPosition ? "gps" : null;

  // Refs sincronizados en efectos (no en el render) para que el intervalo lea lo último.
  const positionRef = useRef<DriverPosition | null>(null);
  const lastSentRef = useRef<DriverPosition | null>(null);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const send = useCallback(async (p: DriverPosition) => {
    const last = lastSentRef.current;
    // Si el GPS no trae rumbo, se estima con el desplazamiento desde el último envío.
    let heading = p.heading;
    if (heading == null && last) {
      heading = distanceMeters(last, p) > MOVE_THRESHOLD_M ? bearingDeg(last, p) : last.heading;
    }
    const payload: { lat: number; lng: number; heading?: number } = { lat: p.lat, lng: p.lng };
    if (heading != null) payload.heading = Math.round(heading * 10) / 10;
    lastSentRef.current = { ...p, heading };
    try {
      await api.post("/api/provider/location", payload);
      setLastSentAt(Date.now());
      setSendError(null);
    } catch (e) {
      setSendError(errorMessage(e, "No se pudo enviar tu ubicación"));
    }
  }, []);

  // Envío periódico mientras está habilitado.
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const p = positionRef.current;
      if (p) void send(p);
    };
    tick();
    const id = setInterval(tick, PING_MS);
    return () => clearInterval(id);
  }, [enabled, send]);

  // Envío inmediato al moverse más de 20 m (o al obtener la primera posición).
  useEffect(() => {
    if (!enabled || !position) return;
    const last = lastSentRef.current;
    if (!last || distanceMeters(last, position) > MOVE_THRESHOLD_M) void send(position);
  }, [enabled, position, send]);

  const setManual = useCallback(
    (p: LatLng | null) => {
      setManualStored(p ? { lat: p.lat, lng: p.lng } : null);
    },
    [setManualStored],
  );

  return {
    position,
    source,
    gpsPosition,
    geoError: enabled ? geo.error : null,
    geoSupported: geo.supported,
    manual,
    setManual,
    lastSentAt,
    sendError,
  };
}
