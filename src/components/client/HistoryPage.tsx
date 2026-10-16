"use client";

/** /historial: lista de servicios del cliente (GET /api/requests) como tarjetas. */
import Link from "next/link";
import { EmptyState, Notice, Spinner, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, formatQ, KIND_ICONS, KIND_LABELS } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { ClientSelf, RequestView } from "@/lib/types";
import { LINK_PRIMARY } from "./bits";
import { ClientShell } from "./ClientShell";
import { placeLabel } from "./constants";
import { SessionGate, SessionProvider } from "./session";

export function HistoryPage() {
  return (
    <SessionProvider>
      <SessionGate>{(me) => <HistoryList me={me} />}</SessionGate>
    </SessionProvider>
  );
}

function HistoryList({ me }: { me: ClientSelf }) {
  const { data, error, loading, refresh } = usePolling(() => api.get<{ requests: RequestView[] }>("/api/requests"), 15_000);
  const requests = data?.requests ?? [];

  return (
    <ClientShell section="historial" hasActive={!!me.activeRequest}>
      <section className="tarjeta">
        <h2>Historial</h2>
        <p className="tenue">Tus servicios recientes, con su estado y precio.</p>
      </section>
      {loading && !data && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}
      {error && !data && (
        <Notice tone="danger" className="flex items-center justify-between gap-3">
          <span>{error.message}</span>
          <button type="button" onClick={() => void refresh()} className="font-semibold underline">
            Reintentar
          </button>
        </Notice>
      )}
      {data && requests.length === 0 && (
        <section className="tarjeta">
          <EmptyState
            icon="🧾"
            title="Aún no hay servicios."
            body="Cuando pidas una grúa o una asistencia, aparecerá aquí con su estado y precio."
            action={
              <Link href="/" className={LINK_PRIMARY}>
                Pedir grúa
              </Link>
            }
          />
        </section>
      )}
      {requests.map((r) => (
        <HistoryItem key={r.id} req={r} />
      ))}
    </ClientShell>
  );
}

function HistoryItem({ req }: { req: RequestView }) {
  const fee = req.cancellation?.feeQ ?? 0;
  const amount = req.status === "CANCELLED" ? fee : req.priceTotal;
  return (
    <Link href={`/r/${req.id}`} className="tarjeta transition hover:bg-surface active:bg-surface">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[17px] font-bold">
          <span aria-hidden>{KIND_ICONS[req.kind]}</span> {KIND_LABELS[req.kind]}
        </span>
        <StatusPill status={req.status} />
      </div>
      <p className="tenue chico -mt-1">{formatDateTime(req.timestamps.createdAt)}</p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate">
            <span aria-hidden>🚗</span> {placeLabel(req.pickup)}
          </p>
          {req.dropoff && (
            <p className="truncate">
              <span aria-hidden>🏁</span> {placeLabel(req.dropoff)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums">{formatQ(amount)}</p>
          {req.status === "CANCELLED" && <p className="text-[11px] text-muted">{fee > 0 ? "cargo por cancelación" : "sin cargo"}</p>}
        </div>
      </div>
    </Link>
  );
}
