"use client";

import { useEffect, useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { Button, Notice } from "@/components/ui";
import { formatKm, formatMinutes, formatQ, KIND_LABELS, secondsUntil, VEHICLE_LABELS } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { LatLng } from "@/lib/geo";
import type { OfferView } from "@/lib/types";
import { placeLabel, playOfferAlert } from "./util";

/** Segundos que quedan, en rojo como en el prototipo ("87 s"); avisa al llegar a cero. */
function OfferTimer({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const now = useNow(250);
  const left = secondsUntil(until, now);
  useEffect(() => {
    if (left === 0) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);
  return (
    <span className="contador" role="timer" aria-live="polite" aria-label={`${left} segundos`}>
      {left} s
    </span>
  );
}

/**
 * Oferta nueva: tarjeta con borde amarillo, cuenta regresiva, lo que gana,
 * distancia y direcciones. Se monta con `key={offer.id}` para que cada oferta
 * suene y arranque limpia.
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
    { id: "pickup", lat: offer.pickup.lat, lng: offer.pickup.lng, kind: "pickup", label: "Cliente" },
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

  const vehicle = [VEHICLE_LABELS[offer.vehicleKind], offer.vehicleLabel].filter(Boolean).join(" ");
  const what = offer.kind === "TOW" ? vehicle : `${KIND_LABELS[offer.kind]} · ${vehicle}`;

  return (
    <>
      <section className="tarjeta oferta" aria-labelledby="oferta-titulo">
        <div className="flex items-center justify-between gap-3">
          <h2 id="oferta-titulo" className="text-[22px]">
            Nueva solicitud
          </h2>
          <OfferTimer until={offer.expiresAt} onExpire={onExpire} />
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[17px]">Ganas</span>
          <span className="grande tabular-nums">{formatQ(offer.payoutQ)}</span>
        </div>

        <p className="tenue">
          Cliente {offer.clientFirstName} a {formatKm(offer.distanceToPickupKm)} (unos {formatMinutes(offer.etaToPickupMinutes)}) · {what}
        </p>
        <p className="tenue">Recogida: {placeLabel(offer.pickup)}</p>
        {offer.dropoff && (
          <p className="tenue">
            Destino: {placeLabel(offer.dropoff)} ({formatKm(offer.towDistanceKm)}) · cobro en efectivo
          </p>
        )}
        <p className="tenue chico">Oferta {offer.round} · El cliente paga en efectivo al terminar.</p>

        {error && <Notice tone="danger">{error}</Notice>}

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" loading={busy === "reject"} disabled={busy !== null} onClick={() => void run("reject")}>
            Rechazar
          </Button>
          <Button variant="primary" size="lg" loading={busy === "accept"} disabled={busy !== null} onClick={() => void run("accept")}>
            Aceptar
          </Button>
        </div>
      </section>

      <section className="tarjeta" aria-label="Mapa">
        <div className="mapa-marco">
          <MapView className="h-full w-full" markers={markers} polyline={polyline} fitToMarkers interactive={false} />
        </div>
      </section>
    </>
  );
}
