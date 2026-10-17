import { advanceAll } from "@/lib/dispatch";
import { fail, handle, ok } from "@/lib/api-helpers";

/**
 * Latido externo del despacho. Supabase (pg_cron + pg_net, ver supabase/motor.sql)
 * lo llama cada 10 s con `Authorization: Bearer <TICK_SECRET>` para que las
 * cascadas avancen aunque el servidor esté dormido o sea serverless. Es el
 * mismo trabajo que hace el ticker interno (src/lib/ticker.ts); los dos pueden
 * convivir porque cada transición está protegida por estado y candado.
 */
export const POST = handle(async (req) => {
  const secret = process.env.TICK_SECRET;
  if (!secret) return fail("DISABLED", "TICK_SECRET no está configurado", 404);
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return fail("UNAUTHORIZED", "Secreto inválido", 401);
  const at = new Date();
  const { advanced, offlined } = await advanceAll(at);
  return ok({ ok: true, at: at.toISOString(), advanced, offlined });
});
