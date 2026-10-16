/**
 * Motor de despacho: la parte "Uber" del sistema.
 *
 *   Cliente pide → SEARCHING → oferta al proveedor más cercano (40 s) →
 *   acepta → EN_ROUTE → ARRIVED → (PIN) IN_PROGRESS → COMPLETED
 *                      ↘ rechaza/expira → siguiente más cercano …
 *                        ↘ nadie / tiempo agotado → ESCALATED (alerta al PBX)
 *                                                    ↘ asignación manual → EN_ROUTE
 *
 * Todas las transiciones son idempotentes frente a lecturas concurrentes: los
 * cambios de estado usan `updateMany` con el estado previo como condición y un
 * candado por solicitud dentro del proceso.
 */
import type { Prisma, Provider, ServiceRequest, User } from "@/generated/prisma/client";
import type { CancelledBy, ProviderKind, RequestStatus, ServiceKind } from "@/generated/prisma/enums";
import { DISPATCH, PRICING } from "./config";
import { prisma } from "./db";
import { haversineKm, toH3Cell, type LatLng } from "./geo";
import { getRoute, type Route } from "./routes";
import { newPin } from "./auth";
import { notifyPbxAlert } from "./notifications";
import { quoteFor, type Quote } from "./pricing";
import type { CreateRequestInput } from "./types";

export class DispatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 409,
  ) {
    super(message);
    this.name = "DispatchError";
  }
}

type Tx = Prisma.TransactionClient;

export type RequestWithRelations = Prisma.ServiceRequestGetPayload<{
  include: {
    offers: { include: { provider: true } };
    provider: true;
    user: true;
    alerts: { include: { acknowledgedBy: true } };
    events: true;
    ratings: true;
  };
}>;

export const REQUEST_INCLUDE = {
  offers: { include: { provider: true }, orderBy: { offeredAt: "asc" } },
  provider: true,
  user: true,
  alerts: { include: { acknowledgedBy: true }, orderBy: { createdAt: "asc" } },
  events: { orderBy: { at: "asc" } },
  ratings: true,
} satisfies Prisma.ServiceRequestInclude;

export const ACTIVE: readonly RequestStatus[] = ["SEARCHING", "ESCALATED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

// ---------- Candado por solicitud (un proceso) ----------
// Evita que el ticker y una lectura del cliente avancen la misma cascada a la
// vez. Con varias instancias del servidor hay que mover esto a la BD
// (SELECT … FOR UPDATE en PostgreSQL) — ver docs/ARCHITECTURE.md.

const locks = new Map<string, Promise<unknown>>();

async function withRequestLock<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(requestId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  locks.set(requestId, chained);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(requestId) === chained) locks.delete(requestId);
  }
}

// ---------- Utilidades ----------

export function isActiveMember(user: Pick<User, "isMember" | "membershipExpiresAt">, now: Date): boolean {
  if (!user.isMember) return false;
  return !user.membershipExpiresAt || user.membershipExpiresAt > now;
}

export function providerKindFor(kind: ServiceKind): ProviderKind {
  return kind === "TOW" ? "TOW" : "MOTO";
}

export function parseQuote(req: Pick<ServiceRequest, "quoteJson">): Quote {
  return JSON.parse(req.quoteJson) as Quote;
}

/**
 * Libera a un proveedor al terminar/cancelar su servicio. Los de la red vuelven
 * a ONLINE; los externos (coordinados por el PBX) vuelven a OFFLINE: solo
 * reciben ofertas automáticas si ellos mismos se conectan en su app.
 */
async function releaseProvider(tx: Tx, providerId: string): Promise<void> {
  const p = await tx.provider.findUnique({ where: { id: providerId }, select: { isExternal: true } });
  await tx.provider.updateMany({
    where: { id: providerId, status: "BUSY" },
    data: { status: p?.isExternal ? "OFFLINE" : "ONLINE" },
  });
}

function event(tx: Tx, requestId: string, type: string, data?: Record<string, unknown>, at?: Date) {
  return tx.requestEvent.create({
    data: { requestId, type, data: data ? JSON.stringify(data) : null, at },
  });
}

export async function loadRequest(requestId: string): Promise<RequestWithRelations | null> {
  return prisma.serviceRequest.findUnique({ where: { id: requestId }, include: REQUEST_INCLUDE });
}

async function mustLoad(requestId: string): Promise<RequestWithRelations> {
  const req = await loadRequest(requestId);
  if (!req) throw new DispatchError("REQUEST_NOT_FOUND", "Solicitud no encontrada", 404);
  return req;
}

// ---------- Crear solicitud ----------

export async function createRequest(
  user: User,
  input: CreateRequestInput,
  now: Date = new Date(),
): Promise<RequestWithRelations> {
  const active = await prisma.serviceRequest.findFirst({
    where: { userId: user.id, status: { in: [...ACTIVE] } },
    select: { id: true },
  });
  if (active) {
    throw new DispatchError("ACTIVE_REQUEST_EXISTS", "Ya tienes un servicio en curso", 409);
  }

  const pickup: LatLng = { lat: input.pickup.lat, lng: input.pickup.lng };
  const dropoff: LatLng | null = input.dropoff ? { lat: input.dropoff.lat, lng: input.dropoff.lng } : null;
  if (input.kind === "TOW" && !dropoff) {
    throw new DispatchError("DROPOFF_REQUIRED", "La grúa necesita un destino", 400);
  }
  // La grúa se cobra por la distancia por calles (Mapbox/OSRM; estimación si no hay red).
  const route: Route | null = input.kind === "TOW" && dropoff ? await getRoute(pickup, dropoff, now) : null;
  const distanceKm = route?.distanceKm ?? 0;
  const isMember = isActiveMember(user, now);
  const quote = quoteFor({ kind: input.kind, distanceKm, isMember, at: now });

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.serviceRequest.create({
      data: {
        userId: user.id,
        kind: input.kind,
        status: "SEARCHING",
        vehicleKind: input.vehicleKind,
        vehicleLabel: input.vehicleLabel ?? null,
        plate: input.plate ?? null,
        notes: input.notes ?? null,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: input.pickup.address ?? null,
        dropoffLat: dropoff?.lat ?? null,
        dropoffLng: dropoff?.lng ?? null,
        dropoffAddress: input.dropoff?.address ?? null,
        distanceKm,
        estimatedMinutes: route?.minutes ?? null,
        routeSource: route?.source ?? null,
        routeGeometry: route ? JSON.stringify(route.geometry) : null,
        isMemberAtRequest: isMember,
        quoteJson: JSON.stringify(quote),
        priceTotal: quote.totalQ,
        pin: newPin(),
        searchEpoch: 1,
        searchStartedAt: now,
        searchDeadlineAt: new Date(now.getTime() + DISPATCH.searchTimeoutMs),
        createdAt: now,
      },
    });
    await event(tx, req.id, "CREATED", { kind: input.kind, priceTotal: quote.totalQ, isMember }, now);
    return req;
  });

  return withRequestLock(created.id, () => runSearchStep(created.id, now));
}

// ---------- Búsqueda en cascada ----------

export type Candidate = { provider: Provider; distanceKm: number };

/**
 * Proveedores elegibles para una solicitud, del más cercano al más lejano.
 * Excluye a quien ya rechazó o canceló esta solicitud, a quien ya fue
 * contactado en la búsqueda actual, y a quien tenga otra oferta pendiente.
 */
export async function findCandidates(
  req: RequestWithRelations,
  now: Date = new Date(),
): Promise<Candidate[]> {
  const excluded = new Set<string>();
  for (const o of req.offers) {
    if (o.response === "REJECTED" || o.response === "ACCEPTED" || o.epoch === req.searchEpoch) {
      excluded.add(o.providerId);
    }
  }
  const freshAfter = new Date(now.getTime() - DISPATCH.providerStaleMs);
  const providers = await prisma.provider.findMany({
    where: {
      kind: providerKindFor(req.kind),
      status: "ONLINE",
      lastSeenAt: { gte: freshAfter },
      lat: { not: null },
      lng: { not: null },
      id: { notIn: [...excluded] },
      offers: { none: { response: "PENDING" } },
    },
  });
  const pickup = { lat: req.pickupLat, lng: req.pickupLng };
  return providers
    .map((p) => ({ provider: p, distanceKm: haversineKm(pickup, { lat: p.lat!, lng: p.lng! }) }))
    .filter((c) => c.distanceKm <= DISPATCH.searchRadiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Proveedor ONLINE y con ubicación fresca más cercano (línea recta) a un punto,
 * para mostrar "grúa más cercana a N min" antes de pedir. `null` si no hay nadie.
 */
export async function nearestOnlineProvider(
  kind: ServiceKind,
  point: LatLng,
  now: Date = new Date(),
): Promise<Candidate | null> {
  const freshAfter = new Date(now.getTime() - DISPATCH.providerStaleMs);
  const providers = await prisma.provider.findMany({
    where: { kind: providerKindFor(kind), status: "ONLINE", lastSeenAt: { gte: freshAfter }, lat: { not: null }, lng: { not: null } },
  });
  let best: Candidate | null = null;
  for (const p of providers) {
    const distanceKm = haversineKm(point, { lat: p.lat!, lng: p.lng! });
    if (distanceKm <= DISPATCH.searchRadiusKm && (!best || distanceKm < best.distanceKm)) best = { provider: p, distanceKm };
  }
  return best;
}

/**
 * Un paso de la cascada para una solicitud en SEARCHING sin oferta pendiente:
 * ofrece al siguiente candidato o escala al PBX. Debe llamarse con el candado.
 */
async function runSearchStep(requestId: string, now: Date): Promise<RequestWithRelations> {
  const req = await mustLoad(requestId);
  if (req.status !== "SEARCHING") return req;
  if (req.offers.some((o) => o.response === "PENDING")) return req;

  if (now >= req.searchDeadlineAt) return escalateInternal(req, "SEARCH_TIMEOUT", now);

  const sentThisEpoch = req.offers.filter((o) => o.epoch === req.searchEpoch).length;
  if (sentThisEpoch >= DISPATCH.maxOffersPerEpoch) return escalateInternal(req, "MAX_OFFERS_REACHED", now);

  const candidates = await findCandidates(req, now);
  if (candidates.length === 0) {
    return escalateInternal(req, sentThisEpoch === 0 ? "NO_PROVIDERS_AVAILABLE" : "NO_MORE_CANDIDATES", now);
  }

  const best = candidates[0];
  const round = sentThisEpoch + 1;
  await prisma.$transaction(async (tx) => {
    const offer = await tx.dispatchOffer.create({
      data: {
        requestId: req.id,
        providerId: best.provider.id,
        epoch: req.searchEpoch,
        round,
        distanceKm: Math.round(best.distanceKm * 100) / 100,
        offeredAt: now,
        expiresAt: new Date(now.getTime() + DISPATCH.offerTtlMs),
      },
    });
    await event(
      tx,
      req.id,
      "OFFER_SENT",
      { offerId: offer.id, providerId: best.provider.id, providerName: best.provider.name, round, distanceKm: offer.distanceKm },
      now,
    );
  });
  return mustLoad(req.id);
}

/**
 * Avanza la cascada si la oferta pendiente expiró. Se llama en cada lectura
 * del estado (avance perezoso) y desde el ticker del servidor.
 */
export async function advanceRequest(requestId: string, now: Date = new Date()): Promise<RequestWithRelations | null> {
  return withRequestLock(requestId, async () => {
    const req = await loadRequest(requestId);
    if (!req) return null;
    if (req.status !== "SEARCHING") return req;

    const pending = req.offers.find((o) => o.response === "PENDING");
    if (pending) {
      if (pending.expiresAt > now) return req;
      await prisma.$transaction(async (tx) => {
        const r = await tx.dispatchOffer.updateMany({
          where: { id: pending.id, response: "PENDING" },
          data: { response: "EXPIRED", respondedAt: now },
        });
        if (r.count === 1) {
          await event(tx, req.id, "OFFER_EXPIRED", { offerId: pending.id, providerId: pending.providerId, round: pending.round }, now);
        }
      });
    }
    return runSearchStep(requestId, now);
  });
}

/** Ticker: avanza todas las búsquedas y limpia proveedores sin señal. */
export async function advanceAll(now: Date = new Date()): Promise<{ advanced: number; offlined: number }> {
  const searching = await prisma.serviceRequest.findMany({
    where: { status: "SEARCHING" },
    select: { id: true },
  });
  for (const { id } of searching) {
    try {
      await advanceRequest(id, now);
    } catch (err) {
      console.error("advanceRequest failed", id, err);
    }
  }
  const offlined = await prisma.provider.updateMany({
    where: {
      status: "ONLINE",
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - DISPATCH.providerOfflineAfterMs) } }],
    },
    data: { status: "OFFLINE" },
  });
  // Historial de ubicación: 24 h bastan para auditar un servicio.
  await prisma.locationPing.deleteMany({ where: { at: { lt: new Date(now.getTime() - 24 * 3600_000) } } });
  return { advanced: searching.length, offlined: offlined.count };
}

// ---------- Escalamiento al PBX ----------

async function escalateInternal(
  req: RequestWithRelations,
  reason: string,
  now: Date,
): Promise<RequestWithRelations> {
  const alertId = await prisma.$transaction(async (tx) => {
    const r = await tx.serviceRequest.updateMany({
      where: { id: req.id, status: "SEARCHING" },
      data: { status: "ESCALATED", escalatedAt: now, escalationReason: reason },
    });
    if (r.count !== 1) return null;
    await tx.dispatchOffer.updateMany({
      where: { requestId: req.id, response: "PENDING" },
      data: { response: "WITHDRAWN", respondedAt: now },
    });
    const open = await tx.escalationAlert.findFirst({ where: { requestId: req.id, resolvedAt: null } });
    const alert = open ?? (await tx.escalationAlert.create({ data: { requestId: req.id, reason, createdAt: now } }));
    await event(tx, req.id, "ESCALATED", { reason, alertId: alert.id }, now);
    return alert.id;
  });
  const fresh = await mustLoad(req.id);
  if (alertId) {
    notifyPbxAlert({
      alertId,
      requestId: fresh.id,
      reason,
      kind: fresh.kind,
      pickupAddress: fresh.pickupAddress,
      pickup: { lat: fresh.pickupLat, lng: fresh.pickupLng },
      clientName: fresh.user.name,
      clientPhone: fresh.user.phone,
      priceTotal: fresh.priceTotal,
    });
  }
  return fresh;
}

/**
 * "Hablar con un operador": si aún se busca proveedor, escala la solicitud; si
 * ya hay proveedor, abre una alerta sin cambiar el estado.
 */
export async function requestOperatorHelp(requestId: string, now: Date = new Date()): Promise<RequestWithRelations> {
  return withRequestLock(requestId, async () => {
    const req = await mustLoad(requestId);
    if (req.status === "SEARCHING") return escalateInternal(req, "CLIENT_REQUESTED_OPERATOR", now);
    if (!ACTIVE.includes(req.status)) {
      throw new DispatchError("REQUEST_NOT_ACTIVE", "El servicio ya terminó", 409);
    }
    const open = req.alerts.find((a) => !a.resolvedAt);
    if (open) return req;
    const alert = await prisma.$transaction(async (tx) => {
      const a = await tx.escalationAlert.create({ data: { requestId: req.id, reason: "CLIENT_NEEDS_HELP", createdAt: now } });
      await event(tx, req.id, "HELP_REQUESTED", { alertId: a.id }, now);
      return a;
    });
    notifyPbxAlert({
      alertId: alert.id,
      requestId: req.id,
      reason: "CLIENT_NEEDS_HELP",
      kind: req.kind,
      pickupAddress: req.pickupAddress,
      pickup: { lat: req.pickupLat, lng: req.pickupLng },
      clientName: req.user.name,
      clientPhone: req.user.phone,
      priceTotal: req.priceTotal,
    });
    return mustLoad(req.id);
  });
}

// ---------- Respuesta del proveedor a una oferta ----------

export async function acceptOffer(offerId: string, providerId: string, now: Date = new Date()): Promise<RequestWithRelations> {
  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.providerId !== providerId) {
    throw new DispatchError("OFFER_NOT_FOUND", "Oferta no encontrada", 404);
  }
  return withRequestLock(offer.requestId, async () => {
    // Un proveedor con servicio activo (p. ej. asignado a mano por el PBX hace
    // un instante) no puede tomar otro: la oferta se retira y la cascada sigue.
    const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { status: true } });
    if (provider?.status === "BUSY") {
      await prisma.dispatchOffer.updateMany({
        where: { id: offerId, response: "PENDING" },
        data: { response: "WITHDRAWN", respondedAt: now },
      });
      await runSearchStep(offer.requestId, now);
      throw new DispatchError("OFFER_UNAVAILABLE", "Ya tienes un servicio activo; la oferta se liberó", 409);
    }
    await prisma.$transaction(async (tx) => {
      const o = await tx.dispatchOffer.updateMany({
        where: { id: offerId, providerId, response: "PENDING", expiresAt: { gt: now } },
        data: { response: "ACCEPTED", respondedAt: now },
      });
      if (o.count !== 1) {
        throw new DispatchError("OFFER_UNAVAILABLE", "La oferta expiró o ya fue tomada", 409);
      }
      const r = await tx.serviceRequest.updateMany({
        where: { id: offer.requestId, status: "SEARCHING" },
        data: { status: "EN_ROUTE", providerId, assignedBy: "AUTO", assignedAt: now },
      });
      if (r.count !== 1) {
        throw new DispatchError("REQUEST_NOT_SEARCHING", "La solicitud ya no está disponible", 409);
      }
      await tx.provider.update({ where: { id: providerId }, data: { status: "BUSY" } });
      await tx.escalationAlert.updateMany({ where: { requestId: offer.requestId, resolvedAt: null }, data: { resolvedAt: now } });
      await event(tx, offer.requestId, "ASSIGNED", { providerId, by: "AUTO", offerId, round: offer.round }, now);
    });
    return mustLoad(offer.requestId);
  });
}

export async function rejectOffer(offerId: string, providerId: string, now: Date = new Date()): Promise<RequestWithRelations> {
  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.providerId !== providerId) {
    throw new DispatchError("OFFER_NOT_FOUND", "Oferta no encontrada", 404);
  }
  return withRequestLock(offer.requestId, async () => {
    await prisma.$transaction(async (tx) => {
      const r = await tx.dispatchOffer.updateMany({
        where: { id: offerId, providerId, response: "PENDING" },
        data: { response: "REJECTED", respondedAt: now },
      });
      if (r.count === 1) {
        await event(tx, offer.requestId, "OFFER_REJECTED", { offerId, providerId, round: offer.round }, now);
      }
    });
    // Sin esperar al ticker: se ofrece de inmediato al siguiente.
    return runSearchStep(offer.requestId, now);
  });
}

// ---------- PBX: asignación manual y reintento ----------

export async function assignProvider(
  requestId: string,
  providerId: string,
  operatorId: string,
  now: Date = new Date(),
): Promise<RequestWithRelations> {
  return withRequestLock(requestId, async () => {
    const req = await mustLoad(requestId);
    if (req.status !== "SEARCHING" && req.status !== "ESCALATED") {
      throw new DispatchError("INVALID_STATE", `No se puede asignar en estado ${req.status}`, 409);
    }
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new DispatchError("PROVIDER_NOT_FOUND", "Proveedor no encontrado", 404);
    if (provider.kind !== providerKindFor(req.kind)) {
      throw new DispatchError("PROVIDER_KIND_MISMATCH", "El proveedor no atiende este tipo de servicio", 409);
    }
    if (provider.status === "BUSY") {
      throw new DispatchError("PROVIDER_BUSY", "El proveedor ya tiene un servicio activo", 409);
    }
    const displaced = await prisma.$transaction(async (tx) => {
      const r = await tx.serviceRequest.updateMany({
        where: { id: req.id, status: { in: ["SEARCHING", "ESCALATED"] } },
        data: { status: "EN_ROUTE", providerId, assignedBy: "PBX", assignedAt: now },
      });
      if (r.count !== 1) throw new DispatchError("INVALID_STATE", "La solicitud cambió de estado", 409);
      await tx.dispatchOffer.updateMany({
        where: { requestId: req.id, response: "PENDING" },
        data: { response: "WITHDRAWN", respondedAt: now },
      });
      // Si el proveedor tenía una oferta pendiente en OTRA solicitud, se retira
      // para que no pueda quedar con dos servicios; esa búsqueda sigue con el siguiente.
      const others = await tx.dispatchOffer.findMany({
        where: { providerId, response: "PENDING", requestId: { not: req.id } },
        select: { id: true, requestId: true },
      });
      if (others.length) {
        await tx.dispatchOffer.updateMany({
          where: { id: { in: others.map((o) => o.id) } },
          data: { response: "WITHDRAWN", respondedAt: now },
        });
      }
      await tx.provider.update({ where: { id: providerId }, data: { status: "BUSY" } });
      await tx.escalationAlert.updateMany({
        where: { requestId: req.id, resolvedAt: null },
        data: { resolvedAt: now, acknowledgedAt: now, acknowledgedById: operatorId },
      });
      await event(tx, req.id, "ASSIGNED", { providerId, by: "PBX", operatorId, external: provider.isExternal }, now);
      return [...new Set(others.map((o) => o.requestId))];
    });
    for (const otherId of displaced) {
      // Otra solicitud, otro candado: no hay bloqueo cruzado.
      await withRequestLock(otherId, () => runSearchStep(otherId, now)).catch((err) =>
        console.error("runSearchStep after manual assignment failed", otherId, err),
      );
    }
    return mustLoad(req.id);
  });
}

export async function retrySearch(requestId: string, operatorId: string, now: Date = new Date()): Promise<RequestWithRelations> {
  return withRequestLock(requestId, async () => {
    const req = await mustLoad(requestId);
    if (req.status !== "ESCALATED") {
      throw new DispatchError("INVALID_STATE", "Solo se reintenta una solicitud escalada", 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.serviceRequest.update({
        where: { id: req.id },
        data: {
          status: "SEARCHING",
          searchEpoch: { increment: 1 },
          searchStartedAt: now,
          searchDeadlineAt: new Date(now.getTime() + DISPATCH.searchTimeoutMs),
        },
      });
      await event(tx, req.id, "SEARCH_RESTARTED", { operatorId, epoch: req.searchEpoch + 1 }, now);
    });
    return runSearchStep(req.id, now);
  });
}

export async function acknowledgeAlert(alertId: string, operatorId: string, now: Date = new Date()): Promise<void> {
  await prisma.escalationAlert.updateMany({
    where: { id: alertId, acknowledgedAt: null },
    data: { acknowledgedAt: now, acknowledgedById: operatorId },
  });
}

// ---------- Progreso del servicio ----------

export async function providerTransition(
  requestId: string,
  providerId: string,
  to: "ARRIVED" | "IN_PROGRESS" | "COMPLETED",
  pin: string | undefined,
  now: Date = new Date(),
): Promise<RequestWithRelations> {
  return withRequestLock(requestId, async () => {
    const req = await mustLoad(requestId);
    if (req.providerId !== providerId) {
      throw new DispatchError("NOT_YOUR_JOB", "Este servicio no está asignado a ti", 403);
    }
    const allowed: Record<typeof to, RequestStatus> = {
      ARRIVED: "EN_ROUTE",
      IN_PROGRESS: "ARRIVED",
      COMPLETED: "IN_PROGRESS",
    };
    if (req.status !== allowed[to]) {
      throw new DispatchError("INVALID_TRANSITION", `No se puede pasar de ${req.status} a ${to}`, 409);
    }
    if (to === "IN_PROGRESS") {
      if (!pin) throw new DispatchError("PIN_REQUIRED", "Pide el PIN de 4 dígitos al cliente", 400);
      if (pin !== req.pin) throw new DispatchError("INVALID_PIN", "PIN incorrecto", 400);
    }
    await prisma.$transaction(async (tx) => {
      const data: Prisma.ServiceRequestUpdateManyMutationInput = { status: to };
      if (to === "ARRIVED") data.arrivedAt = now;
      if (to === "IN_PROGRESS") data.startedAt = now;
      if (to === "COMPLETED") data.completedAt = now;
      const r = await tx.serviceRequest.updateMany({ where: { id: req.id, status: allowed[to] }, data });
      if (r.count !== 1) throw new DispatchError("INVALID_TRANSITION", "La solicitud cambió de estado", 409);
      if (to === "COMPLETED") {
        await releaseProvider(tx, providerId);
        await tx.escalationAlert.updateMany({ where: { requestId: req.id, resolvedAt: null }, data: { resolvedAt: now } });
      }
      await event(tx, req.id, to, { providerId }, now);
    });
    return mustLoad(req.id);
  });
}

// ---------- Cancelaciones ----------

export async function cancelRequest(
  requestId: string,
  by: CancelledBy,
  reason: string | undefined,
  now: Date = new Date(),
  actor?: { userId?: string; operatorId?: string },
): Promise<RequestWithRelations> {
  return withRequestLock(requestId, async () => {
    const req = await mustLoad(requestId);
    if (by === "CLIENT" && actor?.userId && req.userId !== actor.userId) {
      throw new DispatchError("FORBIDDEN", "No es tu solicitud", 403);
    }
    const cancellable: RequestStatus[] =
      by === "PBX"
        ? ["SEARCHING", "ESCALATED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"]
        : ["SEARCHING", "ESCALATED", "EN_ROUTE", "ARRIVED"];
    if (!cancellable.includes(req.status)) {
      throw new DispatchError("NOT_CANCELLABLE", `No se puede cancelar en estado ${req.status}`, 409);
    }
    const fee = by === "CLIENT" && (req.status === "EN_ROUTE" || req.status === "ARRIVED") ? PRICING.cancellationFeeQ : 0;
    await prisma.$transaction(async (tx) => {
      const r = await tx.serviceRequest.updateMany({
        where: { id: req.id, status: { in: cancellable } },
        data: { status: "CANCELLED", cancelledAt: now, cancelledBy: by, cancelReason: reason ?? null, cancellationFee: fee },
      });
      if (r.count !== 1) throw new DispatchError("NOT_CANCELLABLE", "La solicitud cambió de estado", 409);
      await tx.dispatchOffer.updateMany({
        where: { requestId: req.id, response: "PENDING" },
        data: { response: "WITHDRAWN", respondedAt: now },
      });
      if (req.providerId) await releaseProvider(tx, req.providerId);
      await tx.escalationAlert.updateMany({ where: { requestId: req.id, resolvedAt: null }, data: { resolvedAt: now } });
      await event(tx, req.id, "CANCELLED", { by, reason: reason ?? null, feeQ: fee, ...actor }, now);
    });
    return mustLoad(req.id);
  });
}

/**
 * El proveedor asignado se baja del servicio: la solicitud vuelve a buscarse
 * de inmediato (sin contarlo a él) y, si nadie más puede, se escala al PBX.
 */
export async function providerBailout(
  requestId: string,
  providerId: string,
  reason: string | undefined,
  now: Date = new Date(),
): Promise<RequestWithRelations> {
  return withRequestLock(requestId, async () => {
    const req = await mustLoad(requestId);
    if (req.providerId !== providerId) {
      throw new DispatchError("NOT_YOUR_JOB", "Este servicio no está asignado a ti", 403);
    }
    if (req.status !== "EN_ROUTE" && req.status !== "ARRIVED") {
      throw new DispatchError("INVALID_STATE", `No se puede cancelar en estado ${req.status}`, 409);
    }
    await prisma.$transaction(async (tx) => {
      const r = await tx.serviceRequest.updateMany({
        where: { id: req.id, status: { in: ["EN_ROUTE", "ARRIVED"] } },
        data: {
          status: "SEARCHING",
          providerId: null,
          assignedBy: null,
          assignedAt: null,
          arrivedAt: null,
          searchEpoch: { increment: 1 },
          searchStartedAt: now,
          searchDeadlineAt: new Date(now.getTime() + DISPATCH.searchTimeoutMs),
        },
      });
      if (r.count !== 1) throw new DispatchError("INVALID_STATE", "La solicitud cambió de estado", 409);
      await releaseProvider(tx, providerId);
      // Un rechazo explícito deja fuera a este proveedor de las siguientes rondas.
      await tx.dispatchOffer.create({
        data: {
          requestId: req.id,
          providerId,
          epoch: req.searchEpoch,
          round: 0,
          distanceKm: 0,
          offeredAt: now,
          expiresAt: now,
          response: "REJECTED",
          respondedAt: now,
        },
      });
      await event(tx, req.id, "PROVIDER_CANCELLED", { providerId, reason: reason ?? null }, now);
    });
    const fresh = await runSearchStep(req.id, now);
    if (fresh.status === "ESCALATED") return fresh;
    // Aunque se haya reofrecido, el PBX debe saber que el gruero se bajó.
    const open = fresh.alerts.find((a) => !a.resolvedAt);
    if (!open) {
      const alert = await prisma.escalationAlert.create({ data: { requestId: req.id, reason: "PROVIDER_BAILED", createdAt: now } });
      notifyPbxAlert({
        alertId: alert.id,
        requestId: req.id,
        reason: "PROVIDER_BAILED",
        kind: req.kind,
        pickupAddress: req.pickupAddress,
        pickup: { lat: req.pickupLat, lng: req.pickupLng },
        clientName: req.user.name,
        clientPhone: req.user.phone,
        priceTotal: req.priceTotal,
      });
    }
    return mustLoad(req.id);
  });
}

// ---------- Proveedor: estado y ubicación ----------

export async function setProviderStatus(providerId: string, status: "ONLINE" | "OFFLINE", now: Date = new Date()): Promise<Provider> {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider) throw new DispatchError("PROVIDER_NOT_FOUND", "Proveedor no encontrado", 404);
  if (provider.status === "BUSY") {
    throw new DispatchError("PROVIDER_BUSY", "Termina tu servicio activo antes de cambiar de estado", 409);
  }
  if (status === "OFFLINE") {
    // Si tenía una oferta pendiente, la suelta para que siga la cascada.
    const pending = await prisma.dispatchOffer.findMany({ where: { providerId, response: "PENDING" } });
    for (const o of pending) {
      try {
        await rejectOffer(o.id, providerId, now);
      } catch (err) {
        console.error("rejectOffer on offline failed", o.id, err);
      }
    }
  }
  return prisma.provider.update({
    where: { id: providerId },
    data: { status, lastSeenAt: status === "ONLINE" ? now : provider.lastSeenAt },
  });
}

export async function recordProviderLocation(
  providerId: string,
  loc: { lat: number; lng: number; heading?: number },
  now: Date = new Date(),
): Promise<Provider> {
  const [provider] = await prisma.$transaction([
    prisma.provider.update({
      where: { id: providerId },
      data: {
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading ?? null,
        h3Cell: toH3Cell(loc),
        lastSeenAt: now,
      },
    }),
    prisma.locationPing.create({ data: { providerId, lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, at: now } }),
  ]);
  return provider;
}

// ---------- Calificaciones ----------

export async function rateRequest(
  requestId: string,
  byRole: "CLIENT" | "PROVIDER",
  stars: number,
  comment: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  const req = await mustLoad(requestId);
  if (req.status !== "COMPLETED") throw new DispatchError("NOT_COMPLETED", "Solo se califica un servicio completado", 409);
  await prisma.$transaction(async (tx) => {
    await tx.rating.upsert({
      where: { requestId_byRole: { requestId, byRole } },
      create: { requestId, byRole, stars, comment: comment ?? null, createdAt: now },
      update: { stars, comment: comment ?? null },
    });
    if (byRole === "CLIENT" && req.providerId) {
      // Recalcular desde las calificaciones para que un cambio no duplique.
      const agg = await tx.rating.aggregate({
        where: { byRole: "CLIENT", request: { providerId: req.providerId } },
        _sum: { stars: true },
        _count: { stars: true },
      });
      await tx.provider.update({
        where: { id: req.providerId },
        data: { ratingSum: agg._sum.stars ?? 0, ratingCount: agg._count.stars },
      });
    }
    await event(tx, requestId, "RATED", { byRole, stars }, now);
  });
}
