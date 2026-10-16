"use client";

import { useEffect, useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { BottomPanel, Button, Notice } from "@/components/ui";
import { DISPATCH } from "@/lib/config";
import { formatKm, formatMinutes, formatQ, KIND_LABELS, secondsUntil, VEHICLE_LABELS } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { LatLng } from "@/lib/geo";
import type { OfferView, ProviderSelf } from "@/lib/types";
import { GpsPill, MapOverlay, MapScreen, providerGlyph } from "./bits";
import type { DriverPosition, LocationReporter } from "./useLocationReporter";
import { placeLabel, playOfferAlert } from "./util";

const TOTAL_SECONDS = Math.round(DISPATCH.offerTtlMs / 1000);

/** Segundos que quedan en rojo ("37 s") y barra de tiempo que se vacía; avisa al llegar a cero. */
function useOfferTimer({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const now = useNow(250);
  const left = secondsUntil(until, now);
  useEffect(() => {
    if (left === 0) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);
  return {
    counter: (
      <span className="contador" role="timer" aria-live="polite" aria-label={`${left} segundos`}>
        {left} s
      </span>
    ),
    bar: (
      <div className="barra-tiempo" aria-hidden>
        <div
          style={{
            width: `${Math.max(0, Math.min(100, (left / TOTAL_SECONDS) * 100))}%`,
          }}
        />
      </div>
    ),
  };
}

function OfferCard({
  offer,
  busy,
  error,
  onExpire,
  run,
}: {
  offer: OfferView;
  busy: "accept" | "reject" | null;
  error: string | null;
  onExpire: () => void;
  run: (which: "accept" | "reject") => void;
}) {
  const timer = useOfferTimer({ until: offer.expiresAt, onExpire });
  const vehicle = [VEHICLE_LABELS[offer.vehicleKind], offer.vehicleLabel].filter(Boolean).join(" ");
  const what = offer.kind === "TOW" ? vehicle : `${KIND_LABELS[offer.kind]} · ${vehicle}`;
  const eta = offer.etaToPickupMinutes < 1 ? "menos de 1 min" : `unos ${formatMinutes(offer.etaToPickupMinutes)}`;

  return (
    <section className="tarjeta oferta" aria-labelledby="oferta-titulo">
      {timer.bar}
      <div className="flex items-center justify-between gap-3">
        <h2 id="oferta-titulo" className="text-[20px]">
          Nueva solicitud
        </h2>
        {timer.counter}
      </div>

      <div>
        <div className="grande tabular-nums">Ganas {formatQ(offer.payoutQ)}</div>
        <span className="tenue">Oferta {offer.round} · el cliente paga en efectivo al terminar</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <span className="marca-origen mt-1.5" aria-hidden />
          <p className="text-[15px] leading-snug">
            Cliente {offer.clientFirstName} a {formatKm(offer.distanceToPickupKm)} ({eta}) · {what}
            <br />
            <span className="text-muted">Recogida: {placeLabel(offer.pickup)}</span>
          </p>
        </div>
        {offer.dropoff && (
          <div className="flex items-start gap-3">
            <span className="marca-destino mt-1.5" aria-hidden />
            <p className="text-[15px] leading-snug">
              Destino: {placeLabel(offer.dropoff)} ({formatKm(offer.towDistanceKm)}) · <span className="text-muted">cobro en efectivo</span>
            </p>
          </div>
        )}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" loading={busy === "reject"} disabled={busy !== null} onClick={() => run("reject")}>
          Rechazar
        </Button>
        <Button variant="primary" size="lg" loading={busy === "accept"} disabled={busy !== null} onClick={() => run("accept")}>
          Aceptar
        </Button>
      </div>
    </section>
  );
}

/**
 * Oferta nueva: mapa con el cliente, el destino y tu grúa; en la hoja, una
 * tarjeta destacada con cuenta regresiva, lo que ganas, distancia y direcciones.
 * Se monta con `key={offer.id}` para que cada oferta suene y arranque limpia.
 */
export default function OfferScreen({
  self,
  offer,
  position,
  loc,
  onAccept,
  onReject,
  onExpire,
}: {
  self: ProviderSelf;
  offer: OfferView;
  position: DriverPosition | null;
  loc: LocationReporter;
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
    ...(position
      ? [
          {
            id: "me",
            lat: position.lat,
            lng: position.lng,
            kind: "provider" as const,
            heading: position.heading,
            glyph: providerGlyph(self.kind),
            label: "Tú",
          },
        ]
      : []),
    {
      id: "pickup",
      lat: offer.pickup.lat,
      lng: offer.pickup.lng,
      kind: "pickup",
      label: "Cliente",
    },
    ...(offer.dropoff
      ? [
          {
            id: "dropoff",
            lat: offer.dropoff.lat,
            lng: offer.dropoff.lng,
            kind: "dropoff" as const,
            label: "Destino",
          },
        ]
      : []),
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

  return (
    <MapScreen
      map={<MapView className="h-full w-full" markers={markers} polyline={polyline} fitToMarkers interactive={false} />}
      overlay={
        <MapOverlay>
          <GpsPill loc={loc} reporting />
        </MapOverlay>
      }
    >
      <BottomPanel height="alta">
        <OfferCard offer={offer} busy={busy} error={error} onExpire={onExpire} run={(w) => void run(w)} />
      </BottomPanel>
    </MapScreen>
  );
}
