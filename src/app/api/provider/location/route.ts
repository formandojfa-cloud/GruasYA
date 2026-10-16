import { getProvider } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { recordProviderLocation } from "@/lib/dispatch";
import { LocationPingSchema } from "@/lib/types";

/** Ping de ubicación (cada pocos segundos mientras está conectado). */
export const POST = handle(async (req) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const loc = await parseBody(req, LocationPingSchema);
  const updated = await recordProviderLocation(provider.id, loc);
  return ok({ ok: true, status: updated.status, h3Cell: updated.h3Cell, at: updated.lastSeenAt?.toISOString() });
});
