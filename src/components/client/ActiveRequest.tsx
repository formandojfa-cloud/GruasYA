"use client";

/**
 * Pantalla de la solicitud en curso: sondea GET /api/requests/:id cada 2.5 s y
 * muestra búsqueda, escalado, grúa en camino / llegó / en curso, completado o
 * cancelado. Las acciones (ayuda, cancelar, calificar) actualizan la vista.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Button, Input, Notice, Sheet, Spinner, Stars } from "@/components/ui";
import { api } from "@/lib/api";
import { escalationReasonLabel, formatDateTime, formatQ, statusLabelFor } from "@/lib/format";
import { useNow, usePolling } from "@/lib/hooks";
import type { RequestView } from "@/lib/types";
import { Toast, useToast } from "./bits";
import { apiErrorMessage, CANCELLATION_FEE_Q, elapsedLabel, isActiveStatus, POLL_MS, serviceNoun } from "./constants";
import { EtaLine, PinBlock, PlacesSummary, ProgressSteps, ProviderRow, QuoteLines, Timeline } from "./RequestCard";
import { MapScreen } from "./MapScreen";
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

  const help = () => run("help", () => api.post<RequestView>(`/api/requests/${req.id}/help`), "Un operador te atenderá en breve");
  const cancel = async () => {
    const ok = await run("cancel", () => api.post<RequestView>(`/api/requests/${req.id}/cancel`, {}));
    if (ok) setCancelOpen(false);
  };
  const rate = (stars: number, comment: string) =>
    run("rate", () => api.post<RequestView>(`/api/requests/${req.id}/rate`, { stars, comment: comment.trim() || undefined }), "¡Gracias por calificar!");

  async function share() {
    const url = `${window.location.origin}/r/${req.id}`;
    const text = `Sigue mi ${serviceNoun(req.kind)} en vivo`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Asistencia Vial", text, url });
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
  const feeWarn = req.status === "EN_ROUTE" || req.status === "ARRIVED";
  const elapsed = elapsedLabel(req.timestamps.createdAt, now);

  let panel: ReactNode;
  switch (req.status) {
    case "SEARCHING":
      panel = (
        <>
          <div className="flex items-center gap-3">
            <Spinner />
            <div className="min-w-0">
              <h2 className="text-lg font-bold">{statusLabelFor("SEARCHING", req.kind)}</h2>
              <p className="text-sm text-muted">
                {req.search.offersSent > 0 ? `Contactando ${noun} ${req.search.offersSent} de ${req.search.maxOffers}` : "Buscando proveedores conectados"} ·{" "}
                <span className="tabular-nums">{elapsed}</span>
              </p>
            </div>
          </div>
          {req.search.currentOffer && <p className="mt-1 text-xs text-muted">Esperando respuesta de {req.search.currentOffer.providerName}…</p>}
          <div className="mt-3">
            <PlacesSummary req={req} />
          </div>
          <div className="mt-4 grid gap-2">
            <Button variant="secondary" fullWidth loading={busy === "help"} onClick={help}>
              Hablar con un operador
            </Button>
            <Button variant="ghost" fullWidth className="text-danger" onClick={() => setCancelOpen(true)}>
              Cancelar
            </Button>
          </div>
        </>
      );
      break;
    case "ESCALATED":
      panel = (
        <>
          <h2 className="text-lg font-bold">Un operador está coordinando tu {noun}</h2>
          <p className="text-sm text-muted">
            {req.escalation ? escalationReasonLabel(req.escalation.reason) : "Buscando la mejor opción"} · <span className="tabular-nums">{elapsed}</span>
          </p>
          <Notice tone="warning" className="mt-3">
            Tranquilo: el PBX ya tiene tu solicitud y te asignará una {noun} en breve. Mantén esta pantalla abierta.
          </Notice>
          <div className="mt-3">
            <PlacesSummary req={req} />
          </div>
          <div className="mt-4 grid gap-2">
            <Button variant="ghost" fullWidth className="text-danger" onClick={() => setCancelOpen(true)}>
              Cancelar
            </Button>
          </div>
        </>
      );
      break;
    case "EN_ROUTE":
    case "ARRIVED":
    case "IN_PROGRESS":
      panel = (
        <>
          <h2 className="text-xl font-bold">{statusLabelFor(req.status, req.kind)}</h2>
          <div className="mt-1">
            <EtaLine req={req} />
          </div>
          {req.provider && (
            <div className="mt-3">
              <ProviderRow provider={req.provider} />
            </div>
          )}
          {req.status !== "IN_PROGRESS" && req.pin && (
            <div className="mt-3">
              <PinBlock pin={req.pin} providerKind={req.provider?.kind ?? null} />
            </div>
          )}
          <div className="mt-4">
            <ProgressSteps status={req.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={share}>
              Compartir seguimiento
            </Button>
            <Button variant="secondary" loading={busy === "help"} onClick={help}>
              Hablar con un operador
            </Button>
          </div>
          {feeWarn && (
            <Button variant="ghost" fullWidth className="mt-2 text-danger" onClick={() => setCancelOpen(true)}>
              Cancelar
            </Button>
          )}
          <div className="mt-4">
            <Timeline events={req.events} />
          </div>
        </>
      );
      break;
    case "COMPLETED":
      panel = (
        <>
          <div className="text-center">
            <div className="text-5xl" aria-hidden>
              ✅
            </div>
            <h2 className="mt-1 text-xl font-bold">{statusLabelFor("COMPLETED", req.kind)}</h2>
            {req.timestamps.completedAt && <p className="text-sm text-muted">{formatDateTime(req.timestamps.completedAt)}</p>}
          </div>
          <div className="mt-3">
            <QuoteLines quote={req.quote} total={req.priceTotal} />
          </div>
          {req.provider && (
            <div className="mt-3">
              <ProviderRow provider={req.provider} />
            </div>
          )}
          <div className="mt-3">
            {req.ratings.client != null ? (
              <Notice tone="success">¡Gracias por calificar con {req.ratings.client} estrellas!</Notice>
            ) : (
              <RateForm noun={noun} busy={busy === "rate"} onSubmit={rate} />
            )}
          </div>
          <Button size="lg" fullWidth className="mt-4" onClick={onNewService}>
            Pedir otro servicio
          </Button>
          <div className="mt-4">
            <Timeline events={req.events} />
          </div>
        </>
      );
      break;
    case "CANCELLED": {
      const c = req.cancellation;
      const who = c?.by === "CLIENT" ? "Cancelaste el servicio" : c?.by === "PBX" ? "Un operador canceló el servicio" : "El servicio fue cancelado";
      panel = (
        <>
          <div className="text-center">
            <div className="text-5xl" aria-hidden>
              🚫
            </div>
            <h2 className="mt-1 text-xl font-bold">{statusLabelFor("CANCELLED", req.kind)}</h2>
            <p className="text-sm text-muted">
              {who}
              {c?.reason ? `: ${c.reason}` : ""}
            </p>
          </div>
          {c && c.feeQ > 0 ? (
            <Notice tone="warning" className="mt-3">
              Se aplicó un cargo por cancelación de <b>{formatQ(c.feeQ)}</b> porque la {noun} ya iba en camino.
            </Notice>
          ) : (
            <Notice tone="success" className="mt-3">
              Sin cargo por cancelación.
            </Notice>
          )}
          <Button size="lg" fullWidth className="mt-4" onClick={onNewService}>
            Volver al inicio
          </Button>
          <div className="mt-4">
            <Timeline events={req.events} />
          </div>
        </>
      );
      break;
    }
  }

  return (
    <MapScreen mapClassName="h-[44dvh]" map={<RequestMap req={req} className="h-full w-full" />}>
      <Toast message={toast} />
      {error && (
        <Notice tone="warning" className="mb-2 text-xs">
          Sin conexión con el servidor: {error.message}. Reintentando…
        </Notice>
      )}
      {actionError && !cancelOpen && (
        <Notice tone="danger" className="mb-2">
          {actionError}
        </Notice>
      )}
      {panel}

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={`¿Cancelar la ${noun}?`}>
        {feeWarn ? (
          <Notice tone="warning">
            La {noun} ya va en camino: puede aplicar un cargo de <b>{formatQ(CANCELLATION_FEE_Q)}</b>.
          </Notice>
        ) : (
          <p className="text-sm text-muted">Aún no hay {noun} asignada, así que no tiene costo.</p>
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
        <p className="text-sm text-muted">Quien lo abra verá tu servicio en vivo, sin tu PIN ni teléfonos.</p>
        <Input className="mt-3 font-mono text-sm" readOnly value={shareUrl ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de seguimiento" />
        <p className="mt-1 text-xs text-muted">Toca el enlace y mantén presionado para copiarlo.</p>
        <Button className="mt-3" fullWidth onClick={() => setShareUrl(null)}>
          Listo
        </Button>
      </Sheet>
    </MapScreen>
  );
}

function RateForm({ noun, busy, onSubmit }: { noun: string; busy: boolean; onSubmit: (stars: number, comment: string) => void }) {
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  return (
    <div className="rounded-2xl border border-border p-4 text-center">
      <p className="font-semibold">¿Cómo estuvo tu {noun}?</p>
      <div className="mt-2 flex justify-center">
        <Stars value={stars} onChange={setStars} size="lg" />
      </div>
      <Input className="mt-3" placeholder="Comentario (opcional)" aria-label="Comentario" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
      <Button className="mt-3" fullWidth disabled={!stars} loading={busy} onClick={() => stars && onSubmit(stars, comment)}>
        Enviar calificación
      </Button>
    </div>
  );
}
