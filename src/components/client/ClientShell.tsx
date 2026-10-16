"use client";

/**
 * Armazones del Conductor con el aspecto GrúaYa final:
 *  - <ClientSegments>: píldora Pedir · Mi servicio · Historial · Cuenta (navega entre rutas).
 *  - <ClientShell>: página gris con barra pegajosa y tarjetas apiladas (Historial, Cuenta).
 *  - <ClientScreen>: mapa a pantalla completa con barra flotante y hoja inferior (Pedir, Mi servicio, /r/[id]).
 */
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BottomPanel, Segments, Wordmark } from "@/components/ui";

export type ClientSection = "pedir" | "servicio" | "historial" | "cuenta";
type Key = ClientSection | "none";

const HREF: Record<ClientSection, string> = { pedir: "/", servicio: "/", historial: "/historial", cuenta: "/cuenta" };

type NavProps = {
  /** Segmento activo (null: ninguno, p. ej. un servicio viejo en /r/[id]). */
  section: ClientSection | null;
  /** Hay un servicio en curso: aparece el segmento "Mi servicio". */
  hasActive?: boolean;
  /** Qué hacer al tocar "Pedir" dentro de la misma página; si no, navega a "/". */
  onPedir?: () => void;
  pedirDisabled?: boolean;
};

export function ClientSegments({ section, hasActive = false, onPedir, pedirDisabled }: NavProps) {
  const router = useRouter();
  const pathname = usePathname();

  function go(key: Key) {
    if (key === "none" || key === section) return;
    if (key === "pedir" && onPedir) return onPedir();
    const href = HREF[key];
    if (href !== pathname) router.push(href);
    else if (key === "pedir" && section === "servicio") onPedir?.();
  }

  const items: Array<{ key: Key; label: string; disabled?: boolean }> = [
    { key: "pedir", label: "Pedir", disabled: pedirDisabled },
    ...(hasActive ? [{ key: "servicio" as const, label: "Mi servicio" }] : []),
    { key: "historial", label: "Historial" },
    { key: "cuenta", label: "Cuenta" },
  ];

  return (
    <Segments<Key>
      items={items}
      value={section ?? "none"}
      onChange={go}
      label="Secciones"
      // Con cuatro segmentos en un teléfono angosto, letra un poco más chica para que quepan.
      className={items.length > 3 ? "[&>button]:!px-2 [&>button]:!text-[13px]" : undefined}
    />
  );
}

type ShellProps = NavProps & {
  /** Sin segmentos (enlace compartido, ingreso). */
  showSegments?: boolean;
  /** Sufijo pequeño del wordmark. */
  suffix?: ReactNode;
  children: ReactNode;
};

/** Página gris con barra pegajosa (marca + segmentos) y columna de tarjetas. */
export function ClientShell({ showSegments = true, suffix, children, ...nav }: ShellProps) {
  return (
    <div className="pagina">
      <header className="barra">
        <div className="columna !flex-row !items-center !justify-between !flex-wrap">
          <h1 className="leading-none">
            <Wordmark suffix={suffix} />
          </h1>
          {showSegments && <ClientSegments {...nav} />}
        </div>
      </header>
      <main className="columna">{children}</main>
      <p className="pie">Precio fijo · Pago en efectivo al piloto · GrúaYa Guatemala</p>
    </div>
  );
}

type ScreenProps = NavProps & {
  /** El mapa (ocupa toda la pantalla, detrás de la hoja). */
  map: ReactNode;
  /** Capa sobre el mapa (p. ej. el pin central). */
  overlay?: ReactNode;
  showSegments?: boolean;
  suffix?: ReactNode;
  /** Píldora "‹" antes de la marca. */
  onBack?: () => void;
  /** Contenido de la hoja inferior. */
  children: ReactNode;
  footer?: ReactNode;
  height?: "normal" | "alta" | "corta";
  /** Cosas fuera de la pantalla (modales, avisos) para que queden por encima de la hoja. */
  extra?: ReactNode;
};

/**
 * Pantalla con mapa completo. En teléfono el mapa se extiende 40 % por arriba
 * de la ventana, así su centro (y el encuadre automático) cae en la parte visible
 * sobre la hoja; en computadora la hoja es un panel a la izquierda y el mapa va entero.
 */
export function ClientScreen({ map, overlay, showSegments = true, suffix, onBack, children, footer, height, extra, ...nav }: ScreenProps) {
  return (
    <>
      <div className="pantalla">
        <div className="mapa-fondo -top-[40%]! min-[900px]:top-0!">
          {map}
          {overlay}
        </div>
        <header className="barra-flotante">
          <div className="flex min-w-0 items-center gap-2">
            {onBack && (
              <button type="button" onClick={onBack} aria-label="Volver" className="pildora !px-3 text-xl leading-none">
                ‹
              </button>
            )}
            <h1 className="min-w-0 leading-none">
              <Wordmark suffix={suffix} />
            </h1>
          </div>
          {showSegments && <ClientSegments {...nav} />}
        </header>
        <BottomPanel footer={footer} height={height}>
          {children}
        </BottomPanel>
      </div>
      {extra}
    </>
  );
}
