"use client";

/**
 * Primitivas de interfaz compartidas con el aspecto GruaYa (docs/GRUAYA.md §1):
 * tarjetas blancas con borde fino, botón principal amarillo con texto tinta,
 * segmentos negros, tarjetas de estado con borde izquierdo de color, avisos
 * amarillo suave. Pensadas para pantalla de teléfono con una mano (44 px).
 */
import Link from "next/link";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect } from "react";
import { useNow } from "@/lib/hooks";
import { secondsUntil, STATUS_LABELS, STATUS_SHORT, STATUS_TONE, type Tone } from "@/lib/format";
import type { RequestStatus } from "@/lib/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------- Botón ----------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "md" | "lg" | "sm";
  loading?: boolean;
  fullWidth?: boolean;
};

/** principal = amarillo con texto tinta; secundario = tarjeta con borde; peligro = texto rojo. */
const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-amarillo text-primary-foreground border-amarillo hover:brightness-95 active:brightness-90",
  secondary: "bg-background text-foreground border-border hover:bg-surface active:bg-surface-2",
  ghost: "bg-transparent text-foreground border-transparent hover:bg-surface",
  danger: "bg-background text-rojo border-border hover:bg-danger-soft",
  success: "bg-verde text-white border-verde hover:brightness-95",
};

const SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-[52px] px-5 text-[17px]",
};

export function Button({ variant = "primary", size = "md", loading, fullWidth, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border font-bold transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ---------- Tarjeta ----------

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("rounded-card border border-border bg-background p-3.5", onClick && "cursor-pointer hover:bg-surface", className)}>
      {children}
    </div>
  );
}

// ---------- Chip de estado ----------

const TONE: Record<Tone, string> = {
  neutral: "bg-surface text-foreground",
  success: "bg-success-soft text-verde",
  warning: "bg-amarillo-suave text-foreground",
  danger: "bg-danger-soft text-rojo",
  info: "bg-info-soft text-azul",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone], className)}>{children}</span>
  );
}

export function StatusPill({ status }: { status: RequestStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_SHORT[status]}</Pill>;
}

// ---------- Spinner ----------

export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const px = size === "sm" ? "h-4 w-4 border-2" : size === "lg" ? "h-10 w-10 border-4" : "h-6 w-6 border-2";
  return <span aria-label="Cargando" className={cn("inline-block rounded-full border-current border-r-transparent animate-spin", px, className)} />;
}

// ---------- Cuenta regresiva (oferta) ----------

export function Countdown({ until, totalSeconds, onExpire, className }: { until: string; totalSeconds: number; onExpire?: () => void; className?: string }) {
  const now = useNow(250);
  const left = secondsUntil(until, now);
  const fraction = Math.max(0, Math.min(1, left / totalSeconds));
  useEffect(() => {
    if (left === 0) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative h-16 w-16", className)} role="timer" aria-live="polite" aria-label={`${left} segundos`}>
      <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={left <= 10 ? "var(--rojo)" : "var(--amarillo)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="contador absolute inset-0 flex items-center justify-center">{left}</span>
    </div>
  );
}

// ---------- Hoja inferior ----------

export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose?: () => void; title?: string; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 mx-auto w-full max-w-[560px] rounded-t-2xl border-t border-border bg-background p-4 safe-bottom shadow-[0_-4px_24px_rgba(0,0,0,0.12)] max-h-[88vh] overflow-y-auto",
          className,
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        {title && <h2 className="mb-3 text-xl font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** Panel fijo abajo sobre el mapa (sin fondo oscuro). */
export function BottomPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 mx-auto max-w-[560px] rounded-t-2xl border-t border-border bg-background p-4 safe-bottom shadow-[0_-4px_24px_rgba(0,0,0,0.12)] max-h-[70vh] overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------- Campos ----------

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rojo">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  "h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(CONTROL, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(CONTROL, className)}>
      {children}
    </select>
  );
}

// ---------- Estrellas ----------

export function Stars({ value, onChange, size = "md" }: { value: number | null; onChange?: (v: number) => void; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-4xl" : size === "sm" ? "text-base" : "text-2xl";
  return (
    <div className={cn("inline-flex gap-1", cls)} role={onChange ? "radiogroup" : undefined} aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} estrellas`}
          className={cn("leading-none transition", (value ?? 0) >= n ? "text-amarillo" : "text-border", onChange && "hover:scale-110")}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ---------- Marca y segmentos ----------

/** "Grua" en tinta + "Ya" en amarillo, con sufijo pequeño en gris opcional (p. ej. "piloto"). */
export function Wordmark({ suffix, className }: { suffix?: ReactNode; className?: string }) {
  return (
    <span className={cn("marca", className)}>
      Grua<span className="ya">Ya</span>
      {suffix && <small>{suffix}</small>}
    </span>
  );
}

/** Botones en fila; el activo es tinta con texto claro. */
export function Segments<K extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: Array<{ key: K; label: ReactNode; disabled?: boolean }>;
  value: K;
  onChange: (key: K) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("segmentos", className)} role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          disabled={it.disabled}
          aria-pressed={it.key === value}
          className={it.key === value ? "activo" : undefined}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Tarjeta de estado ----------

/** Estado de la solicitud → clase del prototipo (color del borde izquierdo). */
export const STATUS_CLASS: Record<RequestStatus, string> = {
  SEARCHING: "estado-buscando",
  ESCALATED: "estado-sin_grua",
  EN_ROUTE: "estado-asignado",
  ARRIVED: "estado-en_sitio",
  IN_PROGRESS: "estado-en_ruta",
  COMPLETED: "estado-pagado",
  CANCELLED: "estado-cancelado",
};

export function statusClass(status: RequestStatus): string {
  return `estado ${STATUS_CLASS[status]}`;
}

/** Tarjeta con borde izquierdo de 5 px según el estado; sin `title` usa el texto largo del estado. */
export function StatusCard({ status, title, children, className }: { status: RequestStatus; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("tarjeta", statusClass(status), className)}>
      <h2 className="text-[22px] font-bold leading-tight">{title ?? STATUS_LABELS[status]}</h2>
      {children}
    </section>
  );
}

/** Aviso en amarillo suave. */
export function Aviso({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("aviso", className)}>{children}</div>;
}

// ---------- Barra superior ----------

export function TopBar({ title, back, right, subtitle }: { title: string; back?: string; right?: ReactNode; subtitle?: string }) {
  return (
    <header className="safe-top sticky top-0 z-30 bg-surface">
      <div className="mx-auto flex max-w-[560px] items-center gap-2 px-3 py-3">
        {back && (
          <Link
            href={back}
            aria-label="Volver"
            className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-xl hover:bg-surface"
          >
            ‹
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate">
            <Wordmark suffix={title} />
          </h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

// ---------- Estado vacío / mensajes ----------

export function EmptyState({ icon, title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="text-4xl">{icon}</div>}
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {body && <p className="max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const NOTICE_TONE: Record<Tone, string> = {
  neutral: "bg-surface text-foreground",
  info: "bg-amarillo-suave text-foreground",
  warning: "bg-amarillo-suave text-foreground",
  success: "bg-success-soft text-verde",
  danger: "bg-danger-soft text-rojo",
};

export function Notice({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[10px] px-2.5 py-2 text-sm", NOTICE_TONE[tone], className)}>{children}</div>;
}

export function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[15px]">{label}</span>
      <span className={cn("text-right font-semibold tabular-nums", strong && "text-lg font-bold")}>{value}</span>
    </div>
  );
}
