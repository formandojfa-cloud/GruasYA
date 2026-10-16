"use client";

/**
 * Pantalla "mapa arriba, tarjeta abajo" (como Uber). El mapa ocupa una altura
 * fija para que el pin central, el pulso de búsqueda y los marcadores queden
 * siempre a la vista; la tarjeta ocupa el resto y se desplaza si hace falta.
 */
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function MapScreen({
  map,
  top,
  children,
  mapClassName = "h-[50dvh]",
  panelClassName,
}: {
  /** El mapa (y cualquier capa encima, p. ej. el pin central). */
  map: ReactNode;
  /** Controles flotantes sobre el mapa (volver, buscador, estado). */
  top?: ReactNode;
  children: ReactNode;
  mapClassName?: string;
  panelClassName?: string;
}) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface">
      <div className={cn("relative shrink-0", mapClassName)}>
        {map}
        {top && <div className="safe-top absolute inset-x-0 top-0 z-20 p-3">{top}</div>}
      </div>
      <section
        className={cn(
          "safe-bottom relative z-20 -mt-6 flex-1 overflow-y-auto rounded-t-3xl bg-background p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.15)]",
          panelClassName,
        )}
      >
        {children}
      </section>
    </div>
  );
}
