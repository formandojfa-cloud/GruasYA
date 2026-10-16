"use client";

import { useState } from "react";
import { Button, Notice, Row, Stars, StatusCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatKm, formatQ, formatTime, KIND_LABELS } from "@/lib/format";
import type { RequestView } from "@/lib/types";

/**
 * Resumen al terminar (tarjeta con borde verde): lo que ganó, el cliente y la
 * calificación al cliente. "Listo" vuelve a la pantalla principal.
 */
export default function CompletedScreen({ job, clientName, onDone }: { job: RequestView; clientName?: string | null; onDone: () => void }) {
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

  return (
    <StatusCard status="COMPLETED" title="Servicio completado">
      <p className="tenue -mt-1">{completedAt ? `Terminado a las ${formatTime(completedAt)} · ${KIND_LABELS[job.kind]}` : KIND_LABELS[job.kind]}</p>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px]">Ganaste</span>
        <span className="grande tabular-nums">{formatQ(job.quote.providerPayoutQ)}</span>
      </div>

      <div className="rounded-[10px] bg-surface px-3 py-0.5">
        <Row label="Cliente" value={name} />
        <Row label="Servicio" value={KIND_LABELS[job.kind]} />
        {job.kind === "TOW" && <Row label="Viaje" value={formatKm(job.distanceKm)} />}
        <Row label="Cobrado en efectivo" value={formatQ(job.priceTotal)} />
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-border pt-3">
        <p className="text-sm font-semibold">{rated ? "¡Gracias por calificar!" : `¿Cómo fue ${name}?`}</p>
        <Stars value={stars} onChange={busy ? undefined : (n) => void rate(n)} size="lg" />
        {error && <Notice tone="danger">{error}</Notice>}
      </div>

      <Button size="lg" fullWidth onClick={onDone}>
        Listo
      </Button>
    </StatusCard>
  );
}
