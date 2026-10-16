"use client";

import { useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { BottomPanel, Button, Notice, Stars } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatKm, formatQ, formatTime, KIND_LABELS } from "@/lib/format";
import type { ProviderSelf, RequestView } from "@/lib/types";
import { MapScreen, NumbersRows, ProviderCard, providerGlyph, SheetRow } from "./bits";
import type { DriverPosition } from "./useLocationReporter";

/**
 * Resumen al terminar: lo que ganó, el cliente y la calificación al cliente.
 * "Listo" vuelve a la pantalla principal.
 */
export default function CompletedScreen({
  self,
  job,
  clientName,
  position,
  onDone,
}: {
  self: ProviderSelf;
  job: RequestView;
  clientName?: string | null;
  position: DriverPosition | null;
  onDone: () => void;
}) {
  const [stars, setStars] = useState<number | null>(job.ratings.provider);
  const [rated, setRated] = useState<boolean>(job.ratings.provider != null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = async (n: number) => {
    setStars(n);
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/provider/jobs/${job.id}/rate`, { stars: n });
      setRated(true);
    } catch (e) {
      setError(errorMessage(e, "No se pudo enviar la calificación"));
    } finally {
      setBusy(false);
    }
  };

  const name = clientName ?? job.client?.name ?? "Cliente";
  const completedAt = job.timestamps.completedAt;
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
    ...(job.dropoff
      ? [
          {
            id: "dropoff",
            lat: job.dropoff.lat,
            lng: job.dropoff.lng,
            kind: "dropoff" as const,
            label: "Entregado",
          },
        ]
      : []),
  ];

  return (
    <MapScreen map={<MapView className="h-full w-full" markers={markers} fitToMarkers interactive={false} />}>
      <BottomPanel
        height="alta"
        footer={
          <Button size="lg" fullWidth onClick={onDone}>
            Listo
          </Button>
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="titulo-hoja">Servicio completado</h2>
            <p className="tenue mt-1 text-[15px]">{completedAt ? `Terminado a las ${formatTime(completedAt)} · ${KIND_LABELS[job.kind]}` : KIND_LABELS[job.kind]}</p>
          </div>
          <span className="estado-punto en-linea mt-3" aria-hidden />
        </div>

        <div>
          <div className="grande tabular-nums">Ganaste {formatQ(job.quote.providerPayoutQ)}</div>
          <span className="tenue">Cobraste {formatQ(job.priceTotal)} en efectivo</span>
        </div>

        <div className="rounded-[12px] bg-surface-2 px-3 py-2">
          <SheetRow label="Cliente" value={name} className="py-1 text-[15px]" />
          <SheetRow label="Servicio" value={KIND_LABELS[job.kind]} className="py-1 text-[15px]" />
          {job.kind === "TOW" && <SheetRow label="Viaje" value={formatKm(job.distanceKm)} className="py-1 text-[15px]" />}
        </div>

        <div className="flex flex-col items-center gap-2 rounded-[12px] border border-border p-3">
          <p className="text-sm font-semibold">{rated ? "¡Gracias por calificar!" : `¿Cómo fue ${name}?`}</p>
          <Stars value={stars} onChange={busy ? undefined : (n) => void rate(n)} size="lg" />
          {error && <Notice tone="danger">{error}</Notice>}
        </div>

        <div className="separador" />
        <ProviderCard self={self} />
        <NumbersRows today={self.today} />
      </BottomPanel>
    </MapScreen>
  );
}
