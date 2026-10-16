"use client";

/**
 * "Mi servicio": sondea GET /api/requests/:id cada 2.5 s y muestra la tarjeta
 * de estado del prototipo (buscando, sin grúa, en camino, llegó, en ruta,
 * completado, cancelado). Las acciones (central, cancelar, calificar) actualizan la vista.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Button, Input, Notice, Sheet, Spinner, Stars } from "@/components/ui";
import { api } from "@/lib/api";
import { escalationReasonLabel, formatDateTime, formatQ, statusLabelFor } from "@/lib/format";
import { useNow, usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { Toast, useToast } from "./bits";
import { ClientShell } from "./ClientShell";
import { apiErrorMessage, CANCELLATION_FEE_Q, elapsedLabel, isActiveStatus, POLL_MS, serviceNoun } from "./constants";
import { EtaLine, PinBlock, PlacesSummary, ProgressSteps, ProviderRow, QuoteLines, StateCard, Timeline } from "./RequestCard";
import { RequestMap } from "./RequestMap";

type Props = { initial: RequestView; onNewService: () => void };
type Busy = "help" | "cancel" | "rate" | null;

export function ActiveRequest({ initial, onNewService }: Props) {
  const [done, setDone] = useState(!isActiveStatus(initial.status));
  const fetcher = useCallback(async () => {
    const r = await api.get<RequestView>(`/api/requests/${initial.id}`);
    if (!isActiveStatus(r.status)) setDone(true);
    return r;
  }, [initial.id]);
  const { data, error, setData } = usePolling(fetcher, POLL_MS, { enabled: !done });
  const req = data ?? initial;

  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const now = useNow(1000);

  async function run(kind: Busy, fn: () => Promise<RequestView>, okMessage?: string): Promise<boolean> {
    setBusy(kind);
    setActionError(null);
    try {
      const view = await fn();
      setData(view);
      if (!isActiveStatus(view.status)) setDone(true);
      if (okMessage) showToast(okMessage);
      return true;
    } catch (e) {
      setActionError(apiErrorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const help = () => run("help", () => api.post<RequestView>(`/api/requests/${req.id}/help`), "La central te atenderá en breve");
  const cancel = async () => {
    const ok = await run("cancel", () => api.post<RequestView>(`/api/requests/${req.id}/cancel`, {}));
    if (ok) setCancelOpen(false);
  };
  const rate = (stars: number, comment: string) =>
    run("rate", () => api.post<RequestView>(`/api/requests/${req.id}/rate`, { stars, comment: comment.trim() || undefined }), "¡Gracias por calificar!");

  async function share() {
    const url = `${window.location.origin}/r/${req.id}`;
    const text = `Sigue mi ${serviceNoun(req.kind)} GruaYa en vivo`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "GruaYa", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast("Enlace copiado");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // Sin compartir ni portapapeles: mostramos el enlace para copiarlo a mano.
      setShareUrl(url);
    }
  }

  const noun = serviceNoun(req.kind);
  const tow = req.kind === "TOW";
  const feeWarn = req.status === "EN_ROUTE" || req.status === "ARRIVED";
  const elapsed = elapsedLabel(req.timestamps.createdAt, now);
  const active = isActiveStatus(req.status);

  const cancelButton = (
    <Button variant="danger" fullWidth onClick={() => setCancelOpen(true)}>
      Cancelar
    </Button>
  );
  const helpButton = (
    <Button variant="secondary" fullWidth loading={busy === "help"} onClick={help}>
      Hablar con la central
    </Button>
  );

  let state: ReactNode;
  let actions: ReactNode = null;
  switch (req.status) {
    case "SEARCHING":
      state = (
        <StateCard req={req} title={statusLabelFor("SEARCHING", req.kind)} subtitle={`Ofreciendo tu servicio a la ${noun} más cercana…`}>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner size="sm" />
            {req.search.offersSent > 0 ? `Contactando ${noun} ${req.search.offersSent} de ${req.search.maxOffers}` : "Buscando grúas conectadas"} ·{" "}
            <span className="tabular-nums">{elapsed}</span>
          </p>
          {req.search.currentOffer && <p className="text-xs text-muted">Esperando respuesta de {req.search.currentOffer.providerName}…</p>}
          <PlacesSummary req={req} />
        </StateCard>
      );
      actions = (
        <>
          {helpButton}
          {cancelButton}
        </>
      );
      break;
    case "ESCALATED":
      state = (
        <StateCard
          req={req}
          title={tow ? "Sin grúa cerca" : "Sin asistencia cerca"}
          subtitle={`La central de GruaYa te va a llamar para coordinar tu ${noun} por teléfono.`}
        >
          <p className="text-sm text-muted">
            {req.escalation ? escalationReasonLabel(req.escalation.reason) : "Buscando la mejor opción"} · <span className="tabular-nums">{elapsed}</span>
          </p>
          <PlacesSummary req={req} />
        </StateCard>
      );
      actions = cancelButton;
      break;
    case "EN_ROUTE":
    case "ARRIVED":
    case "IN_PROGRESS":
      state = (
        <StateCard req={req} title={statusLabelFor(req.status, req.kind)}>
          <EtaLine req={req} />
          {req.provider && <ProviderRow provider={req.provider} />}
          {req.status !== "IN_PROGRESS" && req.pin && <PinBlock pin={req.pin} providerKind={req.provider?.kind ?? null} />}
          <ProgressSteps status={req.status} />
        </StateCard>
      );
      actions = (
        <>
          <Button variant="secondary" fullWidth onClick={share}>
            Compartir viaje
          </Button>
          {helpButton}
          {feeWarn && cancelButton}
        </>
      );
      break;
    case "COMPLETED":
      state = (
        <StateCard req={req} title="Servicio completado" subtitle={req.timestamps.completedAt ? formatDateTime(req.timestamps.completedAt) : undefined}>
          {req.provider && <ProviderRow provider={req.provider} />}
          <QuoteLines quote={req.quote} total={req.priceTotal} />
          {req.ratings.client != null ? (
            <Notice tone="success">¡Gracias por calificar con {req.ratings.client} estrellas!</Notice>
          ) : (
            <RateForm who={req.provider?.name ?? null} busy={busy === "rate"} onSubmit={rate} />
          )}
        </StateCard>
      );
      actions = (
        <Button size="lg" fullWidth onClick={onNewService}>
          Pedir otro servicio
        </Button>
      );
      break;
    case "CANCELLED": {
      const c = req.cancellation;
      const who = c?.by === "CLIENT" ? "Cancelaste el servicio" : c?.by === "PBX" ? "La central canceló el servicio" : "El servicio fue cancelado";
      state = (
        <StateCard req={req} title={statusLabelFor("CANCELLED", req.kind)} subtitle={`${who}${c?.reason ? `: ${c.reason}` : ""}`}>
          {c && c.feeQ > 0 ? (
            <Notice tone="warning">
              Se aplicó un cargo por cancelación de <b>{formatQ(c.feeQ)}</b> porque la {noun} ya iba en camino.
            </Notice>
          ) : (
            <Notice tone="success">Sin cargo por cancelación.</Notice>
          )}
        </StateCard>
      );
      actions = (
        <Button size="lg" fullWidth onClick={onNewService}>
          Volver al inicio
        </Button>
      );
      break;
    }
  }

  return (
    <ClientShell section="servicio" hasActive onPedir={active ? undefined : onNewService} pedirDisabled={active}>
      <Toast message={toast} />
      {error && <Notice tone="warning">Sin conexión con el servidor: {error.message}. Reintentando…</Notice>}
      {actionError && !cancelOpen && <Notice tone="danger">{actionError}</Notice>}
      {state}

      <div className="mapa-marco">
        <RequestMap req={req} className="h-full w-full" />
      </div>

      {actions && <section className="tarjeta">{actions}</section>}
      <Timeline events={req.events} />

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={`¿Cancelar la ${noun}?`}>
        {feeWarn ? (
          <Notice tone="warning">
            La {noun} ya va en camino. Si cancelas ahora se aplica un cargo de <b>{formatQ(CANCELLATION_FEE_Q)}</b>.
          </Notice>
        ) : (
          <p className="tenue">Es gratis porque ninguna {noun} ha aceptado.</p>
        )}
        {actionError && (
          <Notice tone="danger" className="mt-3">
            {actionError}
          </Notice>
        )}
        <div className="mt-4 grid gap-2">
          <Button variant="danger" size="lg" fullWidth loading={busy === "cancel"} onClick={cancel}>
            Sí, cancelar
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setCancelOpen(false)}>
            Seguir con el servicio
          </Button>
        </div>
      </Sheet>

      <Sheet open={shareUrl !== null} onClose={() => setShareUrl(null)} title="Comparte este enlace">
        <p className="tenue">Quien lo abra verá tu servicio en vivo, sin tu PIN ni teléfonos.</p>
        <Input className="mt-3 font-mono text-sm" readOnly value={shareUrl ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de seguimiento" />
        <p className="mt-1 text-xs text-muted">Toca el enlace y mantén presionado para copiarlo.</p>
        <Button className="mt-3" fullWidth onClick={() => setShareUrl(null)}>
          Listo
        </Button>
      </Sheet>
    </ClientShell>
  );
}

function RateForm({ who, busy, onSubmit }: { who: string | null; busy: boolean; onSubmit: (stars: number, comment: string) => void }) {
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-surface p-3 text-center">
      <h3>{who ? `¿Cómo te fue con ${who}?` : "¿Cómo te fue?"}</h3>
      <div className="flex justify-center">
        <Stars value={stars} onChange={setStars} size="lg" />
      </div>
      <Input placeholder="Comentario (opcional)" aria-label="Comentario" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
      <Button fullWidth disabled={!stars} loading={busy} onClick={() => stars && onSubmit(stars, comment)}>
        Enviar calificación
      </Button>
    </div>
  );
}
