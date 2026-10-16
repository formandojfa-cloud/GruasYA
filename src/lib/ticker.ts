import { DISPATCH } from "./config";
import { advanceAll } from "./dispatch";

/**
 * Ticker del servidor: hace avanzar las cascadas aunque nadie esté consultando
 * (p. ej. el cliente cerró la app). En un despliegue serverless se reemplaza
 * por un cron que llame a `advanceAll` cada pocos segundos.
 */
const g = globalThis as unknown as { __rsTicker?: NodeJS.Timeout };

export function startDispatchTicker(): void {
  if (g.__rsTicker) return;
  let running = false;
  g.__rsTicker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await advanceAll(new Date());
    } catch (err) {
      console.error("dispatch ticker failed", err);
    } finally {
      running = false;
    }
  }, DISPATCH.tickerIntervalMs);
  g.__rsTicker.unref?.();
}

export function stopDispatchTicker(): void {
  if (g.__rsTicker) clearInterval(g.__rsTicker);
  g.__rsTicker = undefined;
}
