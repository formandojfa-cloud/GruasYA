/**
 * Convierte los registros de la BD en lo que ve cada rol. El cliente ve su PIN
 * y el teléfono del proveedor mientras el servicio está activo; el proveedor
 * nunca ve el PIN; el PBX lo ve todo.
 */
import type { DispatchOffer, Provider } from "@/generated/prisma/client";
import { DISPATCH } from "./config";
import { parseQuote, type RequestWithRelations } from "./dispatch";
import { etaMinutes } from "./geo";
import { getRoute, parseGeometry } from "./routes";
import { providerAccessLink, providerInviteText, whatsappLink } from "./notifications";
import type {
  LiveLocation,
  OfferView,
  ProviderAdminView,
  ProviderCard,
  RequestEventView,
  RequestView,
} from "./types";

/** SHARE: enlace público de seguimiento (sin PIN ni teléfonos), como "compartir viaje" en Uber. */
export type ViewerRole = "CLIENT" | "PROVIDER" | "PBX" | "SHARE";

const CONTACT_VISIBLE = new Set(["EN_ROUTE", "ARRIVED", "IN_PROGRESS"]);

export function providerRating(p: Pick<Provider, "ratingSum" | "ratingCount">): number | null {
  return p.ratingCount > 0 ? Math.round((p.ratingSum / p.ratingCount) * 10) / 10 : null;
}

export function toProviderCard(p: Provider, opts: { withContact: boolean }): ProviderCard {
  const card: ProviderCard = {
    id: p.id,
    name: p.name,
    kind: p.kind,
    plate: p.plate,
    vehicleLabel: p.vehicleLabel,
    photoUrl: p.photoUrl,
    rating: providerRating(p),
    ratingCount: p.ratingCount,
    isExternal: p.isExternal,
  };
  if (opts.withContact) {
    card.phone = p.phone;
    card.whatsapp = whatsappLink(p.phone);
  }
  return card;
}

/**
 * Posición en vivo del proveedor con distancia y ETA hasta su objetivo. En
 * EN_ROUTE/IN_PROGRESS la ruta sale del motor de rutas (con caché; estimación si
 * no hay red); en ARRIVED ya está en la recogida y no hace falta consultar.
 */
export async function liveLocationFor(req: RequestWithRelations, now: Date = new Date()): Promise<LiveLocation | null> {
  const p = req.provider;
  if (!p || p.lat == null || p.lng == null || !p.lastSeenAt) return null;
  if (!CONTACT_VISIBLE.has(req.status)) return null;
  const here = { lat: p.lat, lng: p.lng };
  const towing = req.status === "IN_PROGRESS" && req.dropoffLat != null && req.dropoffLng != null;
  const target = towing ? { lat: req.dropoffLat!, lng: req.dropoffLng! } : { lat: req.pickupLat, lng: req.pickupLng };
  const route = await getRoute(here, target, now);
  return {
    lat: p.lat,
    lng: p.lng,
    heading: p.heading,
    updatedAt: p.lastSeenAt.toISOString(),
    target: towing ? "DROPOFF" : "PICKUP",
    distanceKm: route.distanceKm,
    etaMinutes: route.minutes,
    routeSource: route.source,
    routeGeometry: route.geometry,
  };
}

const CLIENT_EVENT_TYPES = new Set([
  "CREATED",
  "OFFER_SENT",
  "ESCALATED",
  "HELP_REQUESTED",
  "ASSIGNED",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "PROVIDER_CANCELLED",
  "SEARCH_RESTARTED",
  "RATED",
]);

const INTERNAL_EVENT_KEYS = new Set(["providerId", "operatorId", "offerId"]);

function toEvents(req: RequestWithRelations, role: ViewerRole): RequestEventView[] {
  return req.events
    .filter((e) => role === "PBX" || CLIENT_EVENT_TYPES.has(e.type))
    .map((e) => {
      let data: Record<string, unknown> | null = e.data ? (JSON.parse(e.data) as Record<string, unknown>) : null;
      if (data && role !== "PBX") {
        // Los clientes no necesitan ids internos de proveedores.
        data = Object.fromEntries(Object.entries(data).filter(([k]) => !INTERNAL_EVENT_KEYS.has(k)));
      }
      return { type: e.type, at: e.at.toISOString(), data };
    });
}

export async function toRequestView(req: RequestWithRelations, role: ViewerRole, now: Date = new Date()): Promise<RequestView> {
  const quote = parseQuote(req);
  const pending = req.offers.find((o) => o.response === "PENDING") ?? null;
  const offersThisEpoch = req.offers.filter((o) => o.epoch === req.searchEpoch && o.round > 0).length;
  const openAlert = req.alerts.find((a) => !a.resolvedAt) ?? req.alerts[req.alerts.length - 1] ?? null;
  const contactVisible = role === "PBX" || (role === "CLIENT" && CONTACT_VISIBLE.has(req.status));
  const clientRating = req.ratings.find((r) => r.byRole === "CLIENT")?.stars ?? null;
  const providerRatingGiven = req.ratings.find((r) => r.byRole === "PROVIDER")?.stars ?? null;

  const view: RequestView = {
    id: req.id,
    kind: req.kind,
    status: req.status,
    vehicleKind: req.vehicleKind,
    vehicleLabel: req.vehicleLabel,
    plate: req.plate,
    notes: req.notes,
    pickup: { lat: req.pickupLat, lng: req.pickupLng, address: req.pickupAddress ?? undefined },
    dropoff:
      req.dropoffLat != null && req.dropoffLng != null
        ? { lat: req.dropoffLat, lng: req.dropoffLng, address: req.dropoffAddress ?? undefined }
        : null,
    distanceKm: req.distanceKm,
    estimatedMinutes: req.estimatedMinutes,
    routeSource: req.routeSource as RequestView["routeSource"],
    routeGeometry: parseGeometry(req.routeGeometry),
    isMember: req.isMemberAtRequest,
    quote,
    priceTotal: req.priceTotal,
    provider: req.provider ? toProviderCard(req.provider, { withContact: contactVisible }) : null,
    providerLive: await liveLocationFor(req, now),
    assignedBy: req.assignedBy,
    search: {
      epoch: req.searchEpoch,
      startedAt: req.searchStartedAt.toISOString(),
      deadlineAt: req.searchDeadlineAt.toISOString(),
      offersSent: offersThisEpoch,
      maxOffers: DISPATCH.maxOffersPerEpoch,
      currentOffer: pending
        ? {
            id: pending.id,
            round: pending.round,
            expiresAt: pending.expiresAt.toISOString(),
            providerName: pending.provider.name,
            ...(role === "PBX" ? { providerId: pending.providerId } : {}),
          }
        : null,
    },
    escalation:
      req.escalatedAt || openAlert
        ? {
            at: (openAlert?.createdAt ?? req.escalatedAt!).toISOString(),
            reason: openAlert?.reason ?? req.escalationReason ?? "UNKNOWN",
            alertId: openAlert?.id ?? null,
            acknowledgedAt: openAlert?.acknowledgedAt?.toISOString() ?? null,
            acknowledgedBy: openAlert?.acknowledgedBy?.name ?? null,
          }
        : null,
    timestamps: {
      createdAt: req.createdAt.toISOString(),
      assignedAt: req.assignedAt?.toISOString() ?? null,
      arrivedAt: req.arrivedAt?.toISOString() ?? null,
      startedAt: req.startedAt?.toISOString() ?? null,
      completedAt: req.completedAt?.toISOString() ?? null,
      cancelledAt: req.cancelledAt?.toISOString() ?? null,
    },
    cancellation: req.cancelledBy ? { by: req.cancelledBy, reason: req.cancelReason, feeQ: req.cancellationFee } : null,
    ratings: { client: clientRating, provider: providerRatingGiven },
    events: toEvents(req, role),
    updatedAt: req.updatedAt.toISOString(),
  };

  if (role === "CLIENT" || role === "PBX") view.pin = req.pin;
  if (role === "PBX" || (role === "PROVIDER" && CONTACT_VISIBLE.has(req.status))) {
    view.client = {
      id: req.user.id,
      name: role === "PROVIDER" ? req.user.name.split(" ")[0] : req.user.name,
      phone: req.user.phone,
      whatsapp: whatsappLink(req.user.phone),
    };
  }
  return view;
}

export async function toOfferView(
  offer: DispatchOffer,
  req: RequestWithRelations,
  provider: Pick<Provider, "lat" | "lng">,
  now: Date = new Date(),
): Promise<OfferView> {
  const quote = parseQuote(req);
  const pickup = { lat: req.pickupLat, lng: req.pickupLng };
  // Con la ubicación del gruero, ruta real hasta la recogida; sin ella, lo guardado en la oferta.
  const toPickup =
    provider.lat != null && provider.lng != null
      ? await getRoute({ lat: provider.lat, lng: provider.lng }, pickup, now)
      : null;
  return {
    id: offer.id,
    requestId: req.id,
    round: offer.round,
    expiresAt: offer.expiresAt.toISOString(),
    kind: req.kind,
    vehicleKind: req.vehicleKind,
    vehicleLabel: req.vehicleLabel,
    pickup: { ...pickup, address: req.pickupAddress ?? undefined },
    dropoff:
      req.dropoffLat != null && req.dropoffLng != null
        ? { lat: req.dropoffLat, lng: req.dropoffLng, address: req.dropoffAddress ?? undefined }
        : null,
    distanceToPickupKm: toPickup?.distanceKm ?? offer.distanceKm,
    etaToPickupMinutes: toPickup?.minutes ?? etaMinutes(offer.distanceKm),
    routeSource: toPickup?.source ?? "estimada",
    towDistanceKm: req.distanceKm,
    payoutQ: quote.providerPayoutQ,
    clientFirstName: req.user.name.split(" ")[0],
  };
}

export function toProviderAdminView(
  p: Provider & { requests?: { id: string }[] },
  now: Date,
): ProviderAdminView {
  const stale = !p.lastSeenAt || now.getTime() - p.lastSeenAt.getTime() > DISPATCH.providerStaleMs;
  return {
    ...toProviderCard(p, { withContact: true }),
    phone: p.phone,
    status: p.status,
    location:
      p.lat != null && p.lng != null && p.lastSeenAt
        ? { lat: p.lat, lng: p.lng, heading: p.heading, updatedAt: p.lastSeenAt.toISOString() }
        : null,
    h3Cell: p.h3Cell,
    isStale: stale,
    accessLink: providerAccessLink(p.accessToken),
    whatsappInvite: whatsappLink(p.phone, providerInviteText(p.name, p.accessToken)),
    activeRequestId: p.requests?.[0]?.id ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
