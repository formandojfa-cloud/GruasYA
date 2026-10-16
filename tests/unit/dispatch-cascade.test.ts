/**
 * Cascada de ofertas: rechazo → siguiente; expiración (40 s) → siguiente;
 * máximo 5 ofertas; 2 min en total; aceptación (incluida la carrera entre
 * dos aceptaciones del mismo gruero).
 */
import { describe, expect, it } from "vitest";
import { DISPATCH } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  acceptOffer,
  advanceRequest,
  assignProvider,
  cancelRequest,
  createRequest,
  DispatchError,
  loadRequest,
  rejectOffer,
  retrySearch,
} from "@/lib/dispatch";
import {
  at,
  createOperator,
  createProvider,
  createProvidersAtKm,
  createUser,
  eventTypes,
  expectDispatchError,
  minutes,
  mustPending,
  offerByRound,
  openAlerts,
  pendingOffer,
  providerStatus,
  T0,
  towInput,
  useDispatchFixture,
} from "./helpers";

useDispatchFixture();

describe("dispatch.rejectOffer", () => {
  it("al rechazar se ofrece de inmediato al siguiente más cercano (ronda 2, vence 40 s después)", async () => {
    const [a, b] = await createProvidersAtKm([1, 3]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    expect(o1.providerId).toBe(a.id);

    const after = await rejectOffer(o1.id, a.id, at(5));
    expect(after.status).toBe("SEARCHING");
    expect(after.offers).toHaveLength(2);
    const r1 = offerByRound(after, 1);
    expect(r1.response).toBe("REJECTED");
    expect(r1.respondedAt).toEqual(at(5));
    const o2 = mustPending(after);
    expect(o2.providerId).toBe(b.id);
    expect(o2.round).toBe(2);
    expect(o2.epoch).toBe(1);
    expect(o2.offeredAt).toEqual(at(5));
    expect(o2.expiresAt).toEqual(at(45));
    expect(eventTypes(after)).toEqual(["CREATED", "OFFER_SENT", "OFFER_REJECTED", "OFFER_SENT"]);
  });

  it("cuando todos rechazan → ESCALATED con NO_MORE_CANDIDATES y alerta abierta", async () => {
    const [a, b] = await createProvidersAtKm([1, 3]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await rejectOffer(mustPending(req).id, a.id, at(5));
    const r2 = await loadRequest(req.id);
    const final = await rejectOffer(mustPending(r2!).id, b.id, at(10));

    expect(final.status).toBe("ESCALATED");
    expect(final.escalationReason).toBe("NO_MORE_CANDIDATES");
    expect(final.escalatedAt).toEqual(at(10));
    expect(pendingOffer(final)).toBeNull();
    expect(final.offers.every((o) => o.response === "REJECTED")).toBe(true);
    expect(openAlerts(final)).toHaveLength(1);
    expect(openAlerts(final)[0].reason).toBe("NO_MORE_CANDIDATES");
    expect(eventTypes(final).at(-1)).toBe("ESCALATED");
  });

  it("la oferta de otro proveedor o un id inexistente → OFFER_NOT_FOUND (404)", async () => {
    const [a] = await createProvidersAtKm([1]);
    const intruder = await createProvider({ at: null, status: "OFFLINE" });
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    await expectDispatchError(rejectOffer(o1.id, intruder.id, at(1)), "OFFER_NOT_FOUND", 404);
    await expectDispatchError(rejectOffer("no-existe", a.id, at(1)), "OFFER_NOT_FOUND", 404);
    // La oferta sigue pendiente para su dueño.
    expect(mustPending((await loadRequest(req.id))!).id).toBe(o1.id);
  });

  it("es idempotente: rechazar dos veces no duplica eventos ni ofertas", async () => {
    const [a] = await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    const first = await rejectOffer(o1.id, a.id, at(5));
    const second = await rejectOffer(o1.id, a.id, at(6));
    expect(second.offers).toHaveLength(2);
    expect(mustPending(second).id).toBe(mustPending(first).id);
    expect(eventTypes(second).filter((t) => t === "OFFER_REJECTED")).toHaveLength(1);
  });
});

describe("dispatch.advanceRequest", () => {
  it("antes de que venza la oferta no hace nada (misma oferta pendiente)", async () => {
    await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    const same = await advanceRequest(req.id, at(39));
    expect(same!.status).toBe("SEARCHING");
    expect(same!.offers).toHaveLength(1);
    expect(mustPending(same!).id).toBe(o1.id);
    expect(mustPending(same!).response).toBe("PENDING");
    expect(eventTypes(same!)).toEqual(["CREATED", "OFFER_SENT"]);
  });

  it("con la oferta vencida la marca EXPIRED y ofrece al siguiente (ronda 2)", async () => {
    const [a, b] = await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    expect(o1.providerId).toBe(a.id);

    const adv = (await advanceRequest(req.id, at(40)))!; // expiresAt == now → vencida
    expect(adv.status).toBe("SEARCHING");
    const r1 = offerByRound(adv, 1);
    expect(r1.id).toBe(o1.id);
    expect(r1.response).toBe("EXPIRED");
    expect(r1.respondedAt).toEqual(at(40));
    const o2 = mustPending(adv);
    expect(o2.providerId).toBe(b.id);
    expect(o2.round).toBe(2);
    expect(o2.offeredAt).toEqual(at(40));
    expect(o2.expiresAt).toEqual(at(80));
    expect(eventTypes(adv)).toEqual(["CREATED", "OFFER_SENT", "OFFER_EXPIRED", "OFFER_SENT"]);
  });

  it("avanzar dos veces el mismo instante no duplica la expiración ni la oferta", async () => {
    await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const [x, y] = await Promise.all([advanceRequest(req.id, at(41)), advanceRequest(req.id, at(41))]);
    expect(x!.offers).toHaveLength(2);
    expect(y!.offers).toHaveLength(2);
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.offers.filter((o) => o.response === "EXPIRED")).toHaveLength(1);
    expect(fresh.offers.filter((o) => o.response === "PENDING")).toHaveLength(1);
    expect(eventTypes(fresh).filter((t) => t === "OFFER_EXPIRED")).toHaveLength(1);
  });

  it("tras 5 ofertas en la misma búsqueda → ESCALATED con MAX_OFFERS_REACHED aunque quede un candidato", async () => {
    expect(DISPATCH.maxOffersPerEpoch).toBe(5);
    const ps = await createProvidersAtKm([1, 2, 3, 4, 5, 6]);
    const req = await createRequest(await createUser(), towInput(), T0);
    // Rondas 1–4 rechazan al instante; la 5.ª vence.
    let cur = req;
    for (let round = 1; round <= 4; round++) {
      const o = mustPending(cur);
      expect(o.round).toBe(round);
      expect(o.providerId).toBe(ps[round - 1].id);
      cur = await rejectOffer(o.id, o.providerId, at(round));
    }
    const o5 = mustPending(cur);
    expect(o5.round).toBe(5);
    expect(o5.providerId).toBe(ps[4].id);

    const final = (await advanceRequest(req.id, at(4 + 40)))!;
    expect(final.status).toBe("ESCALATED");
    expect(final.escalationReason).toBe("MAX_OFFERS_REACHED");
    expect(final.offers).toHaveLength(5);
    expect(final.offers.some((o) => o.providerId === ps[5].id)).toBe(false);
    expect(offerByRound(final, 5).response).toBe("EXPIRED");
    expect(openAlerts(final)).toHaveLength(1);
    expect(openAlerts(final)[0].reason).toBe("MAX_OFFERS_REACHED");
  });

  it("pasado el plazo de 2 min → ESCALATED con SEARCH_TIMEOUT sin contactar a nadie más", async () => {
    const [, b] = await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(req.searchDeadlineAt).toEqual(at(minutes(2)));

    // Ronda 1 vence a los 40 s → ronda 2 (40–80 s) → ronda 2 vence a los 80 s → nadie más → NO_MORE_CANDIDATES.
    // Para aislar el plazo total, se deja la primera oferta sin tocar hasta los 2 min.
    const final = (await advanceRequest(req.id, at(minutes(2))))!;
    expect(final.status).toBe("ESCALATED");
    expect(final.escalationReason).toBe("SEARCH_TIMEOUT");
    expect(offerByRound(final, 1).response).toBe("EXPIRED");
    expect(final.offers).toHaveLength(1);
    expect(final.offers.some((o) => o.providerId === b.id)).toBe(false);
    expect(eventTypes(final)).toEqual(["CREATED", "OFFER_SENT", "OFFER_EXPIRED", "ESCALATED"]);
  });

  it("la cascada completa: 40 s + 40 s + 40 s = plazo agotado en la tercera expiración", async () => {
    const ps = await createProvidersAtKm([1, 2, 3, 4]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const s2 = (await advanceRequest(req.id, at(40)))!;
    expect(mustPending(s2).providerId).toBe(ps[1].id);
    const s3 = (await advanceRequest(req.id, at(80)))!;
    expect(mustPending(s3).providerId).toBe(ps[2].id);
    const s4 = (await advanceRequest(req.id, at(120)))!;
    expect(s4.status).toBe("ESCALATED");
    expect(s4.escalationReason).toBe("SEARCH_TIMEOUT");
    expect(s4.offers).toHaveLength(3);
    expect(s4.offers.some((o) => o.providerId === ps[3].id)).toBe(false);
  });

  it("no toca solicitudes que no están en SEARCHING y devuelve null si no existe", async () => {
    const req = await createRequest(await createUser(), towInput(), T0); // ESCALATED
    const same = await advanceRequest(req.id, at(minutes(10)));
    expect(same!.status).toBe("ESCALATED");
    expect(same!.updatedAt).toEqual(req.updatedAt);
    expect(await advanceRequest("no-existe", T0)).toBeNull();
  });
});

describe("dispatch.acceptOffer", () => {
  it("camino feliz: EN_ROUTE, proveedor BUSY, asignado por AUTO, alerta resuelta", async () => {
    // Primero sin grúas → alerta abierta; el PBX reintenta cuando ya hay una conectada.
    const operator = await createOperator();
    const user = await createUser();
    const escalated = await createRequest(user, towInput(), T0);
    expect(openAlerts(escalated)).toHaveLength(1);
    const p = await createProvider({ lastSeenAt: at(30) });
    const searching = await retrySearch(escalated.id, operator.id, at(30));
    const offer = mustPending(searching);
    expect(offer.providerId).toBe(p.id);

    const accepted = await acceptOffer(offer.id, p.id, at(35));
    expect(accepted.status).toBe("EN_ROUTE");
    expect(accepted.providerId).toBe(p.id);
    expect(accepted.provider?.id).toBe(p.id);
    expect(accepted.assignedBy).toBe("AUTO");
    expect(accepted.assignedAt).toEqual(at(35));
    expect(offerByRound(accepted, 1).response).toBe("ACCEPTED");
    expect(offerByRound(accepted, 1).respondedAt).toEqual(at(35));
    expect(pendingOffer(accepted)).toBeNull();
    expect(await providerStatus(p.id)).toBe("BUSY");
    expect(openAlerts(accepted)).toHaveLength(0);
    expect(accepted.alerts[0].resolvedAt).toEqual(at(35));
    expect(eventTypes(accepted).at(-1)).toBe("ASSIGNED");
    const assigned = accepted.events.find((e) => e.type === "ASSIGNED")!;
    expect(JSON.parse(assigned.data!)).toEqual({ providerId: p.id, by: "AUTO", offerId: offer.id, round: 1 });
  });

  it("una oferta vencida → OFFER_UNAVAILABLE (409) y la solicitud sigue buscando", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    await expectDispatchError(acceptOffer(o1.id, a.id, at(40)), "OFFER_UNAVAILABLE", 409);
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("SEARCHING");
    expect(fresh.providerId).toBeNull();
    expect(await providerStatus(a.id)).toBe("ONLINE");
    // Justo antes de vencer sí se puede.
    const ok = await acceptOffer(o1.id, a.id, at(39));
    expect(ok.status).toBe("EN_ROUTE");
  });

  it("la oferta de otro proveedor → OFFER_NOT_FOUND (404) y no cambia nada", async () => {
    const [a, b] = await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    expect(o1.providerId).toBe(a.id);
    await expectDispatchError(acceptOffer(o1.id, b.id, at(1)), "OFFER_NOT_FOUND", 404);
    await expectDispatchError(acceptOffer("no-existe", b.id, at(1)), "OFFER_NOT_FOUND", 404);
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("SEARCHING");
    expect(mustPending(fresh).response).toBe("PENDING");
    expect(await providerStatus(b.id)).toBe("ONLINE");
  });

  it("dos aceptaciones concurrentes de la misma oferta: exactamente una gana", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);

    const results = await Promise.allSettled([acceptOffer(o1.id, a.id, at(2)), acceptOffer(o1.id, a.id, at(2))]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const ko = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    const err = (ko[0] as PromiseRejectedResult).reason as DispatchError;
    expect(err).toBeInstanceOf(DispatchError);
    expect(err.code).toBe("OFFER_UNAVAILABLE");

    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("EN_ROUTE");
    expect(eventTypes(fresh).filter((t) => t === "ASSIGNED")).toHaveLength(1);
    expect(await providerStatus(a.id)).toBe("BUSY");
  });

  it("aceptar después de que el cliente canceló → falla y el proveedor sigue libre", async () => {
    const [a] = await createProvidersAtKm([1]);
    const user = await createUser();
    const req = await createRequest(user, towInput(), T0);
    const o1 = mustPending(req);
    const cancelled = await cancelRequest(req.id, "CLIENT", "Ya no la necesito", at(10), { userId: user.id });
    expect(cancelled.status).toBe("CANCELLED");
    expect(offerByRound(cancelled, 1).response).toBe("WITHDRAWN");

    await expectDispatchError(acceptOffer(o1.id, a.id, at(12)), "OFFER_UNAVAILABLE", 409);
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("CANCELLED");
    expect(fresh.providerId).toBeNull();
    expect(await providerStatus(a.id)).toBe("ONLINE");
  });

  it("aceptar después de que el PBX asignó a otro → falla (la oferta fue retirada)", async () => {
    const operator = await createOperator();
    const [a] = await createProvidersAtKm([1]);
    const manual = await createProvider({ status: "OFFLINE", at: null, lastSeenAt: null });
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    const assigned = await assignProvider(req.id, manual.id, operator.id, at(5));
    expect(assigned.status).toBe("EN_ROUTE");
    expect(offerByRound(assigned, 1).response).toBe("WITHDRAWN");
    await expectDispatchError(acceptOffer(o1.id, a.id, at(6)), "OFFER_UNAVAILABLE", 409);
    expect(await providerStatus(a.id)).toBe("ONLINE");
    expect((await loadRequest(req.id))!.providerId).toBe(manual.id);
  });

  it("la oferta expirada que acepta tarde no se marca ni avanza la cascada por sí sola", async () => {
    const [a, b] = await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    await expectDispatchError(acceptOffer(o1.id, a.id, at(45)), "OFFER_UNAVAILABLE", 409);
    // El avance perezoso (lectura del cliente) es quien la expira y ofrece al siguiente.
    const adv = (await advanceRequest(req.id, at(45)))!;
    expect(offerByRound(adv, 1).response).toBe("EXPIRED");
    expect(mustPending(adv).providerId).toBe(b.id);
  });

  it("un cliente con la oferta pendiente de la grúa A no bloquea a otro cliente: B recibe la suya", async () => {
    const [a, b] = await createProvidersAtKm([1, 2]);
    const r1 = await createRequest(await createUser(), towInput(), T0);
    expect(mustPending(r1).providerId).toBe(a.id);
    const r2 = await createRequest(await createUser(), towInput(), at(1));
    expect(mustPending(r2).providerId).toBe(b.id);
    expect(await prisma.dispatchOffer.count({ where: { response: "PENDING" } })).toBe(2);
  });
});
