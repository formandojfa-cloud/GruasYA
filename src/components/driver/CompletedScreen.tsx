"use client";

import { useState } from "react";
import { Button, Card, Notice, Row, Stars } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatKm, formatQ, formatTime, KIND_LABELS } from "@/lib/format";
import type { RequestView } from "@/lib/types";

/**
 * Resumen al terminar: lo que ganó, el cliente y la calificación al cliente.
 * "Listo" vuelve a la pantalla principal (sigue conectado salvo que sea externo).
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col justify-center gap-4 px-5 py-8 safe-top safe-bottom">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 pt-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-3xl" aria-hidden>
            ✅
          </div>
          <h1 className="text-2xl font-black">Servicio completado</h1>
          <p className="text-sm text-muted">{completedAt ? `Terminado a las ${formatTime(completedAt)}` : KIND_LABELS[job.kind]}</p>
        </div>

        <div className="rounded-2xl bg-surface px-4 py-4 text-center">
          <p className="text-sm font-semibold text-muted">Ganaste</p>
          <p className="text-5xl font-black tabular-nums">{formatQ(job.quote.providerPayoutQ)}</p>
        </div>

        <div className="px-1">
          <Row label="Cliente" value={name} />
          <Row label="Servicio" value={KIND_LABELS[job.kind]} />
          {job.kind === "TOW" && <Row label="Remolque" value={formatKm(job.distanceKm)} />}
          <Row label="Cobro al cliente (efectivo)" value={formatQ(job.priceTotal)} />
        </div>

        <div className="flex flex-col items-center gap-2 border-t border-border pt-4">
          <p className="text-sm font-semibold">{rated ? "¡Gracias por calificar!" : `¿Cómo fue ${name}?`}</p>
          <Stars value={stars} onChange={busy ? undefined : (n) => void rate(n)} size="lg" />
          {error && <Notice tone="danger">{error}</Notice>}
        </div>

        <Button size="lg" fullWidth onClick={onDone}>
          Listo
        </Button>
      </Card>
    </main>
  );
}
