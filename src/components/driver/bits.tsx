"use client";

/** Piezas pequeñas propias de la app del gruero (complementan src/components/ui). */
import type { ReactNode } from "react";
import { cn, Spinner } from "@/components/ui";

/** Enlace con aspecto de botón (para tel:, WhatsApp, Google Maps, Waze…). */
export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  external,
  className,
  disabled,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "success";
  size?: "md" | "sm";
  external?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const look =
    variant === "primary"
      ? "bg-primary text-primary-foreground border-transparent"
      : variant === "success"
        ? "bg-success text-black border-transparent"
        : "bg-surface text-foreground border-border hover:bg-surface-2";
  const sz = size === "sm" ? "h-10 px-3 text-sm" : "h-12 px-4 text-base";
  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border font-semibold select-none transition active:opacity-80",
        look,
        sz,
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {children}
    </a>
  );
}

/**
 * Tarjeta inferior en flujo (no absoluta): el mapa ocupa el resto de la
 * pantalla y el encuadre automático solo considera la parte visible.
 */
export function DriverPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative z-20 -mt-6 max-h-[70vh] shrink-0 overflow-y-auto rounded-t-3xl bg-background p-4 safe-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.15)]", className)}>
      {children}
    </div>
  );
}

export function FullScreen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 p-6 text-center safe-top safe-bottom", className)}>{children}</main>;
}

export function FullScreenSpinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <FullScreen>
      <Spinner size="lg" />
      <p className="text-sm text-muted">{label}</p>
    </FullScreen>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex-1 rounded-2xl bg-surface px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

/** Aviso fijo arriba cuando el sondeo falla (sin red, servidor caído…). */
export function ConnectionBanner({ message }: { message: string }) {
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] safe-top">
      <div className="mx-auto mt-2 w-fit max-w-[92vw] rounded-full bg-danger px-4 py-1.5 text-xs font-semibold text-white shadow-lg">{message}</div>
    </div>
  );
}

export function Avatar({ initial, className }: { initial: string; className?: string }) {
  return (
    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground", className)} aria-hidden>
      {initial}
    </div>
  );
}
