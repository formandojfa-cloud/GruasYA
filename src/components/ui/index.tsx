"use client";

/**
 * Primitivas de interfaz compartidas (botones, tarjetas, hoja inferior, chips,
 * cuenta regresiva…). Pensadas para pantalla de teléfono con una mano.
 */
import Link from "next/link";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect } from "react";
import { useNow } from "@/lib/hooks";
import { secondsUntil, STATUS_SHORT, STATUS_TONE, type Tone } from "@/lib/format";
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

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
  secondary: "bg-surface text-foreground hover:bg-surface-2 border border-border",
  ghost: "bg-transparent text-foreground hover:bg-surface",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-black hover:opacity-90",
};

const SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-12 px-4 text-base",
  lg: "h-14 px-5 text-lg",
};

export function Button({ variant = "primary", size = "md", loading, fullWidth, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none",
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
    <div
      onClick={onClick}
      className={cn("rounded-2xl bg-background border border-border shadow-sm p-4", onClick && "cursor-pointer hover:bg-surface", className)}
    >
      {children}
    </div>
  );
}

// ---------- Chip de estado ----------

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone], className)}>{children}</span>
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

// ---------- Cuenta regresiva (oferta de 40 s) ----------

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
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={left <= 10 ? "var(--danger)" : "var(--foreground)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums">{left}</span>
    </div>
  );
}

// ---------- Hoja inferior ----------

export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose?: () => void; title?: string; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn("relative z-10 rounded-t-3xl bg-background p-5 safe-bottom shadow-2xl max-h-[88vh] overflow-y-auto", className)}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-surface-2" />
        {title && <h2 className="text-lg font-bold mb-3">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** Panel fijo abajo sobre el mapa (sin fondo oscuro), como la tarjeta de Uber. */
export function BottomPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("absolute inset-x-0 bottom-0 z-20 rounded-t-3xl bg-background p-4 safe-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.15)] max-h-[70vh] overflow-y-auto", className)}>
      {children}
    </div>
  );
}

// ---------- Campos ----------

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger mt-1">{error}</span> : hint ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        "h-12 w-full rounded-xl border border-border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn("h-12 w-full rounded-xl border border-border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring", className)}
    >
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
          className={cn("leading-none transition", (value ?? 0) >= n ? "text-warning" : "text-surface-2", onChange && "hover:scale-110")}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ---------- Barra superior ----------

export function TopBar({ title, back, right, subtitle }: { title: string; back?: string; right?: ReactNode; subtitle?: string }) {
  return (
    <header className="safe-top sticky top-0 z-30 flex items-center gap-3 bg-background/90 backdrop-blur px-4 py-3 border-b border-border">
      {back && (
        <Link href={back} aria-label="Volver" className="h-10 w-10 -ml-2 inline-flex items-center justify-center rounded-full hover:bg-surface text-xl">
          ‹
        </Link>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold truncate">{title}</h1>
        {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

// ---------- Estado vacío / mensajes ----------

export function EmptyState({ icon, title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-6">
      {icon && <div className="text-5xl">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="text-muted text-sm max-w-xs">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl px-4 py-3 text-sm", TONE[tone], className)}>{children}</div>;
}

export function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={cn("text-sm text-right", strong && "font-bold text-base")}>{value}</span>
    </div>
  );
}
