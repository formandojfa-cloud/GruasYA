"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Button, Card, EmptyState, Notice, Spinner, StatusPill, TopBar } from "@/components/ui";
import { api, ApiClientError } from "@/lib/api";
import { formatDateTime, formatKm, formatQ, KIND_ICONS, KIND_LABELS } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { placeLabel } from "./util";

type HistoryJob = RequestView & { payoutQ: number };
type History = { jobs: HistoryJob[]; totalQ: number };

/** Servicios terminados o cancelados del gruero, con lo que ganó en cada uno. */
export default function DriverHistory() {
  const fetcher = useCallback(() => api.get<History>("/api/provider/history"), []);
  const { data, error, loading, refresh } = usePolling(fetcher, 60_000);

  const unauthorized = error instanceof ApiClientError && error.status === 401;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col">
      <TopBar title="Historial" back="/driver" subtitle="Tus servicios y ganancias" />
      <main className="flex flex-1 flex-col gap-3 p-4 safe-bottom">
        {loading && !data && (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        )}

        {unauthorized && (
          <EmptyState
            icon="🔒"
            title="Inicia sesión"
            body="Entra con tu enlace de acceso para ver tu historial."
            action={
              <Link href="/driver" className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
                Ir a la app
              </Link>
            }
          />
        )}

        {error && !unauthorized && (
          <Notice tone="danger" className="flex items-center justify-between gap-3">
            <span>{error.message}</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()}>
              Reintentar
            </Button>
          </Notice>
        )}

        {data && (
          <>
            <Card className="flex items-end justify-between bg-surface">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total ganado</p>
                <p className="text-4xl font-black tabular-nums">{formatQ(data.totalQ)}</p>
              </div>
              <p className="text-sm text-muted">
                {data.jobs.filter((j) => j.status === "COMPLETED").length} completados · {data.jobs.length} en total
              </p>
            </Card>

            {data.jobs.length === 0 ? (
              <EmptyState icon="🚛" title="Aún no tienes servicios" body="Cuando completes tu primer servicio aparecerá aquí con lo que ganaste." />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.jobs.map((j) => {
                  const when = j.timestamps.completedAt ?? j.timestamps.cancelledAt ?? j.timestamps.createdAt;
                  return (
                    <li key={j.id}>
                      <Card className="flex items-center gap-3 py-3">
                        <span aria-hidden className="text-2xl leading-none">
                          {KIND_ICONS[j.kind]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-bold">{KIND_LABELS[j.kind]}</p>
                            <StatusPill status={j.status} />
                          </div>
                          <p className="text-xs text-muted">{formatDateTime(when)}</p>
                          <p className="truncate text-xs text-muted">
                            {placeLabel(j.pickup)}
                            {j.dropoff ? ` → ${placeLabel(j.dropoff)}` : ""}
                            {j.kind === "TOW" ? ` · ${formatKm(j.distanceKm)}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-black tabular-nums ${j.payoutQ > 0 ? "" : "text-muted"}`}>{formatQ(j.payoutQ)}</p>
                          {j.ratings.client != null && <p className="text-xs text-warning">★ {j.ratings.client}</p>}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
