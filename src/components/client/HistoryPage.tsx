"use client";

/** /historial: lista de servicios del cliente (GET /api/requests). */
import Link from "next/link";
import { EmptyState, Notice, Spinner, StatusPill, TopBar } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, formatQ, KIND_ICONS, KIND_LABELS } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { LINK_PRIMARY } from "./bits";
import { BottomNav } from "./BottomNav";
import { placeLabel } from "./constants";
import { MemberBadge, SessionGate, SessionProvider } from "./session";

export function HistoryPage() {
  return (
    <SessionProvider>
      <SessionGate>{(me) => <HistoryList isMember={me.isMember} />}</SessionGate>
    </SessionProvider>
  );
}

function HistoryList({ isMember }: { isMember: boolean }) {
  const { data, error, loading, refresh } = usePolling(() => api.get<{ requests: RequestView[] }>("/api/requests"), 15_000);
  const requests = data?.requests ?? [];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopBar title="Historial" subtitle="Tus servicios recientes" right={<MemberBadge isMember={isMember} />} />
      <main className="flex-1 p-4">
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
          <EmptyState
            icon="🧾"
            title="Aún no tienes servicios"
            body="Cuando pidas una grúa o una asistencia, aparecerá aquí con su estado y precio."
            action={
              <Link href="/" className={LINK_PRIMARY}>
                Pedir asistencia
              </Link>
            }
          />
        )}
        {requests.length > 0 && (
          <ul className="grid gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <HistoryItem req={r} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function HistoryItem({ req }: { req: RequestView }) {
  const fee = req.cancellation?.feeQ ?? 0;
  const amount = req.status === "CANCELLED" ? fee : req.priceTotal;
  return (
    <Link href={`/r/${req.id}`} className="block rounded-2xl border border-border bg-background p-4 shadow-sm transition hover:bg-surface active:bg-surface">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-bold">
          <span aria-hidden>{KIND_ICONS[req.kind]}</span> {KIND_LABELS[req.kind]}
        </span>
        <StatusPill status={req.status} />
      </div>
      <p className="mt-1 text-xs text-muted">{formatDateTime(req.timestamps.createdAt)}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate">
            <span aria-hidden>📍</span> {placeLabel(req.pickup)}
          </p>
          {req.dropoff && (
            <p className="truncate">
              <span aria-hidden>🏁</span> {placeLabel(req.dropoff)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{formatQ(amount)}</p>
          {req.status === "CANCELLED" && <p className="text-[11px] text-muted">{fee > 0 ? "cargo por cancelación" : "sin cargo"}</p>}
        </div>
      </div>
    </Link>
  );
}
