import { getClientUser } from "@/lib/auth";
import { handle, ok, parseBody } from "@/lib/api-helpers";
import { isActiveMember } from "@/lib/dispatch";
import { etaMinutes, roadDistanceKm } from "@/lib/geo";
import { quoteFor } from "@/lib/pricing";
import { QuoteRequestSchema } from "@/lib/types";

/** Precio antes de pedir. Funciona sin sesión (como no socio). */
export const POST = handle(async (req) => {
  const input = await parseBody(req, QuoteRequestSchema);
  const now = new Date();
  const user = await getClientUser();
  const isMember = user ? isActiveMember(user, now) : false;
  const distanceKm = input.kind === "TOW" && input.dropoff ? roadDistanceKm(input.pickup, input.dropoff) : 0;
  const quote = quoteFor({ kind: input.kind, distanceKm, isMember, at: now });
  return ok({ quote, distanceKm, towMinutes: distanceKm ? etaMinutes(distanceKm) : 0, isMember });
});
