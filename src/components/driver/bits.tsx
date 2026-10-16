"use client";

/**
 * Piezas propias de la app del piloto (complementan src/components/ui) con el
 * aspecto GrúaYa final: mapa a pantalla completa con barra flotante (marca +
 * segmentos Servicios · Historial), píldora "● GPS en vivo", hoja inferior
 * blanca; y para inicio de sesión e historial, página gris con tarjetas blancas.
 */
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn, Segments, Spinner, TopBar, Wordmark } from "@/components/ui";
import { formatQ, PROVIDER_KIND_LABELS } from "@/lib/format";
import type { ProviderSelf } from "@/lib/types";
import type { LocationReporter } from "./useLocationReporter";

export type DriverSection = "servicios" | "historial";

const SECTIONS: Array<{ key: DriverSection; label: string; href: string }> = [
  { key: "servicios", label: "Servicios", href: "/driver" },
  { key: "historial", label: "Historial", href: "/driver/historial" },
];

function useSectionNav() {
  const router = useRouter();
  return (key: DriverSection) => router.push(SECTIONS.find((s) => s.key === key)?.href ?? "/driver");
}

/** Segmentos Servicios · Historial (píldora blanca, el activo negro). */
export function DriverSegments({ section }: { section: DriverSection }) {
  const go = useSectionNav();
  return <Segments items={SECTIONS.map((s) => ({ key: s.key, label: s.label }))} value={section} onChange={go} label="Secciones" />;
}

/** Barra pegajosa de las páginas grises (inicio de sesión, historial). */
export function DriverBar({ section }: { section?: DriverSection }) {
  return (
    <header className="barra">
      <div className="columna !flex-row items-center justify-between">
        <h1 className="leading-none">
          <Wordmark suffix="piloto" />
        </h1>
        {section && <DriverSegments section={section} />}
      </div>
    </header>
  );
}

/** Página gris de una columna: barra + tarjetas + pie. */
export function DriverShell({ section, children, footer }: { section?: DriverSection; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="pagina">
      <DriverBar section={section} />
      <main className="columna">{children}</main>
      <footer className="pie">{footer}</footer>
    </div>
  );
}

/**
 * Pantalla con mapa de fondo: `map` ocupa todo; encima la barra flotante
 * (marca + segmentos), lo que venga en `overlay` (píldoras, avisos) y la hoja.
 */
export function MapScreen({ map, overlay, children }: { map: ReactNode; overlay?: ReactNode; children: ReactNode }) {
  return (
    <div className="pantalla">
      <div className="mapa-fondo">{map}</div>
      <TopBar title="piloto" right={<DriverSegments section="servicios" />} />
      {overlay}
      {children}
    </div>
  );
}

/** Capa bajo la barra para píldoras y avisos flotantes (la barra mide ~52 px + zona segura). */
export function MapOverlay({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute left-4 right-4 z-[900] flex flex-col items-start gap-2 [&>*]:pointer-events-auto min-[900px]:left-[448px] min-[900px]:right-6", className)}
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
    >
      {children}
    </div>
  );
}

/** Píldora "● GPS en vivo" (verde) o gris según cómo se está reportando la ubicación. */
export function GpsPill({ loc, reporting }: { loc: LocationReporter; reporting: boolean }) {
  if (!reporting) return <span className="gps">○ GPS apagado</span>;
  if (loc.source === "gps") return <span className="gps en-vivo">● GPS en vivo</span>;
  if (loc.source === "manual") return <span className="gps">📌 Ubicación manual</span>;
  return <span className="gps">○ Buscando GPS…</span>;
}

/** Glifo del vehículo del piloto para el pin del mapa y el avatar. */
export function providerGlyph(kind: ProviderSelf["kind"]): string {
  return kind === "MOTO" ? "🏍️" : "🚛";
}

/** Tarjeta del piloto: avatar con la grúa, nombre, "★ 5.0 · Grúa plataforma" y la placa en ficha gris. */
export function ProviderCard({ self }: { self: ProviderSelf }) {
  const rating = self.rating != null ? `★ ${self.rating.toFixed(1)}` : "★ sin calificar";
  const vehicle = self.vehicleLabel ?? PROVIDER_KIND_LABELS[self.kind];
  return (
    <div className="persona" aria-label="Tu cuenta">
      <div className="avatar" aria-hidden>
        {providerGlyph(self.kind)}
      </div>
      <div className="persona-texto">
        <strong className="truncate text-[17px]">{self.name}</strong>
        <span className="tenue leading-snug">
          {rating} · {vehicle}
        </span>
      </div>
      {self.plate && (
        <div className="ficha">
          {self.plate}
          <small>Placa</small>
        </div>
      )}
    </div>
  );
}

/** Fila "etiqueta … valor" de la hoja (como las del prototipo). */
export function SheetRow({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-[17px]", className)}>
      <span>{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}

/** Servicios y ganancia de hoy (los mismos datos de siempre). */
export function NumbersRows({ today }: { today: ProviderSelf["today"] }) {
  return (
    <div className="flex flex-col gap-2" aria-label="Tus números">
      <SheetRow label="Servicios hoy" value={today.jobs} />
      <SheetRow label="Ganado hoy" value={formatQ(today.earningsQ)} />
    </div>
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
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "success";
  size?: "md" | "sm" | "icon";
  external?: boolean;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const look =
    variant === "primary"
      ? "bg-primary text-primary-foreground border-primary"
      : variant === "success"
        ? "bg-verde text-white border-verde"
        : "bg-background text-foreground border-border hover:bg-surface-2";
  const sz = size === "sm" ? "h-9 px-3 text-sm rounded-[10px]" : size === "icon" ? "h-12 w-12 rounded-full text-xl" : "h-12 px-4 text-base rounded-[14px]";
  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn("inline-flex items-center justify-center gap-2 border font-bold select-none transition active:opacity-80", look, sz, disabled && "opacity-50 pointer-events-none", className)}
    >
      {children}
    </a>
  );
}

/** Pantalla centrada (entrando, sin conexión) con la marca grande. */
export function FullScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("pagina flex flex-col items-center justify-center gap-3 p-6 text-center safe-top safe-bottom", className)}>
      <Wordmark plana suffix="piloto" />
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
    <div role="status" className="fixed inset-x-0 top-0 z-[1100] safe-top">
      <div className="mx-auto mt-2 w-fit max-w-[92vw] rounded-full bg-rojo px-4 py-1.5 text-xs font-semibold text-white shadow-lg">{message}</div>
    </div>
  );
}
