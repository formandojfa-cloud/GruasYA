"use client";

/**
 * Señales de alerta nueva para el operador: pitido (WebAudio), parpadeo del
 * título de la pestaña y conjunto de alertas "no vistas" para la insignia.
 * Solo reacciona a ids que aparecen ENTRE sondeos (no al cargar la página).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertView } from "@/lib/types";

type AudioCtor = typeof AudioContext;
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (sharedCtx) return sharedCtx;
    const w = window as Window & { webkitAudioContext?: AudioCtor };
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    sharedCtx = new Ctor();
    return sharedCtx;
  } catch {
    return null;
  }
}

/** Dos tonos cortos. Falla en silencio si el navegador bloquea el audio. */
export function beep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    const t0 = ctx.currentTime;
    [0, 0.2].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.17);
    });
  } catch {
    /* sin audio */
  }
}

export function useAlertSignals(alerts: AlertView[] | undefined) {
  const known = useRef<Set<string> | null>(null);
  const baseTitle = useRef<string>("Central · GruaYa");
  const [unseen, setUnseen] = useState<ReadonlySet<string>>(() => new Set());

  // Desbloquear el audio con el primer gesto del operador (política de autoplay).
  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx?.state === "suspended") void ctx.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined" && document.title && !document.title.startsWith("(")) baseTitle.current = document.title;
  }, []);

  useEffect(() => {
    if (!alerts) return;
    const ids = alerts.map((a) => a.id);
    if (known.current === null) {
      known.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !known.current!.has(id));
    for (const id of ids) known.current.add(id);
    const stillOpen = new Set(ids);
    setUnseen((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (stillOpen.has(id)) next.add(id);
      for (const id of fresh) next.add(id);
      // Las ya atendidas dejan de ser "nuevas".
      for (const a of alerts) if (a.acknowledgedAt) next.delete(a.id);
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
    if (fresh.length > 0) beep();
  }, [alerts]);

  // Parpadeo del título mientras haya alertas nuevas sin ver.
  const count = unseen.size;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = baseTitle.current;
    if (count === 0) {
      document.title = base;
      return;
    }
    const alertTitle = `(${count}) ALERTA · Central`;
    let on = true;
    document.title = alertTitle;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? alertTitle : base;
    }, 900);
    return () => {
      clearInterval(id);
      document.title = base;
    };
  }, [count]);

  const markSeen = useCallback((id: string) => {
    setUnseen((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearUnseen = useCallback(() => setUnseen((prev) => (prev.size ? new Set() : prev)), []);

  return { unseen, markSeen, clearUnseen };
}
