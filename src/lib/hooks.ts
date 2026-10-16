"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "./api";
import type { LatLng } from "./geo";

/**
 * Sondeo periódico (la app usa polling de 2–3 s en vez de websockets: simple,
 * funciona en cualquier hosting y es suficiente para seguimiento de grúas).
 * Pausa cuando la pestaña no está visible.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  options: { enabled?: boolean; deps?: unknown[] } = {},
) {
  const { enabled = true, deps = [] } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const d = await fetcherRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, refresh, ...deps]);

  return { data, error, loading, refresh, setData };
}

/** Reloj de 1 s para cuentas regresivas. */
export function useNow(tickMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

export type GeoState = {
  position: (LatLng & { accuracy: number; heading: number | null }) | null;
  error: string | null;
  supported: boolean;
};

/**
 * Sigue la ubicación del dispositivo mientras `enabled`. Devuelve también un
 * mensaje de error en español listo para mostrar.
 */
export function useGeolocationWatch(enabled: boolean, options: { highAccuracy?: boolean } = {}): GeoState {
  const [state, setState] = useState<GeoState>({ position: null, error: null, supported: true });
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ position: null, error: "Tu navegador no permite ubicación", supported: false });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading ?? null,
          },
          error: null,
          supported: true,
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Permite la ubicación para continuar"
            : err.code === err.POSITION_UNAVAILABLE
              ? "No se pudo obtener tu ubicación"
              : "La ubicación tardó demasiado";
        setState((s) => ({ ...s, error: msg }));
      },
      { enableHighAccuracy: options.highAccuracy ?? true, maximumAge: 5_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, options.highAccuracy]);
  return state;
}

/** Guarda y lee un valor pequeño en localStorage sin romper en SSR o modo privado. */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* sin almacenamiento */
    }
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* sin almacenamiento */
      }
    },
    [key],
  );
  return [value, set];
}
