import type { Provider, User } from "@/generated/prisma/client";
import { prisma } from "./db";
import { ACTIVE, advanceRequest, loadRequest, parseQuote, REQUEST_INCLUDE } from "./dispatch";
import type { ClientSelf, ProviderSelf } from "./types";
import { providerRating, toOfferView, toRequestView } from "./views";

export async function getClientSelf(user: User, now: Date = new Date()): Promise<ClientSelf> {
  const [active, vehicles] = await Promise.all([
    prisma.serviceRequest.findFirst({
      where: { userId: user.id, status: { in: [...ACTIVE] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.vehicle.findMany({ where: { userId: user.id }, orderBy: { label: "asc" } }),
  ]);
  const activeReq = active ? await advanceRequest(active.id, now) : null;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    isMember: user.isMember && (!user.membershipExpiresAt || user.membershipExpiresAt > now),
    membershipExpiresAt: user.membershipExpiresAt?.toISOString() ?? null,
    activeRequest: activeReq ? toRequestView(activeReq, "CLIENT") : null,
    vehicles: vehicles.map((v) => ({ id: v.id, plate: v.plate, label: v.label, kind: v.kind })),
  };
}

function startOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getProviderSelf(provider: Provider, now: Date = new Date()): Promise<ProviderSelf> {
  // Oferta pendiente: si ya expiró, se avanza la cascada y se devuelve null.
  let pendingOffer: ProviderSelf["pendingOffer"] = null;
  const pending = await prisma.dispatchOffer.findFirst({
    where: { providerId: provider.id, response: "PENDING" },
    orderBy: { offeredAt: "desc" },
  });
  if (pending) {
    if (pending.expiresAt <= now) {
      await advanceRequest(pending.requestId, now);
    } else {
      const req = await loadRequest(pending.requestId);
      if (req && req.status === "SEARCHING") pendingOffer = toOfferView(pending, req, provider);
    }
  }

  const activeJob = await prisma.serviceRequest.findFirst({
    where: { providerId: provider.id, status: { in: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } },
    include: REQUEST_INCLUDE,
  });

  const todays = await prisma.serviceRequest.findMany({
    where: { providerId: provider.id, status: "COMPLETED", completedAt: { gte: startOfLocalDay(now) } },
    select: { quoteJson: true },
  });
  const earningsQ = todays.reduce((sum, r) => sum + parseQuote(r).providerPayoutQ, 0);

  return {
    id: provider.id,
    name: provider.name,
    phone: provider.phone,
    kind: provider.kind,
    plate: provider.plate,
    vehicleLabel: provider.vehicleLabel,
    status: provider.status,
    isExternal: provider.isExternal,
    rating: providerRating(provider),
    ratingCount: provider.ratingCount,
    location:
      provider.lat != null && provider.lng != null && provider.lastSeenAt
        ? { lat: provider.lat, lng: provider.lng, heading: provider.heading, updatedAt: provider.lastSeenAt.toISOString() }
        : null,
    pendingOffer,
    activeJob: activeJob ? toRequestView(activeJob, "PROVIDER") : null,
    today: { jobs: todays.length, earningsQ },
  };
}
