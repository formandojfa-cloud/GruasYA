"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Button, cn, EmptyState, Notice, Spinner, statusClass, StatusPill } from "@/components/ui";
import { api, ApiClientError } from "@/lib/api";
import { formatDateTime, formatKm, formatQ, KIND_ICONS, KIND_LABELS } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { DriverShell } from "./bits";
import { placeLabel } from "./util";

type HistoryJob = RequestView & { payoutQ: number };
type History = { jobs: HistoryJob[]; totalQ: number };

/** Servicios terminados o cancelados del piloto, con lo que ganó en cada uno: lista de tarjetas. */
export default function DriverHistory() {
  const fetcher = useCallback(() => api.get<History>("/api/provider/history"), []);
  const { data, error, loading, refresh } = usePolling(fetcher, 60_000);

  const unauthorized = error instanceof ApiClientError && error.status === 401;

  return (
    <DriverShell section="historial" footer={data ? "Lo que ganaste en cada servicio, ya con la tarifa de piloto." : undefined}>
      {loading && !data && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" className="text-muted" />
        </div>
      )}

      {unauthorized && (
        <section className="tarjeta">
          <EmptyState
            icon="🔒"
            title="Inicia sesión"
            body="Entra con tu enlace de acceso para ver tu historial."
            action={
              <Link href="/driver" className="inline-flex h-11 items-center justify-center rounded-xl border border-amarillo bg-amarillo px-5 font-bold text-primary-foreground">
                Ir a la app
              </Link>
            }
          />
        </section>
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
          <section className="tarjeta" aria-label="Total ganado">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="tenue">Total ganado</p>
                <p className="grande tabular-nums">{formatQ(data.totalQ)}</p>
              </div>
              <p className="tenue chico text-right">
                {data.jobs.filter((j) => j.status === "COMPLETED").length} completados
                <br />
                {data.jobs.length} en total
              </p>
            </div>
          </section>

          {data.jobs.length === 0 ? (
            <section className="tarjeta">
              <EmptyState icon="🚚" title="Aún no hay servicios." body="Cuando completes tu primer servicio aparecerá aquí con lo que ganaste." />
            </section>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.jobs.map((j) => {
                const when = j.timestamps.completedAt ?? j.timestamps.cancelledAt ?? j.timestamps.createdAt;
                return (
                  <li key={j.id}>
                    <section className={cn("tarjeta", statusClass(j.status))}>
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="text-2xl leading-none">
                          {KIND_ICONS[j.kind]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-bold">{KIND_LABELS[j.kind]}</p>
                            <StatusPill status={j.status} />
                          </div>
                          <p className="tenue chico">{formatDateTime(when)}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("text-lg font-bold tabular-nums", j.payoutQ > 0 ? "" : "text-muted")}>{formatQ(j.payoutQ)}</p>
                          {j.ratings.client != null && <p className="chico text-amarillo">★ {j.ratings.client}</p>}
                        </div>
                      </div>
                      <p className="tenue chico">
                        {placeLabel(j.pickup)}
                        {j.dropoff ? ` → ${placeLabel(j.dropoff)}` : ""}
                        {j.kind === "TOW" ? ` · ${formatKm(j.distanceKm)}` : ""}
                      </p>
                    </section>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </DriverShell>
  );
}
