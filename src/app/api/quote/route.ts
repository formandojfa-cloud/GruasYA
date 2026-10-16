import { getClientUser } from "@/lib/auth";
import { handle, ok, parseBody } from "@/lib/api-helpers";
import { isActiveMember, nearestOnlineProvider } from "@/lib/dispatch";
import { quoteFor } from "@/lib/pricing";
import { getRoute } from "@/lib/routes";
import { QuoteRequestSchema, type QuoteResponse } from "@/lib/types";

/** Precio antes de pedir. Funciona sin sesión (como no socio). */
export const POST = handle(async (req) => {
  const input = await parseBody(req, QuoteRequestSchema);
  const now = new Date();
  const user = await getClientUser();
  const isMember = user ? isActiveMember(user, now) : false;

  // Ruta del remolque por calles (misma fuente que usará createRequest) y grúa más cercana en paralelo.
  const [route, nearest] = await Promise.all([
    input.kind === "TOW" && input.dropoff ? getRoute(input.pickup, input.dropoff, now) : null,
    nearestOnlineProvider(input.kind, input.pickup, now),
  ]);
  const distanceKm = route?.distanceKm ?? 0;
  const quote = quoteFor({ kind: input.kind, distanceKm, isMember, at: now });

  let nearestProvider: QuoteResponse["nearestProvider"] = null;
  if (nearest) {
    const p = nearest.provider;
    const approach = await getRoute({ lat: p.lat!, lng: p.lng! }, input.pickup, now);
    nearestProvider = { etaMinutes: approach.minutes, distanceKm: approach.distanceKm };
  }

  const body: QuoteResponse = {
    quote,
    distanceKm,
    towMinutes: route?.minutes ?? 0,
    routeSource: route?.source ?? "estimada",
    geometry: route?.geometry ?? [],
    isMember,
    nearestProvider,
  };
  return ok(body);
});
