"use client";

/**
 * /r/[id]: seguimiento. Si la sesión es del dueño usa GET /api/requests/:id;
 * si no (enlace compartido), GET /api/track/:id sin PIN ni teléfonos.
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { EmptyState, Notice, Spinner } from "@/components/ui";
import { api, ApiClientError } from "@/lib/api";
import { escalationReasonLabel, formatQ, statusLabelFor } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { LINK_PRIMARY } from "./bits";
import { ClientShell } from "./ClientShell";
import { isActiveStatus, POLL_MS, serviceNoun } from "./constants";
import { EtaLine, PinBlock, PlacesSummary, ProgressSteps, ProviderRow, QuoteLines, StateCard, Timeline } from "./RequestCard";
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
    return (
      <ClientShell section={null} showSegments={false} suffix="seguimiento">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : (
          <section className="tarjeta">
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
          </section>
        )}
      </ClientShell>
    );
  }

  const req = data;
  const owner = mode === "owner";
  const active = isActiveStatus(req.status);
  const live = req.status === "EN_ROUTE" || req.status === "ARRIVED" || req.status === "IN_PROGRESS";
  const noun = serviceNoun(req.kind);
  const subtitle =
    req.status === "SEARCHING"
      ? req.search.offersSent > 0
        ? `Contactando ${noun} ${req.search.offersSent} de ${req.search.maxOffers}`
        : `Ofreciendo el servicio a la ${noun} más cercana…`
      : req.status === "ESCALATED"
        ? req.escalation
          ? escalationReasonLabel(req.escalation.reason)
          : "La central está coordinando el servicio."
        : undefined;

  return (
    <ClientShell section={owner && active ? "servicio" : null} hasActive={owner && active} showSegments={owner} suffix={owner ? undefined : "seguimiento"}>
      {error && <Notice tone="warning">Sin conexión con el servidor: {error.message}</Notice>}
      <StateCard req={req} title={req.status === "COMPLETED" ? "Servicio completado" : statusLabelFor(req.status, req.kind)} subtitle={subtitle}>
        {live && <EtaLine req={req} />}
        {req.provider && (live || req.status === "COMPLETED") && <ProviderRow provider={req.provider} />}
        {owner && req.pin && (req.status === "EN_ROUTE" || req.status === "ARRIVED") && <PinBlock pin={req.pin} providerKind={req.provider?.kind ?? null} />}
        {(live || req.status === "COMPLETED") && <ProgressSteps status={req.status} />}
      </StateCard>

      <div className="mapa-marco">
        <RequestMap req={req} className="h-full w-full" />
      </div>

      <section className="tarjeta">
        <PlacesSummary req={req} />
        {req.status === "COMPLETED" && <QuoteLines quote={req.quote} total={req.priceTotal} />}
        {req.status === "CANCELLED" && req.cancellation && req.cancellation.feeQ > 0 && <Notice tone="warning">Cargo por cancelación: {formatQ(req.cancellation.feeQ)}</Notice>}
        {!owner && <p className="tenue chico">Vista compartida: se actualiza sola mientras el servicio está activo.</p>}
        {owner && active && (
          <Link href="/" className={`${LINK_PRIMARY} w-full`}>
            Ir a mi servicio
          </Link>
        )}
      </section>
      <Timeline events={req.events} />
    </ClientShell>
  );
}
