"use client";

/** Piezas pequeñas propias del panel del PBX (complementan src/components/ui). */
import { type ReactNode, useEffect, useState } from "react";
import { cn, Pill, Spinner } from "@/components/ui";
import { formatPhone, PROVIDER_STATUS_LABELS, type Tone } from "@/lib/format";
import type { ProviderStatus } from "@/lib/types";
import { copyText } from "./util";

export function Stat({ label, value, tone = "neutral", hint }: { label: ReactNode; value: ReactNode; tone?: Tone; hint?: string }) {
  const color =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : tone === "info" ? "text-info" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted truncate">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums leading-tight", color)}>{value}</div>
      {hint && <div className="text-[11px] text-muted truncate">{hint}</div>}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 mb-2", className)}>
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  );
}

/** Fila clave/valor densa. */
export function KV({ k, v, mono, className }: { k: string; v: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 border-b border-border/60 last:border-0", className)}>
      <span className="text-xs text-muted shrink-0">{k}</span>
      <span className={cn("text-sm text-right min-w-0 break-words", mono && "font-mono")}>{v}</span>
    </div>
  );
}

export function Box({ children, className, tone }: { children: ReactNode; className?: string; tone?: "danger" | "warning" | "success" | "info" }) {
  const accent =
    tone === "danger" ? "border-danger/60" : tone === "warning" ? "border-warning/70" : tone === "success" ? "border-success/60" : tone === "info" ? "border-info/60" : "border-border";
  return <div className={cn("rounded-xl border bg-background p-3", accent, className)}>{children}</div>;
}

export function CopyButton({ text, label = "Copiar", size = "sm", className }: { text: string; label?: string; size?: "sm" | "md"; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(id);
  }, [state]);
  return (
    <button
      type="button"
      onClick={async () => setState((await copyText(text)) ? "ok" : "fail")}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-surface font-semibold hover:bg-surface-2 select-none",
        size === "sm" ? "h-9 px-3 text-xs" : "h-12 px-4 text-sm",
        className,
      )}
    >
      {state === "ok" ? "✓ Copiado" : state === "fail" ? "No se pudo copiar" : label}
    </button>
  );
}

/** Enlace con aspecto de botón (tel:, WhatsApp, mapas). */
export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "sm",
  className,
  external = true,
  title,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "success" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  external?: boolean;
  title?: string;
}) {
  const look =
    variant === "primary"
      ? "bg-primary text-primary-foreground border-transparent hover:opacity-90"
      : variant === "success"
        ? "bg-success text-black border-transparent hover:opacity-90"
        : variant === "ghost"
          ? "bg-transparent border-transparent hover:bg-surface"
          : "bg-surface text-foreground border-border hover:bg-surface-2";
  const sz = size === "sm" ? "h-9 px-3 text-xs" : size === "lg" ? "h-14 px-5 text-lg" : "h-12 px-4 text-sm";
  return (
    <a
      href={href}
      title={title}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold select-none transition active:opacity-80", look, sz, className)}
    >
      {children}
    </a>
  );
}

/** Llamar + WhatsApp para un teléfono. */
export function ContactLinks({ phone, whatsapp, size = "sm" }: { phone: string; whatsapp?: string | null; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <LinkButton href={`tel:+502${phone.replace(/\D/g, "").replace(/^502/, "")}`} external={false} size={size} title="Llamar">
        📞 {formatPhone(phone)}
      </LinkButton>
      {whatsapp && (
        <LinkButton href={whatsapp} variant="success" size={size} title="Abrir WhatsApp">
          WhatsApp
        </LinkButton>
      )}
    </div>
  );
}

const PROVIDER_STATUS_TONE: Record<ProviderStatus, Tone> = { ONLINE: "success", BUSY: "info", OFFLINE: "neutral" };

export function ProviderStatusPill({ status, stale }: { status: ProviderStatus; stale?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Pill tone={PROVIDER_STATUS_TONE[status]}>{PROVIDER_STATUS_LABELS[status]}</Pill>
      {stale && status !== "OFFLINE" && <Pill tone="warning">sin señal</Pill>}
    </span>
  );
}

export function ErrorText({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("rounded-lg bg-danger-soft text-danger text-sm px-3 py-2", className)}>
      {children}
    </p>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center text-muted">{children}</div>;
}

export function BootSpinner({ label = "Cargando panel…" }: { label?: string }) {
  return (
    <Centered>
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </Centered>
  );
}

/** Botón de dos pasos: el primer toque pide confirmación, el segundo ejecuta. Se desarma solo. */
export function ConfirmButton({
  children,
  confirmLabel = "¿Confirmar?",
  onConfirm,
  className,
  loading,
  disabled,
  variant = "secondary",
}: {
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: "secondary" | "danger" | "primary";
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  const look =
    armed || variant === "danger"
      ? "bg-danger text-white border-transparent"
      : variant === "primary"
        ? "bg-primary text-primary-foreground border-transparent"
        : "bg-surface text-foreground border-border hover:bg-surface-2";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-lg border h-9 px-3 text-xs font-semibold select-none disabled:opacity-50 disabled:cursor-not-allowed",
        look,
        className,
      )}
    >
      {loading && <Spinner size="sm" />}
      {armed ? confirmLabel : children}
    </button>
  );
}

/** Panel lateral (escritorio) / pantalla completa (teléfono). */
export function Drawer({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full md:w-[640px] bg-background shadow-2xl flex flex-col">{children}</aside>
    </div>
  );
}
