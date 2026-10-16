"use client";

/** Piezas pequeñas compartidas por las pantallas del cliente. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ActionSheet, cn, type ActionSheetItem } from "@/components/ui";

const TEXT = "inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted hover:bg-surface";

/** Enlace o botón de texto "‹ Volver" para la esquina de una tarjeta. */
export function BackButton({ onClick, href, label = "Volver", className }: { onClick?: () => void; href?: string; label?: string; className?: string }) {
  if (href) {
    return (
      <Link href={href} className={cn(TEXT, className)}>
        ‹ {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(TEXT, className)}>
      ‹ {label}
    </button>
  );
}

/** Clases para que un <Link> se vea como el botón principal (negro) / secundario (blanco con borde). */
export const LINK_PRIMARY =
  "inline-flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-[17px] font-bold text-primary-foreground hover:opacity-90 active:opacity-80";
export const LINK_SECONDARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border border-border bg-background px-5 font-bold text-foreground hover:bg-surface-2";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[1200] flex justify-center p-4">
      <span className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg">{message}</span>
    </div>
  );
}

/** Aviso breve que desaparece solo. */
export function useToast(ms = 2500): [string | null, (message: string) => void] {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, ms]);
  const show = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  return [toast?.text ?? null, show];
}

// ---------- Central y emergencias ----------

/** Teléfono de la Central (NEXT_PUBLIC_CENTRAL_PHONE; 8 dígitos de Guatemala). */
export const CENTRAL_PHONE = process.env.NEXT_PUBLIC_CENTRAL_PHONE?.trim() || "5555-0000";

/** `tel:` con +502 para números de 8 dígitos. */
export function telHref(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `tel:+${d.length === 8 ? `502${d}` : d}`;
}

/** Enlace de WhatsApp a la Central con un mensaje inicial opcional. */
export function centralWhatsapp(text?: string): string {
  const d = CENTRAL_PHONE.replace(/\D/g, "");
  const base = `https://wa.me/${d.length === 8 ? `502${d}` : d}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Números de emergencia de Guatemala (todos `tel:` directos). */
export const EMERGENCIES: ReadonlyArray<{ icon: string; label: string; hint: string; phone: string }> = [
  { icon: "🛣️", label: "PROVIAL", hint: "Asistencia en carretera · 1520", phone: "1520" },
  { icon: "🚒", label: "Bomberos", hint: "Voluntarios 122 · Municipales 123", phone: "122" },
  { icon: "🚓", label: "PNC", hint: "Policía Nacional Civil · 110", phone: "110" },
];

/**
 * Hoja "Soporte": hablar/llamar a la Central y los números de emergencia.
 * `emergenciesFirst` (servicio en curso, botón Seguridad): emergencias arriba.
 * `message`: texto inicial del WhatsApp (p. ej. con el id del servicio).
 */
export function SupportSheet({
  open,
  onClose,
  emergenciesFirst = false,
  message,
}: {
  open: boolean;
  onClose: () => void;
  emergenciesFirst?: boolean;
  message?: string;
}) {
  const central: ActionSheetItem[] = [
    { icon: "💬", label: "Hablar con la Central", hint: `WhatsApp · ${CENTRAL_PHONE}`, href: centralWhatsapp(message), external: true },
    { icon: "📞", label: "Llamar a la Central", hint: "Atención las 24 horas", href: telHref(CENTRAL_PHONE) },
  ];
  const emergencies: ActionSheetItem[] = EMERGENCIES.map((e) => ({ icon: e.icon, label: e.label, hint: e.hint, href: `tel:${e.phone}`, danger: true }));
  return (
    <ActionSheet open={open} onClose={onClose} title={emergenciesFirst ? "Seguridad" : "Soporte"} items={emergenciesFirst ? emergencies : central}>
      <p className="encabezado-hoja">{emergenciesFirst ? "Central GrúaYa" : "Emergencias"}</p>
      <div className="filas-accion" role="list">
        {(emergenciesFirst ? central : emergencies).map((it, i) => (
          <a key={i} role="listitem" href={it.href} target={it.external ? "_blank" : undefined} rel={it.external ? "noopener noreferrer" : undefined} className={cn("fila-accion", it.danger && "fila-accion-peligro")}>
            <span className="fila-accion-icono">{it.icon}</span>
            <span className="fila-accion-texto">
              <strong>{it.label}</strong>
              <span>{it.hint}</span>
            </span>
            <span className="fila-accion-flecha" aria-hidden>
              ›
            </span>
          </a>
        ))}
      </div>
    </ActionSheet>
  );
}
