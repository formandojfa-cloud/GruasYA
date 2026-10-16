"use client";

/**
 * Página del Conductor con el aspecto GruaYa: barra pegajosa (wordmark +
 * segmentos Pedir · Mi servicio · Historial · Cuenta), una columna centrada de
 * 560 px con tarjetas apiladas y un pie pequeño en gris.
 */
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Segments, Wordmark } from "@/components/ui";

export type ClientSection = "pedir" | "servicio" | "historial" | "cuenta";
type Key = ClientSection | "none";

const HREF: Record<ClientSection, string> = { pedir: "/", servicio: "/", historial: "/historial", cuenta: "/cuenta" };

type Props = {
  /** Segmento activo (null: ninguno, p. ej. un servicio viejo en /r/[id]). */
  section: ClientSection | null;
  /** Hay un servicio en curso: aparece el segmento "Mi servicio". */
  hasActive?: boolean;
  /** Qué hacer al tocar "Pedir" dentro de la misma página; si no, navega a "/". */
  onPedir?: () => void;
  pedirDisabled?: boolean;
  /** Sin segmentos (enlace compartido, ingreso). */
  showSegments?: boolean;
  /** Sufijo pequeño del wordmark. */
  suffix?: ReactNode;
  children: ReactNode;
};

export function ClientShell({ section, hasActive = false, onPedir, pedirDisabled, showSegments = true, suffix, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function go(key: Key) {
    if (key === "none" || key === section) return;
    if (key === "pedir" && onPedir) return onPedir();
    const href = HREF[key];
    if (href !== pathname) router.push(href);
  }

  const items: Array<{ key: Key; label: string; disabled?: boolean }> = [
    { key: "pedir", label: "Pedir", disabled: pedirDisabled },
    ...(hasActive ? [{ key: "servicio" as const, label: "Mi servicio" }] : []),
    { key: "historial", label: "Historial" },
    { key: "cuenta", label: "Cuenta" },
  ];

  return (
    <div className="pagina">
      <header className="barra">
        <div className="columna">
          <h1 className="leading-none">
            <Wordmark suffix={suffix} />
          </h1>
          {showSegments && (
            <Segments<Key>
              items={items}
              value={section ?? "none"}
              onChange={go}
              label="Secciones"
              // Con cuatro segmentos en un teléfono angosto, letra un poco más chica para que quepan.
              className={items.length > 3 ? "[&>button]:px-1 [&>button]:text-[13px]" : undefined}
            />
          )}
        </div>
      </header>
      <main className="columna">{children}</main>
      <p className="pie">Precio fijo · Pago en efectivo al gruero · GruaYa Guatemala</p>
    </div>
  );
}
