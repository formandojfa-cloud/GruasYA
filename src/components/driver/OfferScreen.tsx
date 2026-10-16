"use client";

import { useEffect, useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { Button, Countdown, Notice } from "@/components/ui";
import { formatKm, formatMinutes, formatQ, KIND_ICONS, KIND_LABELS, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { OfferView } from "@/lib/types";
import { placeLabel, playOfferAlert } from "./util";

const OFFER_SECONDS = 40;

/**
 * Oferta nueva: pantalla completa con cuenta regresiva, lo que gana, distancia
 * y direcciones. Se monta con `key={offer.id}` para que cada oferta suene y
 * arranque limpia.
 */
export default function OfferScreen({
  offer,
  position,
  onAccept,
  onReject,
  onExpire,
}: {
  offer: OfferView;
  position: LatLng | null;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onExpire: () => void;
}) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    playOfferAlert(offer.id);
  }, [offer.id]);

  const markers: MapMarker[] = [
    ...(position ? [{ id: "me", lat: position.lat, lng: position.lng, kind: "me" as const, label: "Tú" }] : []),
    { id: "pickup", lat: offer.pickup.lat, lng: offer.pickup.lng, kind: "pickup", label: "Recogida" },
    ...(offer.dropoff ? [{ id: "dropoff", lat: offer.dropoff.lat, lng: offer.dropoff.lng, kind: "dropoff" as const, label: "Destino" }] : []),
  ];
  const polyline: LatLng[] = [...(position ? [position] : []), offer.pickup, ...(offer.dropoff ? [offer.dropoff] : [])];

  const run = async (which: "accept" | "reject") => {
    setBusy(which);
    setError(null);
    try {
      await (which === "accept" ? onAccept() : onReject());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal");
      setBusy(null);
    }
  };

  const vehicle = [VEHICLE_LABELS[offer.vehicleKind], offer.vehicleLabel].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background safe-top safe-bottom" role="dialog" aria-modal="true" aria-label="Nueva solicitud">
      <header className="flex items-center gap-4 px-4 pt-4 pb-3">
        <Countdown until={offer.expiresAt} totalSeconds={OFFER_SECONDS} onExpire={onExpire} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Nueva solicitud</p>
          <h1 className="truncate text-xl font-black leading-tight">
            {KIND_ICONS[offer.kind]} {KIND_LABELS[offer.kind]}
          </h1>
          <p className="truncate text-sm text-muted">{vehicle}</p>
        </div>
      </header>

      <div className="h-44 shrink-0">
        <MapView className="h-full w-full" markers={markers} polyline={polyline} fitToMarkers interactive={false} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted">Ganas</p>
            <p className="text-5xl font-black leading-none tabular-nums">{formatQ(offer.payoutQ)}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">
              A {formatKm(offer.distanceToPickupKm)} · {formatMinutes(offer.etaToPickupMinutes)} de ti
            </p>
            {offer.kind === "TOW" && <p className="text-muted">Remolque de {formatKm(offer.towDistanceKm)}</p>}
          </div>
        </div>

        <ul className="mt-5 flex flex-col gap-3">
          <li className="flex gap-3">
            <span aria-hidden className="mt-0.5 text-lg leading-none">
              📍
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recogida</p>
              <p className="text-base font-semibold leading-snug">{placeLabel(offer.pickup)}</p>
            </div>
          </li>
          {offer.dropoff && (
            <li className="flex gap-3">
              <span aria-hidden className="mt-0.5 text-lg leading-none">
                🏁
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Destino</p>
                <p className="text-base font-semibold leading-snug">{placeLabel(offer.dropoff)}</p>
              </div>
            </li>
          )}
          <li className="flex gap-3">
            <span aria-hidden className="mt-0.5 text-lg leading-none">
              👤
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cliente</p>
              <p className="text-base font-semibold">{offer.clientFirstName}</p>
            </div>
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted">Oferta {offer.round} · El cliente paga en efectivo al terminar.</p>
      </div>

      <footer className="flex flex-col gap-3 px-4 pb-4 pt-2">
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" loading={busy === "reject"} disabled={busy !== null} onClick={() => void run("reject")}>
            Rechazar
          </Button>
          <Button variant="primary" size="lg" loading={busy === "accept"} disabled={busy !== null} onClick={() => void run("accept")}>
            Aceptar
          </Button>
        </div>
      </footer>
    </div>
  );
}
