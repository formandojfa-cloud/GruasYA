"use client";

/** Piezas de la tarjeta de una solicitud (activa, terminada o compartida), con el aspecto GruaYa. */
import type { ReactNode } from "react";
import { Row, cn, statusClass } from "@/components/ui";
import { EVENT_LABELS, formatKm, formatMinutes, formatQ, formatTime, KIND_LABELS } from "@/lib/format";
import type { ProviderCard, Quote, RequestEventView, RequestStatus, RequestView } from "@/lib/types";
import { placeLabel, providerGlyph, providerNoun, serviceNoun, telHref } from "./constants";

/** "Q476 en efectivo · 6.6 km" (grúa) o "Q150 en efectivo · Cambio de llanta" / "Incluido en tu membresía · …". */
export function priceHeader(req: RequestView): string {
  const tail = req.kind === "TOW" ? formatKm(req.distanceKm) : KIND_LABELS[req.kind];
  return `${req.priceTotal > 0 ? `${formatQ(req.priceTotal)} en efectivo` : "Incluido en tu membresía"} · ${tail}`;
}

/** Tarjeta de estado del prototipo: precio arriba en gris, título grande y borde izquierdo de color. */
export function StateCard({ req, title, subtitle, children, className }: { req: RequestView; title: ReactNode; subtitle?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("tarjeta", statusClass(req.status), className)}>
      <p className="tenue">{priceHeader(req)}</p>
      <h2 className="text-[22px] leading-tight">{title}</h2>
      {subtitle && <p className="tenue">{subtitle}</p>}
      {children}
    </section>
  );
}

/** "{nombre} · Placa {placa} · ★ {calif}" con llamar / WhatsApp mientras el servicio está activo. */
export function ProviderRow({ provider }: { provider: ProviderCard }) {
  const rating = provider.rating != null ? `★ ${provider.rating.toFixed(1)}` : "Sin calificaciones aún";
  const line = [provider.plate && `Placa ${provider.plate}`, rating, provider.vehicleLabel].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-surface p-2.5">
      <span className="text-2xl leading-none" aria-hidden>
        {providerGlyph(provider.kind)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold">{provider.name}</p>
        <p className="text-sm text-muted">{line}</p>
      </div>
      {provider.phone && (
        <div className="flex gap-2">
          <a
            href={telHref(provider.phone)}
            aria-label={`Llamar a ${provider.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-xl hover:bg-surface"
          >
            📞
          </a>
          {provider.whatsapp && (
            <a
              href={provider.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp a ${provider.name}`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-xl hover:bg-surface"
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
  if (req.status === "ARRIVED") return <p className="text-sm font-semibold text-verde">Tu {noun} ya está junto a tu vehículo</p>;
  if (!live) return <p className="tenue">Esperando la ubicación de tu {noun}…</p>;
  if (req.status === "IN_PROGRESS") {
    if (live.target !== "DROPOFF") return <p className="tenue">Servicio en curso</p>;
    return (
      <p className="tenue">
        Llegan al destino en <b className="text-foreground">{formatMinutes(live.etaMinutes)}</b> · {formatKm(live.distanceKm)}
      </p>
    );
  }
  return (
    <p>
      <span className="font-bold">Llega en {formatMinutes(live.etaMinutes)}</span> <span className="text-muted">· {formatKm(live.distanceKm)}</span>
    </p>
  );
}

const STEPS = ["En camino", "Llegó", "En ruta", "Completado"] as const;
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
            {i > 0 && <span className={cn("absolute left-0 right-1/2 top-2.5 h-0.5 -translate-y-1/2", i <= idx ? "bg-azul" : "bg-border")} />}
            {i < STEPS.length - 1 && <span className={cn("absolute left-1/2 right-0 top-2.5 h-0.5 -translate-y-1/2", i < idx ? "bg-azul" : "bg-border")} />}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                done ? "border-azul bg-azul text-white" : current ? "border-azul bg-background" : "border-border bg-background",
              )}
            >
              {done ? "✓" : current ? <span className="h-2 w-2 rounded-full bg-azul" /> : null}
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
    <div className="rounded-[10px] bg-amarillo px-4 py-3 text-center text-primary-foreground">
      <p className="text-sm font-semibold">Dale este PIN al {who} cuando llegue</p>
      <p className="mt-1 font-mono text-4xl font-bold tracking-[0.4em]" aria-label={`PIN ${pin.split("").join(" ")}`}>
        {pin}
      </p>
      <p className="mt-1 text-xs opacity-80">Solo cuando confirmes que es tu servicio.</p>
    </div>
  );
}

export function PlacesSummary({ req }: { req: RequestView }) {
  return (
    <div className="grid gap-1.5 text-[15px]">
      <p className="flex gap-2">
        <span aria-hidden>🚗</span>
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

/** Desglose en una línea, como el prototipo: "Banderazo Q300 + 2 km × Q15 · cargo no socio Q50". */
export function quoteOneLine(quote: Quote): string {
  if (quote.kind !== "TOW") return quote.lines.map((l) => l.label).join(" · ");
  const parts = [`Banderazo ${formatQ(quote.baseQ)}${quote.includedKm > 0 ? ` (incluye ${quote.includedKm} km)` : ""}`];
  if (quote.billableKm > 0) parts.push(`${quote.billableKm} km × ${formatQ(quote.perKmQ)}`);
  if (quote.nightSurchargeQ > 0) parts.push(`nocturno ${formatQ(quote.nightSurchargeQ)}`);
  const extra = quote.nonMemberFeeQ > 0 ? ` · cargo no socio ${formatQ(quote.nonMemberFeeQ)}` : "";
  return parts.join(" + ") + extra;
}

export function QuoteLines({ quote, total }: { quote: Quote; total: number }) {
  return (
    <div>
      {quote.lines.map((l) => (
        <Row key={l.label} label={l.label} value={formatQ(l.amountQ)} />
      ))}
      <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
        <span className="font-semibold">Total</span>
        <span className="grande">{formatQ(total)}</span>
      </div>
    </div>
  );
}

export function Timeline({ events }: { events: RequestEventView[] }) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <details className="tarjeta gap-0 p-0">
      <summary className="cursor-pointer select-none px-3.5 py-3 text-sm font-semibold">Línea de tiempo ({sorted.length})</summary>
      <ol className="border-t border-border px-3.5 py-2">
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
