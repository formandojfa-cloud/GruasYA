"use client";

/**
 * Paso "🚗 Dónde estás" / "🏁 A dónde vas": pin fijo al centro, el usuario
 * mueve (o toca) el mapa; la dirección se resuelve con /api/geocode.
 */
import { useEffect, useState } from "react";
import MapView, { type MapMarker } from "@/components/map/Map";
import { Aviso, Button, Input, Segments, Spinner } from "@/components/ui";
import type { LatLng } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { BackButton } from "./bits";
import { CenterPin } from "./CenterPin";
import { ClientShell } from "./ClientShell";
import { formatCoords } from "./constants";
import { searchPlaces, useReverseGeocode, type GeoResult } from "./geocode";

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
  /** El servicio lleva destino (grúa): se puede saltar a "A dónde vas" desde la recogida. */
  hasDropoff: boolean;
  /** Marcadores extra (p. ej. la recogida ya elegida mientras se fija el destino). */
  markers?: MapMarker[];
  onBack: () => void;
  onConfirm: (place: Place) => void;
};

type View = LatLng & { nonce: number };
type Found = { q: string; results: GeoResult[]; unavailable: boolean };

export function LocationStep({ title, subtitle, kind, initial, gps, gpsError, cta, hasDropoff, markers = [], onBack, onConfirm }: Props) {
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
  const icon = kind === "pickup" ? "🚗" : "🏁";

  return (
    <ClientShell section="pedir">
      <section className="tarjeta">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2>{title}</h2>
            {subtitle && <p className="tenue truncate">{subtitle}</p>}
          </div>
          <BackButton onClick={onBack} />
        </div>
        <Segments
          label="Paso"
          items={[
            { key: "pickup", label: "🚗 Dónde estás" },
            { key: "dropoff", label: "🏁 A dónde vas", disabled: !hasDropoff },
          ]}
          value={kind}
          onChange={(k) => {
            // Desde la recogida, "A dónde vas" confirma el punto y pasa al destino; desde el destino, "Dónde estás" vuelve.
            if (k === kind) return;
            if (k === "dropoff") confirm();
            else onBack();
          }}
        />
        <p className="tenue">{kind === "pickup" ? "Toca el mapa para marcar tu vehículo." : "Toca el mapa para marcar el destino."}</p>
        <Input
          type="search"
          inputMode="search"
          placeholder="Buscar dirección o lugar"
          aria-label="Buscar dirección"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
        />
        {showResults && (
          <ul className="-mt-1 max-h-60 divide-y divide-border overflow-y-auto rounded-[10px] border border-border">
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
      </section>

      <div className="mapa-marco">
        <MapView
          center={center}
          zoom={16}
          followCenter
          markers={markers}
          onPick={goTo}
          onMoveEnd={(c) => {
            setPin(c);
            setFocused(false);
          }}
          className="h-full w-full"
        />
        <CenterPin kind={kind} />
      </div>

      <section className="tarjeta">
        <p className="tenue">{kind === "pickup" ? "Tu vehículo" : "Destino"}</p>
        <div className="flex min-h-11 items-start gap-2">
          <span className="text-xl leading-none" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            {address.loading ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner size="sm" /> Buscando dirección…
              </p>
            ) : address.label ? (
              <p className="line-clamp-2 font-medium leading-snug">{address.label}</p>
            ) : (
              <>
                <p className="font-medium tabular-nums">{formatCoords(pin)}</p>
                <p className="text-sm text-muted">{address.unavailable ? "Sin dirección disponible; el pin marca el punto exacto." : "Mueve el mapa para ajustar el pin."}</p>
              </>
            )}
          </div>
        </div>
        {gpsError && kind === "pickup" && <Aviso>{gpsError}. Mueve el mapa hasta donde estás.</Aviso>}
        <Button type="button" variant="secondary" fullWidth onClick={() => gps && goTo(gps)} disabled={!gps}>
          📍 Usar mi ubicación
        </Button>
        <Button type="button" size="lg" fullWidth onClick={confirm}>
          {cta}
        </Button>
      </section>
    </ClientShell>
  );
}
