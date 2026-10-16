/**
 * El servicio en curso: progreso del gruero (llegó → PIN → en curso → terminó),
 * cancelaciones (cliente, PBX, cargo de Q50) y el gruero que se baja.
 */
import { describe, expect, it } from "vitest";
import { PRICING } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  acceptOffer,
  assignProvider,
  cancelRequest,
  createRequest,
  loadRequest,
  providerBailout,
  providerTransition,
  rejectOffer,
  requestOperatorHelp,
  retrySearch,
} from "@/lib/dispatch";
import {
  at,
  createOperator,
  createProvider,
  createProvidersAtKm,
  createUser,
  eventData,
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

/** Cliente + grúa a 1 km + solicitud aceptada (EN_ROUTE en T0+5 s). */
async function enRoute(extraKms: number[] = []) {
  const user = await createUser({ name: "Ana López" });
  const [provider, ...others] = await createProvidersAtKm([1, ...extraKms]);
  const created = await createRequest(user, towInput(), T0);
  const req = await acceptOffer(mustPending(created).id, provider.id, at(5));
  expect(req.status).toBe("EN_ROUTE");
  return { user, provider, others, req };
}

function wrongPin(pin: string): string {
  return pin === "0000" ? "1111" : "0000";
}

describe("dispatch.providerTransition", () => {
  it("EN_ROUTE → ARRIVED → (PIN) IN_PROGRESS → COMPLETED, con marcas de tiempo y eventos", async () => {
    const { provider, req } = await enRoute();

    const arrived = await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(minutes(10)));
    expect(arrived.status).toBe("ARRIVED");
    expect(arrived.arrivedAt).toEqual(at(minutes(10)));
    expect(arrived.startedAt).toBeNull();
    expect(eventData(arrived, "ARRIVED")).toEqual({ providerId: provider.id });

    const started = await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(minutes(12)));
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.startedAt).toEqual(at(minutes(12)));
    expect(await providerStatus(provider.id)).toBe("BUSY");

    const done = await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(minutes(40)));
    expect(done.status).toBe("COMPLETED");
    expect(done.completedAt).toEqual(at(minutes(40)));
    expect(done.providerId).toBe(provider.id); // el historial conserva quién lo hizo
    expect(eventTypes(done)).toEqual(["CREATED", "OFFER_SENT", "ASSIGNED", "ARRIVED", "IN_PROGRESS", "COMPLETED"]);
  });

  it("al iniciar el servicio: sin PIN → PIN_REQUIRED (400); PIN incorrecto → INVALID_PIN (400); nada cambia", async () => {
    const { provider, req } = await enRoute();
    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));

    await expectDispatchError(providerTransition(req.id, provider.id, "IN_PROGRESS", undefined, at(61)), "PIN_REQUIRED", 400);
    await expectDispatchError(providerTransition(req.id, provider.id, "IN_PROGRESS", "", at(61)), "PIN_REQUIRED", 400);
    await expectDispatchError(providerTransition(req.id, provider.id, "IN_PROGRESS", wrongPin(req.pin), at(62)), "INVALID_PIN", 400);

    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("ARRIVED");
    expect(fresh.startedAt).toBeNull();
    expect(eventTypes(fresh)).not.toContain("IN_PROGRESS");

    const ok = await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(63));
    expect(ok.status).toBe("IN_PROGRESS");
  });

  it("orden inválido → INVALID_TRANSITION (409): saltarse la llegada, terminar sin iniciar, repetir un paso", async () => {
    const { provider, req } = await enRoute();
    await expectDispatchError(providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(10)), "INVALID_TRANSITION", 409);
    await expectDispatchError(providerTransition(req.id, provider.id, "COMPLETED", undefined, at(10)), "INVALID_TRANSITION", 409);
    // El estado se valida antes que el PIN.
    await expectDispatchError(providerTransition(req.id, provider.id, "IN_PROGRESS", undefined, at(10)), "INVALID_TRANSITION", 409);

    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(20));
    await expectDispatchError(providerTransition(req.id, provider.id, "ARRIVED", undefined, at(21)), "INVALID_TRANSITION", 409);
    await expectDispatchError(providerTransition(req.id, provider.id, "COMPLETED", undefined, at(21)), "INVALID_TRANSITION", 409);

    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(30));
    await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(40));
    await expectDispatchError(providerTransition(req.id, provider.id, "COMPLETED", undefined, at(41)), "INVALID_TRANSITION", 409);
    expect((await loadRequest(req.id))!.status).toBe("COMPLETED");
  });

  it("otro proveedor → NOT_YOUR_JOB (403); también en una solicitud sin asignar; solicitud inexistente → 404", async () => {
    const { provider, req, others } = await enRoute([3]);
    const [other] = others;
    await expectDispatchError(providerTransition(req.id, other.id, "ARRIVED", undefined, at(10)), "NOT_YOUR_JOB", 403);
    expect((await loadRequest(req.id))!.status).toBe("EN_ROUTE");

    const searching = await createRequest(await createUser(), towInput(), at(10));
    expect(searching.status).toBe("SEARCHING");
    await expectDispatchError(providerTransition(searching.id, provider.id, "ARRIVED", undefined, at(11)), "NOT_YOUR_JOB", 403);
    await expectDispatchError(providerTransition("no-existe", provider.id, "ARRIVED", undefined, at(11)), "REQUEST_NOT_FOUND", 404);
  });

  it("COMPLETED libera al gruero de la red a ONLINE y resuelve alertas abiertas", async () => {
    const { provider, req } = await enRoute();
    const withAlert = await requestOperatorHelp(req.id, at(30));
    expect(openAlerts(withAlert)).toHaveLength(1);

    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));
    expect(await providerStatus(provider.id)).toBe("BUSY");
    const done = await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(80));
    expect(await providerStatus(provider.id)).toBe("ONLINE");
    expect(openAlerts(done)).toHaveLength(0);
    expect(done.alerts[0].resolvedAt).toEqual(at(80));
  });

  it("COMPLETED deja a un proveedor externo en OFFLINE (no entra a la cascada sin conectarse él mismo)", async () => {
    const operator = await createOperator();
    const user = await createUser();
    const escalated = await createRequest(user, towInput(), T0);
    const external = await createProvider({ isExternal: true, status: "OFFLINE", at: null, lastSeenAt: null, name: "Gruero Externo" });

    const assigned = await assignProvider(escalated.id, external.id, operator.id, at(60));
    expect(assigned.status).toBe("EN_ROUTE");
    expect(await providerStatus(external.id)).toBe("BUSY");

    await providerTransition(escalated.id, external.id, "ARRIVED", undefined, at(600));
    await providerTransition(escalated.id, external.id, "IN_PROGRESS", escalated.pin, at(660));
    const done = await providerTransition(escalated.id, external.id, "COMPLETED", undefined, at(1200));
    expect(done.status).toBe("COMPLETED");
    expect(await providerStatus(external.id)).toBe("OFFLINE");
  });
});

describe("dispatch.cancelRequest", () => {
  it("cliente cancela mientras busca: sin cargo, oferta pendiente retirada, evento con el actor", async () => {
    const [a] = await createProvidersAtKm([1]);
    const user = await createUser();
    const req = await createRequest(user, towInput(), T0);
    expect(mustPending(req).providerId).toBe(a.id);

    const cancelled = await cancelRequest(req.id, "CLIENT", "Me ayudó un vecino", at(20), { userId: user.id });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledBy).toBe("CLIENT");
    expect(cancelled.cancelReason).toBe("Me ayudó un vecino");
    expect(cancelled.cancelledAt).toEqual(at(20));
    expect(cancelled.cancellationFee).toBe(0);
    expect(offerByRound(cancelled, 1).response).toBe("WITHDRAWN");
    expect(offerByRound(cancelled, 1).respondedAt).toEqual(at(20));
    expect(pendingOffer(cancelled)).toBeNull();
    expect(await providerStatus(a.id)).toBe("ONLINE");
    expect(eventData(cancelled, "CANCELLED")).toEqual({ by: "CLIENT", reason: "Me ayudó un vecino", feeQ: 0, userId: user.id });
  });

  it("cliente cancela mientras está escalada: sin cargo y la alerta del PBX se resuelve", async () => {
    const user = await createUser();
    const req = await createRequest(user, towInput(), T0);
    expect(req.status).toBe("ESCALATED");
    const cancelled = await cancelRequest(req.id, "CLIENT", undefined, at(30), { userId: user.id });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancellationFee).toBe(0);
    expect(cancelled.cancelReason).toBeNull();
    expect(openAlerts(cancelled)).toHaveLength(0);
    expect(cancelled.alerts[0].resolvedAt).toEqual(at(30));
  });

  it("cliente cancela con la grúa en camino: cargo de Q50 y gruero liberado a ONLINE", async () => {
    expect(PRICING.cancellationFeeQ).toBe(50);
    const { user, provider, req } = await enRoute();
    const cancelled = await cancelRequest(req.id, "CLIENT", "Ya no la necesito", at(60), { userId: user.id });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancellationFee).toBe(50);
    expect(cancelled.providerId).toBe(provider.id); // queda registrado a quién se le canceló
    expect(await providerStatus(provider.id)).toBe("ONLINE");
    expect(eventData(cancelled, "CANCELLED")).toMatchObject({ by: "CLIENT", feeQ: 50 });
  });

  it("cliente cancela con la grúa ya en el punto (ARRIVED): también Q50", async () => {
    const { user, provider, req } = await enRoute();
    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    const cancelled = await cancelRequest(req.id, "CLIENT", undefined, at(70), { userId: user.id });
    expect(cancelled.cancellationFee).toBe(50);
    expect(await providerStatus(provider.id)).toBe("ONLINE");
  });

  it("el cliente no puede cancelar un servicio en curso (NOT_CANCELLABLE); el PBX sí, sin cargo", async () => {
    const operator = await createOperator();
    const { user, provider, req } = await enRoute();
    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));

    await expectDispatchError(cancelRequest(req.id, "CLIENT", undefined, at(80), { userId: user.id }), "NOT_CANCELLABLE", 409);
    expect((await loadRequest(req.id))!.status).toBe("IN_PROGRESS");
    expect(await providerStatus(provider.id)).toBe("BUSY");

    const cancelled = await cancelRequest(req.id, "PBX", "Problema con el vehículo", at(90), { operatorId: operator.id });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledBy).toBe("PBX");
    expect(cancelled.cancellationFee).toBe(0);
    expect(await providerStatus(provider.id)).toBe("ONLINE");
    expect(eventData(cancelled, "CANCELLED")).toEqual({ by: "PBX", reason: "Problema con el vehículo", feeQ: 0, operatorId: operator.id });
  });

  it("el PBX no cobra cargo aunque la grúa vaya en camino", async () => {
    const operator = await createOperator();
    const { req } = await enRoute();
    const cancelled = await cancelRequest(req.id, "PBX", undefined, at(60), { operatorId: operator.id });
    expect(cancelled.cancellationFee).toBe(0);
  });

  it("nadie cancela una solicitud terminada o ya cancelada (NOT_CANCELLABLE)", async () => {
    const operator = await createOperator();
    const { user, provider, req } = await enRoute();
    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(70));
    await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(80));
    await expectDispatchError(cancelRequest(req.id, "PBX", undefined, at(90), { operatorId: operator.id }), "NOT_CANCELLABLE", 409);
    await expectDispatchError(cancelRequest(req.id, "CLIENT", undefined, at(90), { userId: user.id }), "NOT_CANCELLABLE", 409);

    const other = await createRequest(await createUser(), towInput(), at(100));
    await cancelRequest(other.id, "PBX", undefined, at(101), { operatorId: operator.id });
    await expectDispatchError(cancelRequest(other.id, "PBX", undefined, at(102), { operatorId: operator.id }), "NOT_CANCELLABLE", 409);
  });

  it("otro cliente → FORBIDDEN (403); sin actor explícito (uso interno) se permite", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const req = await createRequest(owner, towInput(), T0);
    await expectDispatchError(cancelRequest(req.id, "CLIENT", undefined, at(5), { userId: intruder.id }), "FORBIDDEN", 403);
    expect((await loadRequest(req.id))!.status).toBe("ESCALATED");
    const cancelled = await cancelRequest(req.id, "CLIENT", undefined, at(6));
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("al cancelar, un proveedor externo asignado vuelve a OFFLINE", async () => {
    const operator = await createOperator();
    const user = await createUser();
    const req = await createRequest(user, towInput(), T0);
    const external = await createProvider({ isExternal: true, status: "OFFLINE", at: null, lastSeenAt: null });
    await assignProvider(req.id, external.id, operator.id, at(60));
    await cancelRequest(req.id, "CLIENT", undefined, at(90), { userId: user.id });
    expect(await providerStatus(external.id)).toBe("OFFLINE");
  });
});

describe("dispatch.providerBailout", () => {
  it("EN_ROUTE → vuelve a SEARCHING con época 2, sin ese gruero, y ofrece al siguiente; alerta PROVIDER_BAILED", async () => {
    const { provider: a, others, req } = await enRoute([3]);
    const [b] = others;

    const back = await providerBailout(req.id, a.id, "Falla mecánica", at(60));
    expect(back.status).toBe("SEARCHING");
    expect(back.searchEpoch).toBe(2);
    expect(back.providerId).toBeNull();
    expect(back.assignedBy).toBeNull();
    expect(back.assignedAt).toBeNull();
    expect(back.arrivedAt).toBeNull();
    expect(back.searchStartedAt).toEqual(at(60));
    expect(back.searchDeadlineAt).toEqual(at(60 + minutes(2)));
    expect(await providerStatus(a.id)).toBe("ONLINE");

    // Marca de rechazo del que se bajó (ronda 0) + nueva oferta de la nueva época.
    const marker = back.offers.find((o) => o.round === 0)!;
    expect(marker.providerId).toBe(a.id);
    expect(marker.response).toBe("REJECTED");
    const o2 = mustPending(back);
    expect(o2.providerId).toBe(b.id);
    expect(o2.epoch).toBe(2);
    expect(o2.round).toBe(1);
    expect(o2.expiresAt).toEqual(at(100));

    expect(openAlerts(back)).toHaveLength(1);
    expect(openAlerts(back)[0].reason).toBe("PROVIDER_BAILED");
    expect(eventData(back, "PROVIDER_CANCELLED")).toEqual({ providerId: a.id, reason: "Falla mecánica" });
    expect(eventTypes(back)).toContain("OFFER_SENT");
  });

  it("si nadie más puede → ESCALATED con una sola alerta abierta", async () => {
    const { provider: a, req } = await enRoute();
    const back = await providerBailout(req.id, a.id, undefined, at(60));
    expect(back.status).toBe("ESCALATED");
    expect(back.searchEpoch).toBe(2);
    expect(back.providerId).toBeNull();
    // La escalación nace de la nueva búsqueda vacía; el motivo "se bajó" queda en los eventos.
    expect(back.escalationReason).toBe("NO_PROVIDERS_AVAILABLE");
    expect(openAlerts(back)).toHaveLength(1);
    expect(pendingOffer(back)).toBeNull();
    expect(eventTypes(back)).toEqual(expect.arrayContaining(["PROVIDER_CANCELLED", "ESCALATED"]));
    expect(await providerStatus(a.id)).toBe("ONLINE");
  });

  it("el gruero que se bajó no vuelve a recibir la oferta, ni en la cascada ni tras un reintento del PBX", async () => {
    const operator = await createOperator();
    const { provider: a, others, req } = await enRoute([3]);
    const [b] = others;
    const back = await providerBailout(req.id, a.id, undefined, at(60));
    const escalated = await rejectOffer(mustPending(back).id, b.id, at(65));
    expect(escalated.status).toBe("ESCALATED");
    expect(escalated.escalationReason).toBe("NO_MORE_CANDIDATES");
    expect(escalated.offers.filter((o) => o.providerId === a.id && o.round > 0)).toHaveLength(1); // solo la original

    await prisma.provider.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { lastSeenAt: at(70) } });
    const retried = await retrySearch(req.id, operator.id, at(70));
    expect(retried.status).toBe("ESCALATED"); // a se bajó y b rechazó: nadie elegible
    expect(retried.searchEpoch).toBe(3);
    expect(retried.offers.filter((o) => o.epoch === 3)).toHaveLength(0);
  });

  it("también desde ARRIVED (la llegada se borra); desde IN_PROGRESS → INVALID_STATE", async () => {
    const { provider: a, req } = await enRoute();
    await providerTransition(req.id, a.id, "ARRIVED", undefined, at(60));
    const back = await providerBailout(req.id, a.id, undefined, at(61));
    expect(back.arrivedAt).toBeNull();
    expect(["SEARCHING", "ESCALATED"]).toContain(back.status);

    const second = await enRoute();
    await providerTransition(second.req.id, second.provider.id, "ARRIVED", undefined, at(60));
    await providerTransition(second.req.id, second.provider.id, "IN_PROGRESS", second.req.pin, at(70));
    await expectDispatchError(providerBailout(second.req.id, second.provider.id, undefined, at(80)), "INVALID_STATE", 409);
    expect(await providerStatus(second.provider.id)).toBe("BUSY");
  });

  it("otro proveedor → NOT_YOUR_JOB (403), también si la solicitud no tiene gruero", async () => {
    const { others, req } = await enRoute([3]);
    const [b] = others;
    await expectDispatchError(providerBailout(req.id, b.id, undefined, at(10)), "NOT_YOUR_JOB", 403);
    expect((await loadRequest(req.id))!.status).toBe("EN_ROUTE");

    const searching = await createRequest(await createUser(), towInput(), at(10));
    await expectDispatchError(providerBailout(searching.id, b.id, undefined, at(11)), "NOT_YOUR_JOB", 403);
  });

  it("un externo que se baja vuelve a OFFLINE y se vuelve a pedir ayuda al PBX", async () => {
    const operator = await createOperator();
    const req = await createRequest(await createUser(), towInput(), T0);
    const external = await createProvider({ isExternal: true, status: "OFFLINE", at: null, lastSeenAt: null });
    const assigned = await assignProvider(req.id, external.id, operator.id, at(60));
    expect(openAlerts(assigned)).toHaveLength(0);

    const back = await providerBailout(req.id, external.id, "No llego", at(120));
    expect(back.status).toBe("ESCALATED");
    expect(back.searchEpoch).toBe(2);
    expect(openAlerts(back)).toHaveLength(1);
    expect(await providerStatus(external.id)).toBe("OFFLINE");
  });
});
