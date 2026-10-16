"use client";

/** Piezas de la tarjeta de una solicitud (activa, terminada o compartida). */
import { Row, Stars, cn } from "@/components/ui";
import { EVENT_LABELS, formatKm, formatMinutes, formatQ, formatTime } from "@/lib/format";
import type { ProviderCard, Quote, RequestEventView, RequestStatus, RequestView } from "@/lib/types";
import { placeLabel, providerGlyph, providerNoun, serviceNoun, telHref } from "./constants";

export function ProviderRow({ provider }: { provider: ProviderCard }) {
  const details = [provider.vehicleLabel, provider.plate && `Placa ${provider.plate}`].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xl" aria-hidden>
        {providerGlyph(provider.kind)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{provider.name}</p>
        <div className="flex items-center gap-1 text-xs text-muted">
          {provider.rating != null ? (
            <>
              <Stars value={Math.round(provider.rating)} size="sm" /> {provider.rating.toFixed(1)} ({provider.ratingCount})
            </>
          ) : (
            "Sin calificaciones aún"
          )}
        </div>
        {details && <p className="truncate text-xs text-muted">{details}</p>}
      </div>
      {provider.phone && (
        <div className="flex gap-2">
          <a
            href={telHref(provider.phone)}
            aria-label={`Llamar a ${provider.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-xl hover:bg-surface-2"
          >
            📞
          </a>
          {provider.whatsapp && (
            <a
              href={provider.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp a ${provider.name}`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-xl hover:opacity-90"
            >
              💬
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** "Llega en 8 min · 2.3 km" según el objetivo actual del proveedor. */
export function EtaLine({ req }: { req: RequestView }) {
  const live = req.providerLive;
  const noun = serviceNoun(req.kind);
  if (req.status === "ARRIVED") return <p className="text-sm font-semibold text-success">Tu {noun} ya está en el punto de recogida</p>;
  if (!live) return <p className="text-sm text-muted">Esperando la ubicación de tu {noun}…</p>;
  if (req.status === "IN_PROGRESS") {
    if (live.target !== "DROPOFF") return <p className="text-sm text-muted">Servicio en curso</p>;
    return (
      <p className="text-sm text-muted">
        Llegan al destino en <b className="text-foreground">{formatMinutes(live.etaMinutes)}</b> · {formatKm(live.distanceKm)}
      </p>
    );
  }
  return (
    <p className="text-base">
      <span className="font-bold">Llega en {formatMinutes(live.etaMinutes)}</span> <span className="text-muted">· {formatKm(live.distanceKm)}</span>
    </p>
  );
}

const STEPS = ["En camino", "Llegó", "En curso", "Completado"] as const;
const STEP_INDEX: Partial<Record<RequestStatus, number>> = { EN_ROUTE: 0, ARRIVED: 1, IN_PROGRESS: 2, COMPLETED: 3 };

export function ProgressSteps({ status }: { status: RequestStatus }) {
  const idx = STEP_INDEX[status];
  if (idx === undefined) return null;
  return (
    <ol className="flex items-start" aria-label="Progreso del servicio">
      {STEPS.map((label, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cn("absolute left-0 right-1/2 top-2.5 h-0.5 -translate-y-1/2", i <= idx ? "bg-foreground" : "bg-surface-2")} />}
            {i < STEPS.length - 1 && <span className={cn("absolute left-1/2 right-0 top-2.5 h-0.5 -translate-y-1/2", i < idx ? "bg-foreground" : "bg-surface-2")} />}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                done ? "border-foreground bg-foreground text-background" : current ? "border-foreground bg-background" : "border-surface-2 bg-background",
              )}
            >
              {done ? "✓" : current ? <span className="h-2 w-2 rounded-full bg-foreground" /> : null}
            </span>
            <span className={cn("mt-1 text-[11px] leading-tight", current ? "font-bold" : "text-muted")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PinBlock({ pin, providerKind }: { pin: string; providerKind: ProviderCard["kind"] | null }) {
  const who = providerKind ? providerNoun(providerKind) : "gruero";
  return (
    <div className="rounded-2xl bg-primary px-4 py-4 text-center text-primary-foreground">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Dale este PIN al {who}</p>
      <p className="mt-1 font-mono text-4xl font-bold tracking-[0.4em]" aria-label={`PIN ${pin.split("").join(" ")}`}>
        {pin}
      </p>
      <p className="mt-1 text-xs opacity-80">Solo cuando llegue y confirmes que es tu servicio.</p>
    </div>
  );
}

export function PlacesSummary({ req }: { req: RequestView }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <p className="flex gap-2">
        <span aria-hidden>📍</span>
        <span className="min-w-0 flex-1 truncate">{placeLabel(req.pickup)}</span>
      </p>
      {req.dropoff && (
        <p className="flex gap-2">
          <span aria-hidden>🏁</span>
          <span className="min-w-0 flex-1 truncate">{placeLabel(req.dropoff)}</span>
        </p>
      )}
    </div>
  );
}

export function QuoteLines({ quote, total }: { quote: Quote; total: number }) {
  return (
    <div>
      {quote.lines.map((l) => (
        <Row key={l.label} label={l.label} value={formatQ(l.amountQ)} />
      ))}
      <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
        <span className="font-semibold">Total</span>
        <span className="text-3xl font-bold">{formatQ(total)}</span>
      </div>
    </div>
  );
}

export function Timeline({ events }: { events: RequestEventView[] }) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <details className="rounded-2xl border border-border">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">Línea de tiempo ({sorted.length})</summary>
      <ol className="border-t border-border px-4 py-2">
        {sorted.map((e, i) => (
          <li key={`${e.type}-${e.at}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <span>{EVENT_LABELS[e.type] ?? e.type}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted">{formatTime(e.at)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
