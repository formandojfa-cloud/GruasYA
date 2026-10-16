"use client";

/**
 * Piezas pequeñas propias de la Central (complementan src/components/ui) con el
 * aspecto GrúaYa final: barra pegajosa con la píldora "GrúaYa Admin" y píldoras
 * a la derecha, pestañas en píldora (Servicios · Pilotos) debajo, columna de
 * tarjetas blancas (560 px en teléfono, ancha en escritorio para conservar la
 * rejilla del panel) y botones del prototipo (principal negro, peligro en rojo).
 */
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { cn, Pill, Segments, Spinner, Wordmark } from "@/components/ui";
import { formatPhone, PROVIDER_STATUS_LABELS, type Tone } from "@/lib/format";
import type { ProviderStatus } from "@/lib/types";
import { copyText } from "./util";

export type PbxSection = "panel" | "providers";

const SECTIONS: Array<{ key: PbxSection; label: string; href: string }> = [
  { key: "panel", label: "Servicios", href: "/pbx" },
  { key: "providers", label: "Pilotos", href: "/pbx/proveedores" },
];

/** La columna del prototipo mide 560 px; en escritorio la Central se ensancha para la rejilla alertas · mapa · activos. */
export const WIDE = "lg:max-w-[1440px]";

/** Barra pegajosa del Admin: píldora de marca "GrúaYa Admin" a la izquierda y, a la derecha, las píldoras del operador y "Salir". */
export function CentralBar({ right }: { right?: ReactNode }) {
  return (
    <header className="barra">
      <div className={cn("columna flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2", WIDE)}>
        <h1 className="leading-none">
          <Wordmark suffix="Admin" />
        </h1>
        {right && <div className="ml-auto flex items-center gap-2 min-w-0">{right}</div>}
      </div>
    </header>
  );
}

/** Pestañas en píldora del prototipo (la activa blanca con sombra): Servicios (con la cuenta de alertas sin atender) · Pilotos. */
export function CentralTabs({ section, unackCount = 0, hasUnseen }: { section: PbxSection; unackCount?: number; hasUnseen?: boolean }) {
  const router = useRouter();
  const items = SECTIONS.map((s) => ({
    key: s.key,
    label:
      s.key === "panel" && unackCount > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          {s.label}
          <span
            className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-rojo text-white text-[12px] font-bold tabular-nums", hasUnseen && "animate-pulse")}
            aria-label={`${unackCount} alertas sin atender`}
          >
            {unackCount}
          </span>
        </span>
      ) : (
        s.label
      ),
  }));
  return (
    <nav aria-label="Secciones" className="-mx-4 px-4 lg:mx-0 lg:px-0">
      <Segments variant="pestanas" items={items} value={section} onChange={(key) => router.push(SECTIONS.find((s) => s.key === key)?.href ?? "/pbx")} label="Secciones" />
    </nav>
  );
}

/** Página completa de la Central: barra + pestañas + columna de tarjetas + pie. */
export function CentralShell({
  section,
  right,
  unackCount,
  hasUnseen,
  children,
  footer,
}: {
  section?: PbxSection;
  right?: ReactNode;
  unackCount?: number;
  hasUnseen?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="pagina">
      <CentralBar right={right} />
      <main className={cn("columna", WIDE)}>
        {section && <CentralTabs section={section} unackCount={unackCount} hasUnseen={hasUnseen} />}
        {children}
      </main>
      <p className="pie">{footer ?? "Central GrúaYa · Precio fijo · Pago en efectivo al piloto"}</p>
    </div>
  );
}

// ---------- Métricas ----------

/**
 * Métrica como en la tarjeta "Servicios" del prototipo: una fila con el texto a
 * la izquierda y el número en negrita a la derecha (en escritorio las filas se
 * reparten en columnas dentro de la misma tarjeta).
 */
export function Stat({ label, value, tone = "neutral", hint }: { label: ReactNode; value: ReactNode; tone?: Tone; hint?: string }) {
  const color = tone === "danger" ? "text-rojo" : tone === "success" ? "text-verde" : tone === "info" ? "text-azul" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 min-h-10 min-w-0">
      <span className="text-[16px] leading-snug">
        {label}
        {hint && <span className="tenue chico"> · {hint}</span>}
      </span>
      <strong className={cn("tabular-nums text-[17px] whitespace-nowrap", color)}>{value}</strong>
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <h3 className="text-[17px] font-semibold leading-tight">{children}</h3>
      {right}
    </div>
  );
}

/** Fila clave/valor densa. */
export function KV({ k, v, mono, className }: { k: string; v: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 border-b border-border/60 last:border-0", className)}>
      <span className="tenue chico shrink-0">{k}</span>
      <span className={cn("text-sm text-right min-w-0 break-words font-semibold", mono && "font-mono")}>{v}</span>
    </div>
  );
}

/** Tarjeta del prototipo; con `tone`, borde izquierdo de 5 px del color del estado. */
export function Box({ children, className, tone }: { children: ReactNode; className?: string; tone?: "danger" | "warning" | "success" | "info" }) {
  const accent =
    tone === "danger"
      ? "estado estado-cancelado"
      : tone === "warning"
        ? "estado estado-buscando"
        : tone === "success"
          ? "estado estado-pagado"
          : tone === "info"
            ? "estado estado-asignado"
            : null;
  return <section className={cn("tarjeta min-w-0", accent, className)}>{children}</section>;
}

// ---------- Botones del prototipo (principal negro; radio 12 px; peligro = texto rojo) ----------

const BTN = "inline-flex items-center justify-center gap-1.5 rounded-xl border font-bold select-none transition active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed";
const BTN_SIZE = { sm: "h-10 px-3 text-[13px]", md: "h-11 px-4 text-[15px]", lg: "h-[52px] px-5 text-[17px]" } as const;
const BTN_LOOK = {
  primary: "bg-primary text-primary-foreground border-primary hover:opacity-90",
  secondary: "bg-background text-foreground border-border hover:bg-surface",
  success: "bg-verde text-white border-verde hover:brightness-95",
  ghost: "bg-transparent text-foreground border-transparent hover:bg-surface",
  danger: "bg-background text-rojo border-border hover:bg-danger-soft",
} as const;

export function CopyButton({ text, label = "Copiar", size = "sm", className }: { text: string; label?: string; size?: "sm" | "md"; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(id);
  }, [state]);
  return (
    <button type="button" onClick={async () => setState((await copyText(text)) ? "ok" : "fail")} className={cn(BTN, BTN_LOOK.secondary, BTN_SIZE[size], className)}>
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
  variant?: keyof typeof BTN_LOOK;
  size?: keyof typeof BTN_SIZE;
  className?: string;
  external?: boolean;
  title?: string;
}) {
  return (
    <a href={href} title={title} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className={cn(BTN, BTN_LOOK[variant], BTN_SIZE[size], className)}>
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
    <p role="alert" className={cn("rounded-[10px] bg-danger-soft text-rojo text-sm px-2.5 py-2", className)}>
      {children}
    </p>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center text-muted">{children}</div>;
}

export function BootSpinner({ label = "Cargando la central…" }: { label?: string }) {
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
  size = "sm",
}: {
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: "secondary" | "danger" | "primary";
  size?: keyof typeof BTN_SIZE;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  const look = armed ? "bg-danger-soft text-rojo border-rojo" : BTN_LOOK[variant];
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
      className={cn(BTN, BTN_SIZE[size], look, className)}
    >
      {loading && <Spinner size="sm" />}
      {armed ? confirmLabel : children}
    </button>
  );
}

/** Panel lateral (escritorio) / pantalla completa (teléfono) sobre fondo gris de página, con tarjetas blancas dentro. */
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
      <aside className="absolute inset-y-0 right-0 w-full md:w-[640px] bg-surface shadow-2xl flex flex-col">{children}</aside>
    </div>
  );
}
