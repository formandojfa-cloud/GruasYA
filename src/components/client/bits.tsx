"use client";

/** Piezas pequeñas compartidas por las pantallas del cliente. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/components/ui";

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

/** Clases para que un <Link> se vea como el botón principal (amarillo) / secundario (blanco con borde). */
export const LINK_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amarillo bg-amarillo px-5 font-bold text-primary-foreground hover:brightness-95 active:brightness-90";
export const LINK_SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 font-bold text-foreground hover:bg-surface";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-4">
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
