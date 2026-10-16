"use client";

/**
 * Piezas propias de la app del piloto (complementan src/components/ui) con el
 * aspecto GruaYa: página de una columna de 560 px, barra pegajosa con el
 * wordmark y los segmentos Servicios · Historial, tarjetas apiladas.
 */
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn, Row, Segments, Spinner, Wordmark } from "@/components/ui";
import { formatQ, PROVIDER_KIND_LABELS } from "@/lib/format";
import type { ProviderSelf } from "@/lib/types";

export type DriverSection = "servicios" | "historial";

const SECTIONS: Array<{ key: DriverSection; label: string; href: string }> = [
  { key: "servicios", label: "Servicios", href: "/driver" },
  { key: "historial", label: "Historial", href: "/driver/historial" },
];

/** Barra pegajosa: wordmark "GruaYa piloto" y, si hay sesión, los segmentos. */
export function DriverBar({ section }: { section?: DriverSection }) {
  const router = useRouter();
  return (
    <header className="barra">
      <div className="columna">
        <h1 className="leading-none">
          <Wordmark suffix="piloto" />
        </h1>
        {section && (
          <Segments
            items={SECTIONS.map((s) => ({ key: s.key, label: s.label }))}
            value={section}
            onChange={(key) => router.push(SECTIONS.find((s) => s.key === key)?.href ?? "/driver")}
            label="Secciones"
          />
        )}
      </div>
    </header>
  );
}

/** Página completa del piloto: barra + columna de tarjetas + pie. */
export function DriverShell({ section, children, footer }: { section?: DriverSection; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="pagina">
      <DriverBar section={section} />
      <main className="columna">{children}</main>
      <footer className="pie">{footer}</footer>
    </div>
  );
}

/** Tarjeta de arriba: nombre, "{placa} · {vehículo} · ★ {calificación}" y, opcionalmente, el botón de estado. */
export function ProfileCard({ self, action }: { self: ProviderSelf; action?: ReactNode }) {
  const rating = self.rating != null ? `★ ${self.rating.toFixed(1)}` : "★ sin calificar";
  const details = [self.plate, self.vehicleLabel ?? PROVIDER_KIND_LABELS[self.kind], rating].filter(Boolean).join(" · ");
  return (
    <section className="tarjeta" aria-label="Tu cuenta">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate">{self.name}</h2>
          <p className="tenue leading-snug">{details}</p>
        </div>
        {action}
      </div>
    </section>
  );
}

/** "Tus números": servicios y ganancia del día (los mismos datos de siempre). */
export function NumbersCard({ today }: { today: ProviderSelf["today"] }) {
  return (
    <section className="tarjeta" aria-labelledby="tus-numeros">
      <h2 id="tus-numeros">Tus números</h2>
      <div>
        <Row label="Servicios" value={today.jobs} strong />
        <Row label="Ganancia" value={formatQ(today.earningsQ)} strong />
      </div>
      <p className="tenue chico">Servicios y ganancia de hoy.</p>
    </section>
  );
}

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
      ? "bg-amarillo text-primary-foreground border-amarillo"
      : variant === "success"
        ? "bg-verde text-white border-verde"
        : "bg-background text-foreground border-border hover:bg-surface";
  const sz = size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-base";
  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border font-bold select-none transition active:opacity-80",
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

/** Pantalla centrada (entrando, sin conexión) con el wordmark grande, como el prototipo. */
export function FullScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("pagina flex flex-col items-center justify-center gap-3 p-6 text-center safe-top safe-bottom", className)}>
      <Wordmark suffix="piloto" className="text-[28px]" />
      {children}
    </main>
  );
}

export function FullScreenSpinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <FullScreen>
      <Spinner size="lg" className="text-muted" />
      <p className="tenue">{label}</p>
    </FullScreen>
  );
}

/** Aviso fijo arriba cuando el sondeo falla (sin red, servidor caído…). */
export function ConnectionBanner({ message }: { message: string }) {
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] safe-top">
      <div className="mx-auto mt-2 w-fit max-w-[92vw] rounded-full bg-rojo px-4 py-1.5 text-xs font-semibold text-white shadow-lg">{message}</div>
    </div>
  );
}

export function Avatar({ initial, className }: { initial: string; className?: string }) {
  return (
    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-foreground", className)} aria-hidden>
      {initial}
    </div>
  );
}
