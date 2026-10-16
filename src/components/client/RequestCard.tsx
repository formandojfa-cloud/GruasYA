"use client";

/**
 * Piezas de la hoja de un servicio (activo, terminado o compartido) con el
 * aspecto GrúaYa final: título grande con etiqueta de ETA, tarjeta del piloto
 * (avatar · ★ · placa en ficha), PIN sobre amarillo suave, bloque de detalle
 * (● recogida / ■ destino / 💵 efectivo) y línea de tiempo plegable.
 */
import type { ReactNode } from "react";
import { Row, cn } from "@/components/ui";
import { useNow } from "@/lib/hooks";
import { EVENT_LABELS, formatKm, formatMinutes, formatQ, formatTime, KIND_LABELS, PROVIDER_KIND_LABELS, VEHICLE_LABELS } from "@/lib/format";
import type { ProviderCard, Quote, RequestEventView, RequestStatus, RequestView } from "@/lib/types";
import { initials, placeLabel, providerNoun, serviceNoun, shortAddress, telHref } from "./constants";

/** "Q476 en efectivo · 6.6 km" (grúa) o "Q150 en efectivo · Cambio de llanta" / "Incluido en tu membresía · …". */
export function priceHeader(req: RequestView): string {
  const tail = req.kind === "TOW" ? formatKm(req.distanceKm) : KIND_LABELS[req.kind];
  return `${req.priceTotal > 0 ? `${formatQ(req.priceTotal)} en efectivo` : "Incluido en tu membresía"} · ${tail}`;
}

/** Cabecera de la hoja: título grande, subtítulo gris y, si hay, etiqueta negra con los minutos. */
export function ServiceHeader({ title, subtitle, eta, children }: { title: ReactNode; subtitle?: ReactNode; eta?: number | null; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="titulo-hoja">{title}</h2>
        {subtitle && <p className="tenue">{subtitle}</p>}
        {children}
      </div>
      {eta != null && (
        <div className="etiqueta-eta">
          {Math.max(1, Math.round(eta))}
          <small>min</small>
        </div>
      )}
    </div>
  );
}

/** Tarjeta del piloto: avatar con iniciales, "★ 4.9 · Grúa plataforma", placa en ficha gris. */
export function ProviderPerson({ provider }: { provider: ProviderCard }) {
  const rating = provider.rating != null ? `★ ${provider.rating.toFixed(1)}` : "Sin calificaciones aún";
  const vehicle = provider.vehicleLabel ?? PROVIDER_KIND_LABELS[provider.kind];
  return (
    <div className="persona">
      <div className="avatar" aria-hidden>
        {provider.photoUrl ? <span className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${provider.photoUrl})` }} /> : initials(provider.name) || "🚛"}
      </div>
      <div className="persona-texto">
        <strong className="truncate text-[17px]">{provider.name}</strong>
        <span className="tenue truncate">
          {rating} · {vehicle}
        </span>
      </div>
      {provider.plate && (
        <div className="ficha">
          {provider.plate}
          <small>Placa</small>
        </div>
      )}
    </div>
  );
}

const ICON_BTN = "inline-flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-[12px] bg-surface-2 px-2 text-[13px] font-medium text-foreground disabled:opacity-40";

/** Botón de acción de la fila (ícono arriba, texto abajo), como `.acciones` del prototipo. */
export function ActionButton({
  icon,
  label,
  onClick,
  href,
  danger,
  disabled,
  ariaLabel,
  iconOnly,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /** Solo el ícono (cuadrado de 56 px); el texto queda como etiqueta accesible. */
  iconOnly?: boolean;
}) {
  const cls = cn(ICON_BTN, danger && "text-rojo", iconOnly && "w-14 flex-none");
  const body = (
    <>
      <span className={cn("leading-none", iconOnly ? "text-2xl" : "text-xl")} aria-hidden>
        {icon}
      </span>
      {!iconOnly && label}
    </>
  );
  if (href) {
    const external = href.startsWith("http");
    return (
      <a href={href} className={cls} aria-label={ariaLabel ?? (iconOnly ? label : undefined)} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={ariaLabel ?? (iconOnly ? label : undefined)}>
      {body}
    </button>
  );
}

/** Llamar / WhatsApp al piloto (solo cuando la API expone el teléfono). */
export function ContactActions({ provider }: { provider: ProviderCard }) {
  if (!provider.phone) return null;
  return (
    <>
      <ActionButton iconOnly icon="📞" label="Llamar" href={telHref(provider.phone)} ariaLabel={`Llamar a ${provider.name}`} />
      {provider.whatsapp && <ActionButton iconOnly icon="💬" label="WhatsApp" href={provider.whatsapp} ariaLabel={`WhatsApp a ${provider.name}`} />}
    </>
  );
}

/** "Remolque: 6.6 km · 25 min" (" aprox." si no hubo motor de rutas); null si no es grúa o no hay minutos. */
export function towSummary(req: RequestView): string | null {
  if (req.kind !== "TOW" || req.estimatedMinutes == null) return null;
  return `Remolque: ${formatKm(req.distanceKm)} · ${formatMinutes(req.estimatedMinutes)}${req.routeSource === "estimada" ? " aprox." : ""}`;
}

/** "Llega en 8 min · a las 14:32" según el objetivo actual del proveedor; " aprox." si la ruta se estimó en línea recta. */
export function EtaLine({ req }: { req: RequestView }) {
  const now = useNow(15000);
  const live = req.providerLive;
  const noun = serviceNoun(req.kind);
  if (req.status === "ARRIVED") return <p className="text-sm font-semibold text-verde">Tu {noun} ya está junto a tu vehículo</p>;
  if (!live) return <p className="tenue">Esperando la ubicación de tu {noun}…</p>;
  const approx = live.routeSource === "estimada" ? " aprox." : "";
  if (req.status === "IN_PROGRESS") {
    if (live.target !== "DROPOFF") return <p className="tenue">Servicio en curso</p>;
    return (
      <p className="tenue">
        Llegas a tu destino en <b className="text-foreground">{formatMinutes(live.etaMinutes)}</b> · {formatKm(live.distanceKm)}
        {approx}
      </p>
    );
  }
  const arrival = formatTime(new Date(now + live.etaMinutes * 60_000));
  return (
    <p className="tenue">
      Llega en <b className="text-foreground">{formatMinutes(live.etaMinutes)}</b> · a las {arrival}
      {approx}
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
            {i > 0 && <span className={cn("absolute left-0 right-1/2 top-2.5 h-0.5 -translate-y-1/2", i <= idx ? "bg-tinta" : "bg-border")} />}
            {i < STEPS.length - 1 && <span className={cn("absolute left-1/2 right-0 top-2.5 h-0.5 -translate-y-1/2", i < idx ? "bg-tinta" : "bg-border")} />}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                done ? "border-tinta bg-tinta text-sobre-tinta" : current ? "border-tinta bg-background" : "border-border bg-background",
              )}
            >
              {done ? "✓" : current ? <span className="h-2 w-2 rounded-full bg-tinta" /> : null}
            </span>
            <span className={cn("mt-1 text-[11px] leading-tight", current ? "font-bold" : "text-muted")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** PIN en tinta sobre amarillo suave. */
export function PinBlock({ pin, providerKind }: { pin: string; providerKind: ProviderCard["kind"] | null }) {
  const who = providerKind ? providerNoun(providerKind) : "piloto";
  return (
    <div className="aviso flex items-center justify-between gap-3 !py-3">
      <div className="min-w-0">
        <p className="font-semibold">Dale este PIN al {who} cuando llegue</p>
        <p className="chico text-muted">Solo cuando confirmes que es tu servicio.</p>
      </div>
      <p className="font-mono text-[32px] font-bold tracking-[0.3em] tabular-nums" aria-label={`PIN ${pin.split("").join(" ")}`}>
        {pin}
      </p>
    </div>
  );
}

/** Bloque de detalle: ● Recogida · qué pasó / ■ Destino / 💵 Efectivo  Q377 / "Carro · 6.6 km · precio fijo". */
export function ServiceDetail({ req }: { req: RequestView }) {
  const tail = [
    VEHICLE_LABELS[req.vehicleKind],
    req.kind === "TOW" ? formatKm(req.distanceKm) : KIND_LABELS[req.kind],
    req.kind === "TOW" && req.estimatedMinutes != null ? `${formatMinutes(req.estimatedMinutes)}${req.routeSource === "estimada" ? " aprox." : ""}` : null,
    "precio fijo",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <span className="marca-origen mt-1.5" aria-hidden />
        <span className="min-w-0 flex-1 text-[17px] leading-snug">
          {req.pickup.address ? shortAddress(req.pickup.address) : "Recogida"}
          {req.notes && <span className="text-muted"> · {req.notes}</span>}
        </span>
      </div>
      {req.dropoff && (
        <div className="flex items-start gap-3">
          <span className="marca-destino mt-1.5" aria-hidden />
          <span className="min-w-0 flex-1 text-[17px] leading-snug">{req.dropoff.address ? shortAddress(req.dropoff.address) : placeLabel(req.dropoff)}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[17px] font-semibold">{req.priceTotal > 0 ? "💵 Efectivo" : "✅ Membresía"}</span>
        <strong className="text-[17px] tabular-nums">{req.priceTotal > 0 ? formatQ(req.priceTotal) : "Incluido"}</strong>
      </div>
      <span className="tenue chico">{tail}</span>
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
        <span className="grande">{formatQ(total)}</span>
      </div>
    </div>
  );
}

export function Timeline({ events }: { events: RequestEventView[] }) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <details className="chico text-muted">
      <summary className="cursor-pointer select-none font-semibold">Línea de tiempo ({sorted.length})</summary>
      <ol className="mt-1">
        {sorted.map((e, i) => (
          <li key={`${e.type}-${e.at}-${i}`} className="flex items-baseline justify-between gap-3 py-1 text-foreground">
            <span>{EVENT_LABELS[e.type] ?? e.type}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted">{formatTime(e.at)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
