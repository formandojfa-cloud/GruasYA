/**
 * createRequest: validación, cotización guardada, arranque de la cascada
 * (oferta al más cercano) o escalamiento inmediato al PBX.
 * findCandidates: quién es elegible para recibir una oferta.
 */
import { describe, expect, it } from "vitest";
import { DISPATCH } from "@/lib/config";
import { prisma } from "@/lib/db";
import { cancelRequest, createRequest, findCandidates, isActiveMember, loadRequest, parseQuote, providerKindFor } from "@/lib/dispatch";
import { haversineKm } from "@/lib/geo";
import {
  at,
  createProvider,
  createProvidersAtKm,
  createUser,
  eventData,
  eventTypes,
  expectDispatchError,
  lightInput,
  minutes,
  mustPending,
  northOf,
  openAlerts,
  T0,
  towInput,
  useDispatchFixture,
  ZONA_10,
} from "./helpers";

useDispatchFixture();

describe("dispatch.createRequest — validación", () => {
  it("la grúa necesita destino (DROPOFF_REQUIRED, 400)", async () => {
    const user = await createUser();
    await expectDispatchError(createRequest(user, towInput({ dropoff: undefined }), T0), "DROPOFF_REQUIRED", 400);
    expect(await prisma.serviceRequest.count()).toBe(0);
  });

  it("una asistencia ligera no necesita destino y busca motoristas, no grúas", async () => {
    const user = await createUser();
    const moto = await createProvider({ kind: "MOTO" });
    await createProvider({ kind: "TOW" }); // una grúa conectada no cuenta
    const req = await createRequest(user, lightInput("BATTERY"), T0);
    expect(req.status).toBe("SEARCHING");
    expect(req.kind).toBe("BATTERY");
    expect(req.dropoffLat).toBeNull();
    expect(req.distanceKm).toBe(0);
    expect(req.priceTotal).toBe(0); // socio
    expect(mustPending(req).providerId).toBe(moto.id);
  });

  it("rechaza una segunda solicitud mientras hay una activa (ACTIVE_REQUEST_EXISTS, 409) y la permite tras cancelar", async () => {
    const user = await createUser();
    const first = await createRequest(user, towInput(), T0);
    expect(first.status).toBe("ESCALATED"); // sin grúas conectadas
    await expectDispatchError(createRequest(user, towInput(), at(5)), "ACTIVE_REQUEST_EXISTS", 409);
    expect(await prisma.serviceRequest.count({ where: { userId: user.id } })).toBe(1);

    await cancelRequest(first.id, "CLIENT", undefined, at(10), { userId: user.id });
    const second = await createRequest(user, towInput(), at(15));
    expect(second.id).not.toBe(first.id);
    expect(await prisma.serviceRequest.count({ where: { userId: user.id } })).toBe(2);
  });

  it("otro cliente sí puede pedir aunque el primero tenga un servicio activo", async () => {
    const a = await createUser();
    const b = await createUser();
    await createRequest(a, towInput(), T0);
    const rb = await createRequest(b, towInput(), T0);
    expect(rb.userId).toBe(b.id);
  });
});

describe("dispatch.createRequest — datos guardados", () => {
  it("guarda la cotización de socio (Q435), distancia por carretera 7.35 km, PIN de 4 dígitos y plazo de 2 min", async () => {
    const user = await createUser({ isMember: true });
    const req = await createRequest(user, towInput(), T0);
    expect(req.distanceKm).toBe(7.35);
    expect(req.isMemberAtRequest).toBe(true);
    expect(req.priceTotal).toBe(435);
    const quote = parseQuote(req);
    expect(quote.totalQ).toBe(435);
    expect(quote.providerPayoutQ).toBe(391);
    expect(req.pin).toMatch(/^\d{4}$/);
    expect(req.searchEpoch).toBe(1);
    expect(req.searchStartedAt).toEqual(T0);
    expect(req.searchDeadlineAt).toEqual(at(DISPATCH.searchTimeoutMs / 1000));
    expect(req.searchDeadlineAt).toEqual(at(minutes(2)));
    expect(req.createdAt).toEqual(T0);
    expect(req.pickupAddress).toBe("Zona 10");
    expect(req.dropoffAddress).toBe("Taller zona 11");
    expect(req.vehicleLabel).toBe("Corolla gris");
    expect(req.plate).toBe("P123ABC");
    expect(eventData(req, "CREATED")).toEqual({ kind: "TOW", priceTotal: 435, isMember: true });
  });

  it("un no socio paga Q485 (+Q50) y la membresía vencida cuenta como no socio", async () => {
    const nonMember = await createUser({ isMember: false });
    const expired = await createUser({ isMember: true, membershipExpiresAt: at(-1) });
    const valid = await createUser({ isMember: true, membershipExpiresAt: at(minutes(60)) });

    expect(isActiveMember(nonMember, T0)).toBe(false);
    expect(isActiveMember(expired, T0)).toBe(false);
    expect(isActiveMember(valid, T0)).toBe(true);

    expect((await createRequest(nonMember, towInput(), T0)).priceTotal).toBe(485);
    const r2 = await createRequest(expired, towInput(), T0);
    expect(r2.priceTotal).toBe(485);
    expect(r2.isMemberAtRequest).toBe(false);
    expect((await createRequest(valid, towInput(), T0)).priceTotal).toBe(435);
  });

  it("providerKindFor: grúa para TOW, moto para el resto", () => {
    expect(providerKindFor("TOW")).toBe("TOW");
    for (const k of ["TIRE", "BATTERY", "FUEL", "LOCKSMITH"] as const) expect(providerKindFor(k)).toBe("MOTO");
  });
});

describe("dispatch.createRequest — arranque de la cascada", () => {
  it("sin proveedor conectado → ESCALATED con NO_PROVIDERS_AVAILABLE y una sola alerta abierta", async () => {
    const user = await createUser();
    await createProvider({ status: "OFFLINE" });
    const req = await createRequest(user, towInput(), T0);

    expect(req.status).toBe("ESCALATED");
    expect(req.escalationReason).toBe("NO_PROVIDERS_AVAILABLE");
    expect(req.escalatedAt).toEqual(T0);
    expect(req.offers).toHaveLength(0);
    expect(req.alerts).toHaveLength(1);
    expect(openAlerts(req)).toHaveLength(1);
    expect(req.alerts[0].reason).toBe("NO_PROVIDERS_AVAILABLE");
    expect(req.alerts[0].acknowledgedAt).toBeNull();
    expect(req.alerts[0].createdAt).toEqual(T0);
    expect(eventTypes(req)).toEqual(["CREATED", "ESCALATED"]);
    expect(eventData(req, "ESCALATED")).toEqual({ reason: "NO_PROVIDERS_AVAILABLE", alertId: req.alerts[0].id });
  });

  it("con grúas conectadas → SEARCHING y oferta al más cercano (ronda 1, vence en 40 s)", async () => {
    const user = await createUser();
    const [far, near, mid] = await createProvidersAtKm([6, 1.5, 3]);
    const req = await createRequest(user, towInput(), T0);

    expect(req.status).toBe("SEARCHING");
    expect(req.escalatedAt).toBeNull();
    expect(req.alerts).toHaveLength(0);
    expect(req.offers).toHaveLength(1);
    const offer = mustPending(req);
    expect(offer.providerId).toBe(near.id);
    expect(offer.providerId).not.toBe(mid.id);
    expect(offer.providerId).not.toBe(far.id);
    expect(offer.round).toBe(1);
    expect(offer.epoch).toBe(1);
    expect(offer.offeredAt).toEqual(T0);
    expect(offer.expiresAt).toEqual(at(40));
    expect(offer.expiresAt).toEqual(new Date(T0.getTime() + DISPATCH.offerTtlMs));
    expect(offer.distanceKm).toBeCloseTo(1.5, 2);
    expect(offer.provider.name).toBe(near.name);
    expect(eventTypes(req)).toEqual(["CREATED", "OFFER_SENT"]);
    expect(eventData(req, "OFFER_SENT")).toMatchObject({ offerId: offer.id, providerId: near.id, providerName: near.name, round: 1 });
    // El proveedor sigue ONLINE hasta aceptar.
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: near.id } })).status).toBe("ONLINE");
  });

  it("la cercanía se mide desde el punto de recogida, no desde el destino", async () => {
    const user = await createUser();
    const nearPickup = await createProvider({ at: northOf(ZONA_10, 2) });
    // A 1 km del destino (zona 11) pero más lejos de la recogida.
    const nearDropoff = await createProvider({ at: { lat: 14.6151 + 0.009, lng: -90.5569 } });
    const req = await createRequest(user, towInput(), T0);
    expect(mustPending(req).providerId).toBe(nearPickup.id);
    expect(mustPending(req).providerId).not.toBe(nearDropoff.id);
  });
});

describe("dispatch.findCandidates", () => {
  async function escalatedTow() {
    const user = await createUser();
    const req = await createRequest(user, towInput(), T0);
    expect(req.status).toBe("ESCALATED");
    return req;
  }

  it("incluye grúas ONLINE, frescas y dentro del radio; ordena por distancia", async () => {
    const req = await escalatedTow();
    const [c, a, b] = await createProvidersAtKm([9, 1, 4]);
    const cands = await findCandidates(req, T0);
    expect(cands.map((x) => x.provider.id)).toEqual([a.id, b.id, c.id]);
    expect(cands[0].distanceKm).toBeCloseTo(1, 2);
    expect(cands[2].distanceKm).toBeCloseTo(9, 2);
    expect(cands[0].distanceKm).toBeCloseTo(haversineKm(ZONA_10, { lat: a.lat!, lng: a.lng! }), 6);
  });

  it("excluye motoristas para una grúa (y grúas para una asistencia ligera)", async () => {
    const req = await escalatedTow();
    const moto = await createProvider({ kind: "MOTO" });
    expect(await findCandidates(req, T0)).toHaveLength(0);

    const tow = await createProvider({ kind: "TOW" });
    expect((await findCandidates(req, T0)).map((c) => c.provider.id)).toEqual([tow.id]);

    // Para una asistencia ligera la única candidata es la moto; la grúa no sirve.
    const light = await createRequest(await createUser(), lightInput("TIRE"), T0);
    expect(light.status).toBe("SEARCHING");
    expect(mustPending(light).providerId).toBe(moto.id);
    expect(await findCandidates(light, T0)).toHaveLength(0); // la moto ya fue contactada; la grúa queda fuera
  });

  it("excluye OFFLINE y BUSY", async () => {
    const req = await escalatedTow();
    await createProvider({ status: "OFFLINE" });
    await createProvider({ status: "BUSY" });
    expect(await findCandidates(req, T0)).toHaveLength(0);
    const online = await createProvider({ status: "ONLINE" });
    expect((await findCandidates(req, T0)).map((c) => c.provider.id)).toEqual([online.id]);
  });

  it("excluye a quien no ha enviado ubicación en más de 2 min (o nunca)", async () => {
    const req = await escalatedTow();
    expect(DISPATCH.providerStaleMs).toBe(minutes(2) * 1000);
    await createProvider({ lastSeenAt: at(-minutes(2) - 1) });
    await createProvider({ lastSeenAt: null });
    await createProvider({ at: null }); // sin coordenadas
    expect(await findCandidates(req, T0)).toHaveLength(0);

    const fresh = await createProvider({ lastSeenAt: at(-minutes(2) + 1) });
    expect((await findCandidates(req, T0)).map((c) => c.provider.id)).toEqual([fresh.id]);
    // El mismo proveedor deja de ser candidato cuando el reloj avanza.
    expect(await findCandidates(req, at(5))).toHaveLength(0);
  });

  it("excluye a quien está a más de 15 km del punto de recogida", async () => {
    const req = await escalatedTow();
    expect(DISPATCH.searchRadiusKm).toBe(15);
    await createProvider({ at: northOf(ZONA_10, 15.5) });
    expect(await findCandidates(req, T0)).toHaveLength(0);
    const inside = await createProvider({ at: northOf(ZONA_10, 14.5) });
    expect((await findCandidates(req, T0)).map((c) => c.provider.id)).toEqual([inside.id]);
  });

  it("excluye a quien tiene otra oferta pendiente (en cualquier solicitud)", async () => {
    const [p] = await createProvidersAtKm([1]);
    const other = await createRequest(await createUser(), towInput(), T0);
    expect(mustPending(other).providerId).toBe(p.id);

    const req = await createRequest(await createUser(), towInput(), T0);
    expect(req.status).toBe("ESCALATED"); // la única grúa ya tiene una oferta pendiente
    expect(await findCandidates(req, T0)).toHaveLength(0);

    // Cuando esa oferta deja de estar pendiente, vuelve a ser candidato.
    await prisma.dispatchOffer.update({ where: { id: mustPending(other).id }, data: { response: "EXPIRED" } });
    expect((await findCandidates(req, T0)).map((c) => c.provider.id)).toEqual([p.id]);
  });

  it("excluye a quien rechazó esta solicitud y a quien ya fue contactado en la búsqueda actual, no a quien expiró en una búsqueda anterior", async () => {
    const req = await escalatedTow();
    const [rejected, offeredThisEpoch, expiredBefore, fresh] = await createProvidersAtKm([1, 2, 3, 4]);
    const marker = { requestId: req.id, distanceKm: 1, offeredAt: T0, expiresAt: at(40) };
    await prisma.dispatchOffer.createMany({
      data: [
        { ...marker, providerId: rejected.id, epoch: 1, round: 1, response: "REJECTED" },
        { ...marker, providerId: offeredThisEpoch.id, epoch: req.searchEpoch, round: 2, response: "EXPIRED" },
        { ...marker, providerId: expiredBefore.id, epoch: req.searchEpoch - 1, round: 1, response: "EXPIRED" },
      ],
    });
    const reloaded = (await loadRequest(req.id))!;
    const ids = (await findCandidates(reloaded, T0)).map((c) => c.provider.id);
    expect(ids).toEqual([expiredBefore.id, fresh.id]);
  });
});
