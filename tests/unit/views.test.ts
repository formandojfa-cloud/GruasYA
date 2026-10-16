/**
 * Proyección por rol: qué ve el cliente, el gruero, el PBX y el enlace público
 * de seguimiento. El PIN solo lo ven cliente y PBX; los teléfonos solo
 * durante el servicio; los eventos internos solo el PBX.
 */
import { describe, expect, it } from "vitest";
import { DISPATCH } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  acceptOffer,
  acknowledgeAlert,
  advanceRequest,
  assignProvider,
  cancelRequest,
  createRequest,
  loadRequest,
  providerBailout,
  providerTransition,
  rateRequest,
  recordProviderLocation,
  rejectOffer,
  type RequestWithRelations,
} from "@/lib/dispatch";
import { etaMinutes, roadDistanceKm } from "@/lib/geo";
import { liveLocationFor, providerRating, toOfferView, toProviderAdminView, toRequestView, type ViewerRole } from "@/lib/views";
import {
  at,
  createOperator,
  createProvider,
  createProvidersAtKm,
  createUser,
  minutes,
  mustPending,
  northOf,
  T0,
  towInput,
  setupDispatchFixture,
  ZONA_10,
  ZONA_11,
} from "./helpers";

setupDispatchFixture();

const ROLES: ViewerRole[] = ["CLIENT", "PROVIDER", "PBX", "SHARE"];

async function reload(id: string): Promise<RequestWithRelations> {
  const req = await loadRequest(id);
  if (!req) throw new Error("solicitud no encontrada");
  return req;
}

/** Ana pide; la grúa a 1 km acepta y manda su ubicación (EN_ROUTE). */
async function enRoute() {
  const user = await createUser({ name: "Ana López" });
  const [provider] = await createProvidersAtKm([1]);
  const created = await createRequest(user, towInput(), T0);
  await acceptOffer(mustPending(created).id, provider.id, at(5));
  await recordProviderLocation(provider.id, { ...northOf(ZONA_10, 1), heading: 90 }, at(10));
  return { user, provider, req: await reload(created.id) };
}

describe("views.toRequestView — PIN y teléfonos por rol", () => {
  it("CLIENT: ve su PIN; el teléfono y WhatsApp de la grúa solo mientras el servicio está activo", async () => {
    const { provider, req } = await enRoute();
    const live = toRequestView(req, "CLIENT");
    expect(live.pin).toBe(req.pin);
    expect(live.client).toBeUndefined();
    expect(live.provider?.id).toBe(provider.id);
    expect(live.provider?.phone).toBe(provider.phone);
    expect(live.provider?.whatsapp).toBe(`https://wa.me/502${provider.phone}`);
    expect(live.assignedBy).toBe("AUTO");

    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));
    const inProgress = toRequestView(await reload(req.id), "CLIENT");
    expect(inProgress.provider?.phone).toBe(provider.phone);

    await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(80));
    const done = toRequestView(await reload(req.id), "CLIENT");
    expect(done.status).toBe("COMPLETED");
    expect(done.pin).toBe(req.pin);
    expect(done.provider?.name).toBe(provider.name); // la tarjeta queda para el historial…
    expect(done.provider?.phone).toBeUndefined(); // …pero sin contacto
    expect(done.provider?.whatsapp).toBeUndefined();
    expect(done.providerLive).toBeNull();
  });

  it("CLIENT mientras busca: sin grúa, con la oferta en curso (sin providerId) y el PIN ya disponible", async () => {
    const user = await createUser();
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(user, towInput(), T0);
    const v = toRequestView(req, "CLIENT");
    expect(v.status).toBe("SEARCHING");
    expect(v.pin).toMatch(/^\d{4}$/);
    expect(v.provider).toBeNull();
    expect(v.providerLive).toBeNull();
    expect(v.search.epoch).toBe(1);
    expect(v.search.offersSent).toBe(1);
    expect(v.search.maxOffers).toBe(DISPATCH.maxOffersPerEpoch);
    expect(v.search.startedAt).toBe(T0.toISOString());
    expect(v.search.deadlineAt).toBe(at(minutes(2)).toISOString());
    expect(v.search.currentOffer).toEqual({
      id: mustPending(req).id,
      round: 1,
      expiresAt: at(40).toISOString(),
      providerName: a.name,
    });
    expect(v.search.currentOffer).not.toHaveProperty("providerId");
    expect(v.escalation).toBeNull();
  });

  it("PROVIDER: nunca ve el PIN; ve el nombre de pila y teléfono del cliente solo mientras el servicio está activo", async () => {
    const { user, provider, req } = await enRoute();
    const live = toRequestView(req, "PROVIDER");
    expect(live.pin).toBeUndefined();
    expect(live).not.toHaveProperty("pin");
    expect(live.client).toEqual({ id: user.id, name: "Ana", phone: user.phone, whatsapp: `https://wa.me/502${user.phone}` });
    expect(live.provider?.phone).toBeUndefined(); // su propia tarjeta tampoco expone contacto

    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    expect(toRequestView(await reload(req.id), "PROVIDER").client?.phone).toBe(user.phone);

    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));
    await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(80));
    const done = toRequestView(await reload(req.id), "PROVIDER");
    expect(done.pin).toBeUndefined();
    expect(done.client).toBeUndefined();
  });

  it("PROVIDER mientras busca (oferta pendiente) no ve datos del cliente", async () => {
    await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const v = toRequestView(req, "PROVIDER");
    expect(v.client).toBeUndefined();
    expect(v.pin).toBeUndefined();
  });

  it("SHARE (enlace público): sin PIN, sin cliente, sin teléfonos, sin ids internos", async () => {
    const { provider, req } = await enRoute();
    const v = toRequestView(req, "SHARE");
    expect(v.pin).toBeUndefined();
    expect(v.client).toBeUndefined();
    expect(v.provider?.name).toBe(provider.name);
    expect(v.provider?.phone).toBeUndefined();
    expect(v.provider?.whatsapp).toBeUndefined();
    expect(v.providerLive?.target).toBe("PICKUP"); // sí puede seguir la grúa en el mapa
    expect(JSON.stringify(v)).not.toContain(provider.phone);
    expect(JSON.stringify(v)).not.toContain(req.pin);

    // Otra grúa libre para que la segunda solicitud tenga oferta en curso.
    await createProvidersAtKm([2]);
    const searching = await createRequest(await createUser(), towInput(), at(100));
    const s = toRequestView(searching, "SHARE");
    expect(s.status).toBe("SEARCHING");
    expect(s.search.currentOffer).not.toBeNull();
    expect(s.search.currentOffer).not.toHaveProperty("providerId");
  });

  it("PBX: ve todo — PIN, cliente completo, teléfono de la grúa y providerId de la oferta en curso", async () => {
    const { user, provider, req } = await enRoute();
    const v = toRequestView(req, "PBX");
    expect(v.pin).toBe(req.pin);
    expect(v.client).toEqual({ id: user.id, name: "Ana López", phone: user.phone, whatsapp: `https://wa.me/502${user.phone}` });
    expect(v.provider?.phone).toBe(provider.phone);

    const [b] = await createProvidersAtKm([2]);
    const searching = await createRequest(await createUser(), towInput(), at(100));
    const s = toRequestView(searching, "PBX");
    expect(s.search.currentOffer?.providerId).toBe(b.id);

    // Incluso terminado, el PBX conserva los contactos.
    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));
    await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(80));
    const done = toRequestView(await reload(req.id), "PBX");
    expect(done.client?.phone).toBe(user.phone);
    expect(done.provider?.phone).toBe(provider.phone);
  });
});

describe("views.toRequestView — eventos", () => {
  it("los rechazos y expiraciones de ofertas solo los ve el PBX; los demás no reciben ids internos", async () => {
    const [a, , c] = await createProvidersAtKm([1, 2, 3]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await rejectOffer(mustPending(req).id, a.id, at(5)); // a rechaza → b
    await advanceRequest(req.id, at(45)); // b deja vencer → c
    const s3 = await reload(req.id);
    await acceptOffer(mustPending(s3).id, c.id, at(50));
    const full = await reload(req.id);

    const pbx = toRequestView(full, "PBX");
    expect(pbx.events.map((e) => e.type)).toEqual([
      "CREATED",
      "OFFER_SENT",
      "OFFER_REJECTED",
      "OFFER_SENT",
      "OFFER_EXPIRED",
      "OFFER_SENT",
      "ASSIGNED",
    ]);
    const pbxAssigned = pbx.events.find((e) => e.type === "ASSIGNED")!;
    expect(pbxAssigned.data).toMatchObject({ providerId: c.id, by: "AUTO", round: 3 });
    expect(pbxAssigned.data).toHaveProperty("offerId");

    for (const role of ["CLIENT", "PROVIDER", "SHARE"] as const) {
      const v = toRequestView(full, role);
      const types = v.events.map((e) => e.type);
      expect(types).toEqual(["CREATED", "OFFER_SENT", "OFFER_SENT", "OFFER_SENT", "ASSIGNED"]);
      for (const e of v.events) {
        expect(e.data ?? {}).not.toHaveProperty("providerId");
        expect(e.data ?? {}).not.toHaveProperty("offerId");
        expect(e.data ?? {}).not.toHaveProperty("operatorId");
        expect(typeof e.at).toBe("string");
        expect(new Date(e.at).toISOString()).toBe(e.at);
      }
      const sent = v.events.filter((e) => e.type === "OFFER_SENT");
      expect(sent[0].data).toMatchObject({ round: 1, providerName: a.name });
      expect(sent[2].data).toMatchObject({ round: 3, providerName: c.name });
      expect(v.events.find((e) => e.type === "ASSIGNED")!.data).toEqual({ by: "AUTO", round: 3 });
    }
  });

  it("el evento CREATED sin ids internos llega igual a todos los roles", async () => {
    const req = await createRequest(await createUser({ isMember: false }), towInput(), T0);
    for (const role of ROLES) {
      const created = toRequestView(req, role).events.find((e) => e.type === "CREATED")!;
      expect(created.data).toEqual({ kind: "TOW", priceTotal: 485, isMember: false });
      expect(created.at).toBe(T0.toISOString());
    }
  });
});

describe("views.toRequestView — escalación, cancelación, calificaciones, búsqueda", () => {
  it("escalation refleja la alerta abierta y, tras el reconocimiento, el nombre del operador", async () => {
    const operator = await createOperator("Marta");
    const req = await createRequest(await createUser(), towInput(), T0);
    const v = toRequestView(req, "CLIENT");
    expect(v.status).toBe("ESCALATED");
    expect(v.escalation).toEqual({
      at: T0.toISOString(),
      reason: "NO_PROVIDERS_AVAILABLE",
      alertId: req.alerts[0].id,
      acknowledgedAt: null,
      acknowledgedBy: null,
    });
    await acknowledgeAlert(req.alerts[0].id, operator.id, at(30));
    const acked = toRequestView(await reload(req.id), "PBX");
    expect(acked.escalation?.acknowledgedAt).toBe(at(30).toISOString());
    expect(acked.escalation?.acknowledgedBy).toBe("Marta");

    // Tras asignar, la alerta resuelta sigue siendo la referencia histórica.
    const p = await createProvider({ status: "OFFLINE", at: null, lastSeenAt: null });
    await assignProvider(req.id, p.id, operator.id, at(60));
    const assigned = toRequestView(await reload(req.id), "CLIENT");
    expect(assigned.status).toBe("EN_ROUTE");
    expect(assigned.assignedBy).toBe("PBX");
    expect(assigned.escalation?.reason).toBe("NO_PROVIDERS_AVAILABLE");
    expect(assigned.escalation?.acknowledgedBy).toBe("Marta");
    expect(assigned.timestamps.assignedAt).toBe(at(60).toISOString());
    // El cliente no nota si la grúa vino del PBX: la tarjeta es la misma.
    expect(assigned.provider?.phone).toBe(p.phone);
  });

  it("cancellation trae quién canceló, el motivo y el cargo", async () => {
    const { user, req } = await enRoute();
    await cancelRequest(req.id, "CLIENT", "Ya no la necesito", at(60), { userId: user.id });
    const v = toRequestView(await reload(req.id), "CLIENT");
    expect(v.status).toBe("CANCELLED");
    expect(v.cancellation).toEqual({ by: "CLIENT", reason: "Ya no la necesito", feeQ: 50 });
    expect(v.timestamps.cancelledAt).toBe(at(60).toISOString());
    expect(v.provider?.phone).toBeUndefined();
    expect(v.providerLive).toBeNull();
  });

  it("ratings separa la del cliente y la del gruero", async () => {
    const { provider, req } = await enRoute();
    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));
    await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(80));
    expect(toRequestView(await reload(req.id), "CLIENT").ratings).toEqual({ client: null, provider: null });
    await rateRequest(req.id, "CLIENT", 5, undefined, at(90));
    await rateRequest(req.id, "PROVIDER", 4, undefined, at(91));
    const v = toRequestView(await reload(req.id), "CLIENT");
    expect(v.ratings).toEqual({ client: 5, provider: 4 });
    expect(v.timestamps).toEqual({
      createdAt: T0.toISOString(),
      assignedAt: at(5).toISOString(),
      arrivedAt: at(60).toISOString(),
      startedAt: at(70).toISOString(),
      completedAt: at(80).toISOString(),
      cancelledAt: null,
    });
  });

  it("search.offersSent cuenta solo la búsqueda actual y no la marca del gruero que se bajó", async () => {
    const { provider, req } = await enRoute();
    await createProvidersAtKm([3]);
    await providerBailout(req.id, provider.id, undefined, at(60));
    const v = toRequestView(await reload(req.id), "CLIENT");
    expect(v.status).toBe("SEARCHING");
    expect(v.search.epoch).toBe(2);
    expect(v.search.offersSent).toBe(1);
    expect(v.search.currentOffer?.round).toBe(1);
    expect(v.provider).toBeNull();
    expect(v.escalation?.reason).toBe("PROVIDER_BAILED");
    expect(v.events.map((e) => e.type)).toContain("PROVIDER_CANCELLED");
  });

  it("la cotización, el precio y los lugares se copian tal cual", async () => {
    const req = await createRequest(await createUser(), towInput({ notes: "Frente a la gasolinera" }), T0);
    const v = toRequestView(req, "CLIENT");
    expect(v.quote.totalQ).toBe(435);
    expect(v.priceTotal).toBe(435);
    expect(v.isMember).toBe(true);
    expect(v.distanceKm).toBe(7.35);
    expect(v.pickup).toEqual({ lat: ZONA_10.lat, lng: ZONA_10.lng, address: "Zona 10" });
    expect(v.dropoff).toEqual({ lat: ZONA_11.lat, lng: ZONA_11.lng, address: "Taller zona 11" });
    expect(v.notes).toBe("Frente a la gasolinera");
    expect(v.vehicleLabel).toBe("Corolla gris");
    expect(v.plate).toBe("P123ABC");
    expect(v.updatedAt).toBe(req.updatedAt.toISOString());
  });
});

describe("views.liveLocationFor", () => {
  it("apunta a la recogida en camino y al destino durante el remolque; nada sin servicio activo o sin ubicación", async () => {
    const { provider, req } = await enRoute();
    const live = liveLocationFor(req)!;
    const here = northOf(ZONA_10, 1);
    expect(live.target).toBe("PICKUP");
    expect(live.lat).toBeCloseTo(here.lat, 10);
    expect(live.heading).toBe(90);
    expect(live.updatedAt).toBe(at(10).toISOString());
    expect(live.distanceKm).toBe(roadDistanceKm(here, ZONA_10));
    expect(live.distanceKm).toBe(1.3);
    expect(live.etaMinutes).toBe(etaMinutes(1.3));
    expect(live.etaMinutes).toBe(3);

    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));
    await recordProviderLocation(provider.id, ZONA_10, at(75));
    const towing = liveLocationFor(await reload(req.id))!;
    expect(towing.target).toBe("DROPOFF");
    expect(towing.distanceKm).toBe(roadDistanceKm(ZONA_10, ZONA_11));
    expect(towing.distanceKm).toBe(7.35);

    await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(80));
    expect(liveLocationFor(await reload(req.id))).toBeNull();
  });

  it("sin ubicación del gruero (externo recién asignado) no hay posición en vivo", async () => {
    const operator = await createOperator();
    const req = await createRequest(await createUser(), towInput(), T0);
    const ext = await createProvider({ isExternal: true, status: "OFFLINE", at: null, lastSeenAt: null });
    await assignProvider(req.id, ext.id, operator.id, at(10));
    expect(liveLocationFor(await reload(req.id))).toBeNull();
    expect(toRequestView(await reload(req.id), "CLIENT").providerLive).toBeNull();
  });
});

describe("views.toOfferView", () => {
  it("lo que ve el gruero en la oferta: distancia y ETA hasta la recogida, remolque, pago y nombre de pila", async () => {
    const user = await createUser({ name: "Carlos Pérez" });
    const [p] = await createProvidersAtKm([1]);
    const req = await createRequest(user, towInput(), T0);
    const offer = mustPending(req);
    const v = toOfferView(offer, req, p);
    expect(v).toEqual({
      id: offer.id,
      requestId: req.id,
      round: 1,
      expiresAt: at(40).toISOString(),
      kind: "TOW",
      vehicleKind: "SEDAN",
      vehicleLabel: "Corolla gris",
      pickup: { lat: ZONA_10.lat, lng: ZONA_10.lng, address: "Zona 10" },
      dropoff: { lat: ZONA_11.lat, lng: ZONA_11.lng, address: "Taller zona 11" },
      distanceToPickupKm: 1.3,
      etaToPickupMinutes: 3,
      towDistanceKm: 7.35,
      payoutQ: 391,
      clientFirstName: "Carlos",
    });
    // Sin ubicación del gruero se usa la distancia guardada en la oferta.
    expect(toOfferView(offer, req, { lat: null, lng: null }).distanceToPickupKm).toBe(offer.distanceKm);
  });
});

describe("views.toProviderAdminView / providerRating", () => {
  it("incluye contacto, enlace mágico, invitación de WhatsApp, frescura y servicio activo", async () => {
    const [p] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await acceptOffer(mustPending(req).id, p.id, at(5));
    const withReq = await prisma.provider.findUniqueOrThrow({
      where: { id: p.id },
      include: { requests: { where: { status: { in: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } }, select: { id: true } } },
    });

    const v = toProviderAdminView(withReq, at(30));
    expect(v.id).toBe(p.id);
    expect(v.phone).toBe(p.phone);
    expect(v.whatsapp).toBe(`https://wa.me/502${p.phone}`);
    expect(v.status).toBe("BUSY");
    expect(v.isStale).toBe(false);
    expect(v.accessLink).toContain(`/driver?token=${p.accessToken}`);
    expect(v.whatsappInvite.startsWith(`https://wa.me/502${p.phone}?text=`)).toBe(true);
    expect(decodeURIComponent(v.whatsappInvite)).toContain(p.accessToken);
    expect(decodeURIComponent(v.whatsappInvite)).toContain(p.name);
    expect(v.activeRequestId).toBe(req.id);
    expect(v.location).toEqual({ lat: p.lat, lng: p.lng, heading: null, updatedAt: T0.toISOString() });
    expect(v.rating).toBeNull();
    expect(v.createdAt).toBe(p.createdAt.toISOString());

    expect(toProviderAdminView(withReq, at(minutes(2) + 1)).isStale).toBe(true);
    const never = await createProvider({ at: null, lastSeenAt: null });
    const nv = toProviderAdminView(never, T0);
    expect(nv.isStale).toBe(true);
    expect(nv.location).toBeNull();
    expect(nv.activeRequestId).toBeNull();
  });

  it("providerRating: null sin calificaciones; promedio a 1 decimal", () => {
    expect(providerRating({ ratingSum: 0, ratingCount: 0 })).toBeNull();
    expect(providerRating({ ratingSum: 5, ratingCount: 1 })).toBe(5);
    expect(providerRating({ ratingSum: 9, ratingCount: 2 })).toBe(4.5);
    expect(providerRating({ ratingSum: 13, ratingCount: 3 })).toBe(4.3);
    expect(providerRating({ ratingSum: 14, ratingCount: 3 })).toBe(4.7);
  });
});
