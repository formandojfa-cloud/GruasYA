/**
 * Acciones del operador del PBX: asignación manual (red o externo), reintento
 * de la búsqueda automática, reconocimiento de alertas; y "hablar con un
 * operador" desde la app del cliente.
 */
import { describe, expect, it, test } from "vitest";
import { ACTIVE_STATUSES } from "@/lib/types";
import { prisma } from "@/lib/db";
import {
  acceptOffer,
  acknowledgeAlert,
  advanceRequest,
  assignProvider,
  cancelRequest,
  createRequest,
  loadRequest,
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
  setupDispatchFixture,
} from "./helpers";

setupDispatchFixture();

describe("dispatch.assignProvider (PBX)", () => {
  it("desde ESCALATED → EN_ROUTE asignado por PBX; gruero BUSY; alerta resuelta y reconocida por el operador", async () => {
    const operator = await createOperator("Operadora Uno");
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(req.status).toBe("ESCALATED");
    const p = await createProvider({ status: "OFFLINE", at: null, lastSeenAt: null }); // desconectado: el PBX lo llamó por teléfono

    const assigned = await assignProvider(req.id, p.id, operator.id, at(90));
    expect(assigned.status).toBe("EN_ROUTE");
    expect(assigned.providerId).toBe(p.id);
    expect(assigned.assignedBy).toBe("PBX");
    expect(assigned.assignedAt).toEqual(at(90));
    expect(assigned.escalatedAt).toEqual(T0); // el historial conserva que se escaló
    expect(await providerStatus(p.id)).toBe("BUSY");

    expect(assigned.alerts).toHaveLength(1);
    const alert = assigned.alerts[0];
    expect(alert.resolvedAt).toEqual(at(90));
    expect(alert.acknowledgedAt).toEqual(at(90));
    expect(alert.acknowledgedById).toBe(operator.id);
    expect(alert.acknowledgedBy?.name).toBe("Operadora Uno");
    expect(eventData(assigned, "ASSIGNED")).toEqual({ providerId: p.id, by: "PBX", operatorId: operator.id, external: false });
  });

  it("un gruero BUSY → PROVIDER_BUSY (409) y la solicitud sigue escalada", async () => {
    const operator = await createOperator();
    const busy = await createProvider({ status: "BUSY" });
    const req = await createRequest(await createUser(), towInput(), T0);
    await expectDispatchError(assignProvider(req.id, busy.id, operator.id, at(10)), "PROVIDER_BUSY", 409);
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("ESCALATED");
    expect(openAlerts(fresh)).toHaveLength(1);
  });

  it("un motorista para una grúa → PROVIDER_KIND_MISMATCH (409)", async () => {
    const operator = await createOperator();
    const moto = await createProvider({ kind: "MOTO" });
    const req = await createRequest(await createUser(), towInput(), T0);
    await expectDispatchError(assignProvider(req.id, moto.id, operator.id, at(10)), "PROVIDER_KIND_MISMATCH", 409);
    expect(await providerStatus(moto.id)).toBe("ONLINE");
  });

  it("solo se asigna en SEARCHING o ESCALATED: EN_ROUTE, COMPLETED y CANCELLED → INVALID_STATE (409)", async () => {
    const operator = await createOperator();
    const [a] = await createProvidersAtKm([1]);
    const spare = await createProvider({ status: "OFFLINE", at: null, lastSeenAt: null });
    const req = await createRequest(await createUser(), towInput(), T0);
    await acceptOffer(mustPending(req).id, a.id, at(5));
    await expectDispatchError(assignProvider(req.id, spare.id, operator.id, at(10)), "INVALID_STATE", 409);

    await providerTransition(req.id, a.id, "ARRIVED", undefined, at(20));
    await providerTransition(req.id, a.id, "IN_PROGRESS", req.pin, at(30));
    await providerTransition(req.id, a.id, "COMPLETED", undefined, at(40));
    await expectDispatchError(assignProvider(req.id, spare.id, operator.id, at(50)), "INVALID_STATE", 409);

    const other = await createRequest(await createUser(), towInput(), at(60));
    await cancelRequest(other.id, "PBX", undefined, at(61), { operatorId: operator.id });
    await expectDispatchError(assignProvider(other.id, spare.id, operator.id, at(62)), "INVALID_STATE", 409);
    expect(await providerStatus(spare.id)).toBe("OFFLINE");
  });

  it("desde SEARCHING con oferta pendiente: la oferta se retira (WITHDRAWN) y el otro gruero sigue libre", async () => {
    const operator = await createOperator();
    const [a] = await createProvidersAtKm([1]);
    const manual = await createProvider({ status: "ONLINE", at: null, lastSeenAt: null });
    const req = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(req);
    expect(o1.providerId).toBe(a.id);

    const assigned = await assignProvider(req.id, manual.id, operator.id, at(10));
    expect(assigned.status).toBe("EN_ROUTE");
    expect(assigned.providerId).toBe(manual.id);
    expect(offerByRound(assigned, 1).response).toBe("WITHDRAWN");
    expect(offerByRound(assigned, 1).respondedAt).toEqual(at(10));
    expect(pendingOffer(assigned)).toBeNull();
    expect(await providerStatus(a.id)).toBe("ONLINE");
    expect(await providerStatus(manual.id)).toBe("BUSY");
    expect(assigned.alerts).toHaveLength(0); // nunca se escaló
  });

  it("proveedor inexistente → PROVIDER_NOT_FOUND (404); solicitud inexistente → REQUEST_NOT_FOUND (404)", async () => {
    const operator = await createOperator();
    const req = await createRequest(await createUser(), towInput(), T0);
    await expectDispatchError(assignProvider(req.id, "no-existe", operator.id, at(1)), "PROVIDER_NOT_FOUND", 404);
    const p = await createProvider();
    await expectDispatchError(assignProvider("no-existe", p.id, operator.id, at(1)), "REQUEST_NOT_FOUND", 404);
  });

  it("un gruero externo queda marcado como tal en el evento", async () => {
    const operator = await createOperator();
    const req = await createRequest(await createUser(), towInput(), T0);
    const external = await createProvider({ isExternal: true, status: "OFFLINE", at: null, lastSeenAt: null });
    const assigned = await assignProvider(req.id, external.id, operator.id, at(10));
    expect(eventData(assigned, "ASSIGNED")).toMatchObject({ by: "PBX", external: true });
  });

  // TODO(backbone): assignProvider no retira las ofertas PENDING que el gruero
  // asignado tenga en OTRAS solicitudes, y acceptOffer no comprueba que el
  // gruero no esté BUSY. Resultado: el PBX asigna a A (BUSY) y A todavía puede
  // aceptar su oferta pendiente de otra solicitud → dos servicios activos con
  // el mismo gruero. Esperado: al asignarlo, sus ofertas pendientes en otras
  // solicitudes deberían rechazarse (y esas cascadas seguir), o acceptOffer
  // debería fallar para un gruero BUSY. Ver informe.
  test.fails("un gruero asignado a mano por el PBX no puede aceptar una oferta pendiente de otra solicitud", async () => {
    const operator = await createOperator();
    const [a] = await createProvidersAtKm([1]);
    const r1 = await createRequest(await createUser(), towInput(), T0);
    const o1 = mustPending(r1);
    expect(o1.providerId).toBe(a.id);
    const r2 = await createRequest(await createUser(), towInput(), at(1));
    expect(r2.status).toBe("ESCALATED"); // a ya tiene una oferta pendiente

    await assignProvider(r2.id, a.id, operator.id, at(2));
    expect(await providerStatus(a.id)).toBe("BUSY");

    await expectDispatchError(acceptOffer(o1.id, a.id, at(3)), "OFFER_UNAVAILABLE", 409);
    const activeJobs = await prisma.serviceRequest.count({ where: { providerId: a.id, status: { in: [...ACTIVE_STATUSES] } } });
    expect(activeJobs).toBe(1);
  });
});

describe("dispatch.retrySearch (PBX)", () => {
  it("solo desde ESCALATED: SEARCHING y EN_ROUTE → INVALID_STATE (409)", async () => {
    const operator = await createOperator();
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(req.status).toBe("SEARCHING");
    await expectDispatchError(retrySearch(req.id, operator.id, at(5)), "INVALID_STATE", 409);
    await acceptOffer(mustPending(req).id, a.id, at(6));
    await expectDispatchError(retrySearch(req.id, operator.id, at(7)), "INVALID_STATE", 409);
    expect((await loadRequest(req.id))!.searchEpoch).toBe(1);
    await expectDispatchError(retrySearch("no-existe", operator.id, at(7)), "REQUEST_NOT_FOUND", 404);
  });

  it("relanza la búsqueda: época 2, plazo nuevo de 2 min, oferta al gruero que ya se conectó; la alerta sigue abierta hasta que alguien acepte", async () => {
    const operator = await createOperator();
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(req.status).toBe("ESCALATED");
    const p = await createProvider({ lastSeenAt: at(minutes(5)) });

    const retried = await retrySearch(req.id, operator.id, at(minutes(5)));
    expect(retried.status).toBe("SEARCHING");
    expect(retried.searchEpoch).toBe(2);
    expect(retried.searchStartedAt).toEqual(at(minutes(5)));
    expect(retried.searchDeadlineAt).toEqual(at(minutes(7)));
    const offer = mustPending(retried);
    expect(offer.providerId).toBe(p.id);
    expect(offer.epoch).toBe(2);
    expect(offer.round).toBe(1);
    expect(offer.expiresAt).toEqual(at(minutes(5) + 40));
    expect(eventData(retried, "SEARCH_RESTARTED")).toEqual({ operatorId: operator.id, epoch: 2 });
    expect(openAlerts(retried)).toHaveLength(1);

    const accepted = await acceptOffer(offer.id, p.id, at(minutes(5) + 10));
    expect(openAlerts(accepted)).toHaveLength(0);
  });

  it("si sigue sin haber nadie → vuelve a ESCALATED, reutiliza la alerta abierta y la época sube igual", async () => {
    const operator = await createOperator();
    const req = await createRequest(await createUser(), towInput(), T0);
    const again = await retrySearch(req.id, operator.id, at(60));
    expect(again.status).toBe("ESCALATED");
    expect(again.searchEpoch).toBe(2);
    expect(again.escalationReason).toBe("NO_PROVIDERS_AVAILABLE");
    expect(again.escalatedAt).toEqual(at(60));
    expect(again.alerts).toHaveLength(1);
    expect(openAlerts(again)).toHaveLength(1);
    expect(eventTypes(again).filter((t) => t === "ESCALATED")).toHaveLength(2);

    const third = await retrySearch(req.id, operator.id, at(120));
    expect(third.searchEpoch).toBe(3);
    expect(third.alerts).toHaveLength(1);
  });

  it("un gruero cuya oferta EXPIRÓ puede recibirla otra vez; uno que RECHAZÓ, no", async () => {
    const operator = await createOperator();
    const [expired, rejected] = await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(mustPending(req).providerId).toBe(expired.id);
    const s2 = (await advanceRequest(req.id, at(40)))!;
    expect(mustPending(s2).providerId).toBe(rejected.id);
    const esc = await rejectOffer(mustPending(s2).id, rejected.id, at(45));
    expect(esc.status).toBe("ESCALATED");
    expect(esc.escalationReason).toBe("NO_MORE_CANDIDATES");

    await prisma.provider.updateMany({ where: { id: { in: [expired.id, rejected.id] } }, data: { lastSeenAt: at(100) } });
    const retried = await retrySearch(req.id, operator.id, at(100));
    expect(retried.status).toBe("SEARCHING");
    const o = mustPending(retried);
    expect(o.providerId).toBe(expired.id);
    expect(o.epoch).toBe(2);
    expect(o.round).toBe(1);

    // Si el que expiró vuelve a dejarla vencer, el que rechazó no entra: se escala.
    const end = (await advanceRequest(req.id, at(140)))!;
    expect(end.status).toBe("ESCALATED");
    expect(end.escalationReason).toBe("NO_MORE_CANDIDATES");
    expect(end.offers.filter((x) => x.providerId === rejected.id)).toHaveLength(1);
  });
});

describe("dispatch.acknowledgeAlert", () => {
  it("marca la alerta como atendida por el operador y no la sobreescribe otro operador", async () => {
    const op1 = await createOperator("Op 1");
    const op2 = await createOperator("Op 2");
    const req = await createRequest(await createUser(), towInput(), T0);
    const alert = req.alerts[0];
    await acknowledgeAlert(alert.id, op1.id, at(10));
    await acknowledgeAlert(alert.id, op2.id, at(20));
    const fresh = await prisma.escalationAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(fresh.acknowledgedAt).toEqual(at(10));
    expect(fresh.acknowledgedById).toBe(op1.id);
    expect(fresh.resolvedAt).toBeNull(); // reconocer no es resolver
  });
});

describe("dispatch.requestOperatorHelp", () => {
  it("mientras busca → ESCALATED con CLIENT_REQUESTED_OPERATOR y la oferta pendiente se retira", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(mustPending(req).providerId).toBe(a.id);

    const esc = await requestOperatorHelp(req.id, at(15));
    expect(esc.status).toBe("ESCALATED");
    expect(esc.escalationReason).toBe("CLIENT_REQUESTED_OPERATOR");
    expect(esc.escalatedAt).toEqual(at(15));
    expect(offerByRound(esc, 1).response).toBe("WITHDRAWN");
    expect(pendingOffer(esc)).toBeNull();
    expect(openAlerts(esc)).toHaveLength(1);
    expect(openAlerts(esc)[0].reason).toBe("CLIENT_REQUESTED_OPERATOR");
    expect(eventTypes(esc).at(-1)).toBe("ESCALATED");
    expect(await providerStatus(a.id)).toBe("ONLINE");
  });

  it("con grúa en camino → sigue EN_ROUTE, abre una alerta CLIENT_NEEDS_HELP; repetirlo no duplica", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await acceptOffer(mustPending(req).id, a.id, at(5));

    const helped = await requestOperatorHelp(req.id, at(60));
    expect(helped.status).toBe("EN_ROUTE");
    expect(helped.providerId).toBe(a.id);
    expect(helped.escalatedAt).toBeNull();
    expect(helped.alerts).toHaveLength(1);
    expect(helped.alerts[0].reason).toBe("CLIENT_NEEDS_HELP");
    expect(helped.alerts[0].createdAt).toEqual(at(60));
    expect(helped.alerts[0].resolvedAt).toBeNull();
    expect(eventData(helped, "HELP_REQUESTED")).toEqual({ alertId: helped.alerts[0].id });

    const again = await requestOperatorHelp(req.id, at(70));
    expect(again.alerts).toHaveLength(1);
    expect(eventTypes(again).filter((t) => t === "HELP_REQUESTED")).toHaveLength(1);
    expect(await providerStatus(a.id)).toBe("BUSY");
  });

  it("funciona igual en ARRIVED e IN_PROGRESS", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await acceptOffer(mustPending(req).id, a.id, at(5));
    await providerTransition(req.id, a.id, "ARRIVED", undefined, at(60));
    await providerTransition(req.id, a.id, "IN_PROGRESS", req.pin, at(70));
    const helped = await requestOperatorHelp(req.id, at(80));
    expect(helped.status).toBe("IN_PROGRESS");
    expect(openAlerts(helped)).toHaveLength(1);
  });

  it("si ya está escalada no abre otra alerta; si ya terminó → REQUEST_NOT_ACTIVE (409)", async () => {
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(req.status).toBe("ESCALATED");
    const same = await requestOperatorHelp(req.id, at(10));
    expect(same.alerts).toHaveLength(1);
    expect(same.escalationReason).toBe("NO_PROVIDERS_AVAILABLE");

    await cancelRequest(req.id, "CLIENT", undefined, at(20));
    await expectDispatchError(requestOperatorHelp(req.id, at(30)), "REQUEST_NOT_ACTIVE", 409);
    await expectDispatchError(requestOperatorHelp("no-existe", at(30)), "REQUEST_NOT_FOUND", 404);
  });
});
