"use client";

/** Piezas pequeñas compartidas por las pantallas del cliente. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/components/ui";

const ROUND = "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background text-2xl shadow-md hover:bg-surface";

export function BackButton({ onClick, href, label = "Volver", className }: { onClick?: () => void; href?: string; label?: string; className?: string }) {
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cn(ROUND, className)}>
        ‹
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn(ROUND, className)}>
      ‹
    </button>
  );
}

/** Clases para que un <Link> se vea como el botón primario / secundario. */
export const LINK_PRIMARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90 active:opacity-80";
export const LINK_SECONDARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 font-semibold text-foreground hover:bg-surface-2";

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
