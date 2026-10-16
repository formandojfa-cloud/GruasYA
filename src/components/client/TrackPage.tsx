"use client";

/**
 * /r/[id]: seguimiento. Si la sesión es del dueño usa GET /api/requests/:id;
 * si no (enlace compartido), GET /api/track/:id sin PIN ni teléfonos.
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { EmptyState, Notice, Spinner, StatusPill } from "@/components/ui";
import { api, ApiClientError } from "@/lib/api";
import { escalationReasonLabel, formatQ, statusLabelFor } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { BackButton, LINK_PRIMARY } from "./bits";
import { isActiveStatus, POLL_MS, serviceNoun } from "./constants";
import { EtaLine, PinBlock, PlacesSummary, ProgressSteps, ProviderRow, QuoteLines, Timeline } from "./RequestCard";
import { MapScreen } from "./MapScreen";
import { RequestMap } from "./RequestMap";

type Mode = "owner" | "share";

export function TrackPage({ id }: { id: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [done, setDone] = useState(false);

  const fetcher = useCallback(async (): Promise<RequestView> => {
    let view: RequestView | null = null;
    if (mode !== "share") {
      try {
        view = await api.get<RequestView>(`/api/requests/${id}`);
        setMode("owner");
      } catch (e) {
        if (!(e instanceof ApiClientError) || ![401, 403, 404].includes(e.status)) throw e;
        setMode("share");
      }
    }
    if (!view) {
      try {
        view = await api.get<RequestView>(`/api/track/${id}`);
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 404) setDone(true);
        throw e;
      }
    }
    if (!isActiveStatus(view.status)) setDone(true);
    return view;
  }, [id, mode]);

  const { data, error, loading } = usePolling(fetcher, POLL_MS, { enabled: !done, deps: [id] });

  if (!data) {
    if (loading) {
      return (
        <div className="flex h-dvh items-center justify-center bg-background">
          <Spinner size="lg" />
        </div>
      );
    }
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background">
        <EmptyState
          icon="🔎"
          title="No encontramos este servicio"
          body={error?.message ?? "Revisa el enlace e inténtalo de nuevo."}
          action={
            <Link href="/" className={LINK_PRIMARY}>
              Ir al inicio
            </Link>
          }
        />
      </div>
    );
  }

  const req = data;
  const owner = mode === "owner";
  const active = isActiveStatus(req.status);
  const live = req.status === "EN_ROUTE" || req.status === "ARRIVED" || req.status === "IN_PROGRESS";
  const noun = serviceNoun(req.kind);

  return (
    <MapScreen
      mapClassName="h-[46dvh]"
      map={<RequestMap req={req} className="h-full w-full" />}
      top={
        <div className="flex items-center gap-2">
          <BackButton href="/" label="Ir al inicio" />
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-background px-3 py-2 shadow-md">
            <span className="truncate text-sm font-bold">{owner ? "Tu servicio" : "Seguimiento en vivo"}</span>
            <StatusPill status={req.status} />
          </div>
        </div>
      }
    >
      <>
        {error && (
          <Notice tone="warning" className="mb-2 text-xs">
            Sin conexión con el servidor: {error.message}
          </Notice>
        )}
        <h2 className="text-xl font-bold">{statusLabelFor(req.status, req.kind)}</h2>
        {req.status === "SEARCHING" && (
          <p className="text-sm text-muted">
            {req.search.offersSent > 0 ? `Contactando ${noun} ${req.search.offersSent} de ${req.search.maxOffers}` : "Buscando proveedores conectados"}
          </p>
        )}
        {req.status === "ESCALATED" && req.escalation && <p className="text-sm text-muted">{escalationReasonLabel(req.escalation.reason)}</p>}
        {live && (
          <div className="mt-1">
            <EtaLine req={req} />
          </div>
        )}
        {req.provider && (live || req.status === "COMPLETED") && (
          <div className="mt-3">
            <ProviderRow provider={req.provider} />
          </div>
        )}
        {owner && req.pin && (req.status === "EN_ROUTE" || req.status === "ARRIVED") && (
          <div className="mt-3">
            <PinBlock pin={req.pin} providerKind={req.provider?.kind ?? null} />
          </div>
        )}
        {(live || req.status === "COMPLETED") && (
          <div className="mt-4">
            <ProgressSteps status={req.status} />
          </div>
        )}
        <div className="mt-4">
          <PlacesSummary req={req} />
        </div>
        {req.status === "COMPLETED" && (
          <div className="mt-3">
            <QuoteLines quote={req.quote} total={req.priceTotal} />
          </div>
        )}
        {req.status === "CANCELLED" && req.cancellation && req.cancellation.feeQ > 0 && (
          <Notice tone="warning" className="mt-3">
            Cargo por cancelación: {formatQ(req.cancellation.feeQ)}
          </Notice>
        )}
        {!owner && <p className="mt-3 text-xs text-muted">Vista compartida: se actualiza sola mientras el servicio está activo.</p>}
        <div className="mt-4">
          <Timeline events={req.events} />
        </div>
        {owner && active && (
          <Link href="/" className={`${LINK_PRIMARY} mt-4 w-full`}>
            Ir a mi servicio
          </Link>
        )}
      </>
    </MapScreen>
  );
}
