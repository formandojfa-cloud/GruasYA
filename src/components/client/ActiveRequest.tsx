"use client";

/**
 * "Mi servicio": sondea GET /api/requests/:id cada 2.5 s y muestra la hoja del
 * prototipo sobre el mapa completo (buscando, sin grúa, en camino, llegó, en
 * ruta, completado, cancelado). Las acciones (central, cancelar, compartir,
 * calificar) actualizan la vista.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Button, Input, Notice, ProgressBar, Sheet, Stars } from "@/components/ui";
import { api } from "@/lib/api";
import { escalationReasonLabel, formatDateTime, formatQ, statusLabelFor } from "@/lib/format";
import { useNow, usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { Toast, useToast } from "./bits";
import { ClientScreen } from "./ClientShell";
import { apiErrorMessage, CANCELLATION_FEE_Q, elapsedLabel, isActiveStatus, POLL_MS, serviceNoun } from "./constants";
import { ActionButton, ContactActions, EtaLine, PinBlock, ProgressSteps, ProviderPerson, QuoteLines, ServiceDetail, ServiceHeader, Timeline } from "./RequestCard";
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
    const text = `Sigue mi ${serviceNoun(req.kind)} GrúaYa en vivo`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "GrúaYa", text, url });
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
  const live = req.providerLive;
  const etaToMe = req.status === "EN_ROUTE" && live && live.target === "PICKUP" ? live.etaMinutes : null;

  const cancelAction = <ActionButton icon="✕" label="Cancelar" danger onClick={() => setCancelOpen(true)} />;
  const helpAction = <ActionButton icon="🎧" label="Central" onClick={help} disabled={busy === "help"} />;

  let body: ReactNode;
  let footer: ReactNode = null;
  switch (req.status) {
    case "SEARCHING":
      body = (
        <>
          <ServiceHeader title={statusLabelFor("SEARCHING", req.kind)} subtitle={`Ofreciendo tu servicio a la ${noun} más cercana`}>
            <p className="tenue chico tabular-nums">
              {req.search.offersSent > 0 ? `Contactando ${noun} ${req.search.offersSent} de ${req.search.maxOffers}` : `Buscando ${noun}s conectadas`} · {elapsed}
              {req.search.currentOffer && ` · esperando a ${req.search.currentOffer.providerName}`}
            </p>
          </ServiceHeader>
          <ProgressBar label={`Buscando ${noun}`} />
          <div className="flex gap-2">
            {helpAction}
            {cancelAction}
          </div>
        </>
      );
      break;
    case "ESCALATED":
      body = (
        <>
          <ServiceHeader
            title={tow ? "Sin grúa cerca" : "Sin asistencia cerca"}
            subtitle={`No encontramos ${noun} libre cerca. La central de GrúaYa te va a llamar para coordinarla por teléfono.`}
          >
            <p className="tenue chico tabular-nums">
              {req.escalation ? escalationReasonLabel(req.escalation.reason) : "Buscando la mejor opción"} · {elapsed}
            </p>
          </ServiceHeader>
          <div className="flex gap-2">
            <ActionButton icon="✕" label="Cancelar solicitud" danger onClick={() => setCancelOpen(true)} />
          </div>
        </>
      );
      break;
    case "EN_ROUTE":
    case "ARRIVED":
    case "IN_PROGRESS":
      body = (
        <>
          <ServiceHeader title={statusLabelFor(req.status, req.kind)} eta={etaToMe}>
            <EtaLine req={req} />
          </ServiceHeader>
          {req.provider && <ProviderPerson provider={req.provider} />}
          {req.status !== "IN_PROGRESS" && req.pin && <PinBlock pin={req.pin} providerKind={req.provider?.kind ?? null} />}
          <div className="flex gap-2">
            {req.provider && <ContactActions provider={req.provider} />}
            <ActionButton icon="📤" label="Compartir viaje" onClick={share} />
            {helpAction}
            {feeWarn && cancelAction}
          </div>
          <ProgressSteps status={req.status} />
        </>
      );
      break;
    case "COMPLETED":
      body = (
        <>
          <ServiceHeader title="Completado" subtitle={req.timestamps.completedAt ? formatDateTime(req.timestamps.completedAt) : undefined} />
          {req.provider && <ProviderPerson provider={req.provider} />}
          {req.ratings.client != null ? (
            <Notice tone="success">¡Gracias por calificar con {req.ratings.client} estrellas!</Notice>
          ) : (
            <RateForm who={req.provider?.name ?? null} busy={busy === "rate"} onSubmit={rate} />
          )}
          <QuoteLines quote={req.quote} total={req.priceTotal} />
        </>
      );
      footer = (
        <Button size="lg" fullWidth onClick={onNewService}>
          Pedir otro servicio
        </Button>
      );
      break;
    case "CANCELLED": {
      const c = req.cancellation;
      const who = c?.by === "CLIENT" ? "Cancelaste el servicio" : c?.by === "PBX" ? "La central canceló el servicio" : "El servicio fue cancelado";
      body = (
        <>
          <ServiceHeader title={statusLabelFor("CANCELLED", req.kind)} subtitle={`${who}${c?.reason ? `: ${c.reason}` : ""}`} />
          {c && c.feeQ > 0 ? (
            <Notice tone="warning">
              Se aplicó un cargo por cancelación de <b>{formatQ(c.feeQ)}</b> porque la {noun} ya iba en camino.
            </Notice>
          ) : (
            <Notice tone="success">Sin cargo por cancelación.</Notice>
          )}
        </>
      );
      footer = (
        <Button size="lg" fullWidth onClick={onNewService}>
          Volver al inicio
        </Button>
      );
      break;
    }
  }

  return (
    <ClientScreen
      section="servicio"
      hasActive
      onPedir={active ? undefined : onNewService}
      pedirDisabled={active}
      map={<RequestMap req={req} className="h-full w-full" />}
      footer={footer}
      extra={
        <>
          <Toast message={toast} />
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
        </>
      }
    >
      {error && <Notice tone="warning">Sin conexión con el servidor: {error.message}. Reintentando…</Notice>}
      {actionError && !cancelOpen && <Notice tone="danger">{actionError}</Notice>}
      {body}
      <div className="separador" />
      <ServiceDetail req={req} />
      <Timeline events={req.events} />
    </ClientScreen>
  );
}

function RateForm({ who, busy, onSubmit }: { who: string | null; busy: boolean; onSubmit: (stars: number, comment: string) => void }) {
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-surface-2 p-3 text-center">
      <h3>{who ? `¿Cómo te fue con ${who}?` : "¿Cómo te fue?"}</h3>
      <div className="flex justify-center">
        <Stars value={stars} onChange={setStars} size="lg" />
      </div>
      <Input className="!bg-background" placeholder="Comentario (opcional)" aria-label="Comentario" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
      <Button fullWidth disabled={!stars} loading={busy} onClick={() => stars && onSubmit(stars, comment)}>
        Enviar calificación
      </Button>
    </div>
  );
}
