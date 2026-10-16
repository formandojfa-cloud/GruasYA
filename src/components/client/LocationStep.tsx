"use client";

/**
 * Paso "¿Dónde estás?" / "¿A dónde llevamos tu vehículo?": pin fijo al centro,
 * el usuario arrastra el mapa; la dirección se resuelve con /api/geocode.
 */
import { useEffect, useState } from "react";
import MapView, { type MapMarker } from "@/components/map/Map";
import { Button, Input, Notice, Spinner } from "@/components/ui";
import type { LatLng } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { CenterPin } from "./CenterPin";
import { formatCoords } from "./constants";
import { searchPlaces, useReverseGeocode, type GeoResult } from "./geocode";
import { MapScreen } from "./MapScreen";

type Props = {
  title: string;
  subtitle?: string;
  kind: "pickup" | "dropoff";
  /** Punto inicial del pin. */
  initial: LatLng;
  /** Ubicación del dispositivo, si la hay. */
  gps: LatLng | null;
  gpsError?: string | null;
  cta: string;
  /** Marcadores extra (p. ej. la recogida ya elegida mientras se fija el destino). */
  markers?: MapMarker[];
  onBack: () => void;
  onConfirm: (place: Place) => void;
};

type View = LatLng & { nonce: number };
type Found = { q: string; results: GeoResult[]; unavailable: boolean };

export function LocationStep({ title, subtitle, kind, initial, gps, gpsError, cta, markers = [], onBack, onConfirm }: Props) {
  const [pin, setPin] = useState<LatLng>(initial);
  const [view, setView] = useState<View>({ lat: initial.lat, lng: initial.lng, nonce: 0 });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found>({ q: "", results: [], unavailable: false });
  const [focused, setFocused] = useState(false);
  const address = useReverseGeocode(pin);

  // Búsqueda de direcciones con retardo (mínimo 3 letras).
  const q = query.trim();
  useEffect(() => {
    if (q.length < 3) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchPlaces(q).then(
        (res) => {
          if (!cancelled) setFound({ q, results: res.results, unavailable: !!res.unavailable });
        },
        () => {
          if (!cancelled) setFound({ q, results: [], unavailable: true });
        },
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const searching = q.length >= 3 && found.q !== q;
  const results = found.q === q ? found.results : [];
  const showResults = focused && q.length >= 3;

  function goTo(p: LatLng) {
    setPin(p);
    setView((v) => ({ lat: p.lat, lng: p.lng, nonce: v.nonce + 1 }));
  }

  function pickResult(r: GeoResult) {
    goTo(r);
    setQuery("");
    setFocused(false);
  }

  function confirm() {
    const label = address.label?.slice(0, 200);
    onConfirm({ lat: pin.lat, lng: pin.lng, address: label || undefined });
  }

  // Desplazamiento de ≈1 m para que el mapa se recentre aunque el punto sea el mismo.
  const center: LatLng = { lat: view.lat + (view.nonce % 2) * 0.00001, lng: view.lng };
  const icon = kind === "pickup" ? "📍" : "🏁";

  return (
    <MapScreen
      mapClassName="h-[62dvh]"
      map={
        <>
          <MapView
            center={center}
            zoom={16}
            followCenter
            markers={markers}
            onMoveEnd={(c) => {
              setPin(c);
              setFocused(false);
            }}
            className="h-full w-full"
          />
          <CenterPin kind={kind} />
        </>
      }
      top={
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background text-2xl shadow-md hover:bg-surface"
          >
            ‹
          </button>
          <div className="min-w-0 flex-1 rounded-2xl bg-background p-2 shadow-md">
            <div className="px-2 pb-1.5 pt-1">
              <p className="text-base font-bold leading-tight">{title}</p>
              {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
            </div>
            <Input
              type="search"
              inputMode="search"
              placeholder="Buscar dirección o lugar"
              aria-label="Buscar dirección"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              className="border-0 bg-surface"
            />
            {showResults && (
              <ul className="mt-1 max-h-60 divide-y divide-border overflow-y-auto">
                {searching && (
                  <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted">
                    <Spinner size="sm" /> Buscando…
                  </li>
                )}
                {!searching && results.length === 0 && (
                  <li className="px-3 py-3 text-sm text-muted">
                    {found.unavailable ? "La búsqueda no está disponible. Mueve el mapa para fijar el punto." : "Sin resultados en Guatemala"}
                  </li>
                )}
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng},${r.label}`}>
                    <button type="button" onClick={() => pickResult(r)} className="w-full px-3 py-3 text-left text-sm leading-snug hover:bg-surface">
                      <span aria-hidden>{icon}</span> {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      }
    >
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{kind === "pickup" ? "Punto de recogida" : "Destino"}</p>
        <div className="mt-1 flex min-h-11 items-start gap-2">
          <span className="text-xl leading-none" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            {address.loading ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner size="sm" /> Buscando dirección…
              </p>
            ) : address.label ? (
              <p className="line-clamp-2 text-sm font-medium leading-snug">{address.label}</p>
            ) : (
              <>
                <p className="text-sm font-medium tabular-nums">{formatCoords(pin)}</p>
                <p className="text-xs text-muted">
                  {address.unavailable ? "Sin dirección disponible; el pin marca el punto exacto." : "Mueve el mapa para ajustar el pin."}
                </p>
              </>
            )}
          </div>
        </div>
        {gpsError && kind === "pickup" && (
          <Notice tone="warning" className="mt-2">
            {gpsError}. Mueve el mapa hasta donde estás.
          </Notice>
        )}
        <div className="mt-3 grid gap-2">
          <Button type="button" variant="secondary" fullWidth onClick={() => gps && goTo(gps)} disabled={!gps}>
            ◎ Usar mi ubicación
          </Button>
          <Button type="button" size="lg" fullWidth onClick={confirm}>
            {cta}
          </Button>
        </div>
      </>
    </MapScreen>
  );
}
