/**
 * Lado del proveedor y del servidor: conectarse/desconectarse, pings de
 * ubicación, el ticker (`advanceAll`) y las calificaciones.
 */
import { describe, expect, it } from "vitest";
import { DISPATCH } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  acceptOffer,
  advanceAll,
  advanceRequest,
  cancelRequest,
  createRequest,
  loadRequest,
  providerTransition,
  rateRequest,
  recordProviderLocation,
  setProviderStatus,
} from "@/lib/dispatch";
import { toH3Cell } from "@/lib/geo";
import { providerRating } from "@/lib/views";
import {
  at,
  createProvider,
  createProvidersAtKm,
  createUser,
  eventData,
  eventTypes,
  expectDispatchError,
  minutes,
  mustPending,
  northOf,
  offerByRound,
  openAlerts,
  providerStatus,
  T0,
  towInput,
  setupDispatchFixture,
  ZONA_10,
} from "./helpers";

setupDispatchFixture();

describe("dispatch.setProviderStatus", () => {
  it("OFFLINE → ONLINE actualiza lastSeenAt; ONLINE → OFFLINE lo conserva", async () => {
    const p = await createProvider({ status: "OFFLINE", lastSeenAt: at(-minutes(30)) });
    const online = await setProviderStatus(p.id, "ONLINE", T0);
    expect(online.status).toBe("ONLINE");
    expect(online.lastSeenAt).toEqual(T0);

    const offline = await setProviderStatus(p.id, "OFFLINE", at(60));
    expect(offline.status).toBe("OFFLINE");
    expect(offline.lastSeenAt).toEqual(T0);

    const same = await setProviderStatus(p.id, "OFFLINE", at(70));
    expect(same.status).toBe("OFFLINE");
  });

  it("un gruero BUSY no puede cambiar de estado (PROVIDER_BUSY, 409)", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await acceptOffer(mustPending(req).id, a.id, at(5));
    await expectDispatchError(setProviderStatus(a.id, "OFFLINE", at(10)), "PROVIDER_BUSY", 409);
    await expectDispatchError(setProviderStatus(a.id, "ONLINE", at(10)), "PROVIDER_BUSY", 409);
    expect(await providerStatus(a.id)).toBe("BUSY");
    await expectDispatchError(setProviderStatus("no-existe", "ONLINE", at(10)), "PROVIDER_NOT_FOUND", 404);
  });

  it("desconectarse con una oferta pendiente la rechaza y la cascada sigue con el siguiente", async () => {
    const [a, b] = await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    expect(mustPending(req).providerId).toBe(a.id);

    const off = await setProviderStatus(a.id, "OFFLINE", at(10));
    expect(off.status).toBe("OFFLINE");
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("SEARCHING");
    expect(offerByRound(fresh, 1).response).toBe("REJECTED");
    expect(offerByRound(fresh, 1).respondedAt).toEqual(at(10));
    const o2 = mustPending(fresh);
    expect(o2.providerId).toBe(b.id);
    expect(o2.round).toBe(2);
    expect(o2.expiresAt).toEqual(at(50));
    expect(eventTypes(fresh)).toContain("OFFER_REJECTED");
    expect(await prisma.dispatchOffer.count({ where: { providerId: a.id, response: "PENDING" } })).toBe(0);
  });

  it("desconectarse siendo el único candidato escala la solicitud al PBX", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await setProviderStatus(a.id, "OFFLINE", at(10));
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("ESCALATED");
    expect(fresh.escalationReason).toBe("NO_MORE_CANDIDATES");
    expect(openAlerts(fresh)).toHaveLength(1);
  });
});

describe("dispatch.recordProviderLocation", () => {
  it("actualiza posición, rumbo, celda H3 y lastSeenAt, y guarda el ping", async () => {
    const p = await createProvider({ at: null, lastSeenAt: null });
    const here = northOf(ZONA_10, 2);
    const updated = await recordProviderLocation(p.id, { ...here, heading: 135 }, at(30));
    expect(updated.lat).toBe(here.lat);
    expect(updated.lng).toBe(here.lng);
    expect(updated.heading).toBe(135);
    expect(updated.h3Cell).toBe(toH3Cell(here));
    expect(updated.lastSeenAt).toEqual(at(30));

    const pings = await prisma.locationPing.findMany({ where: { providerId: p.id } });
    expect(pings).toHaveLength(1);
    expect(pings[0]).toMatchObject({ lat: here.lat, lng: here.lng, heading: 135, at: at(30) });

    const noHeading = await recordProviderLocation(p.id, ZONA_10, at(40));
    expect(noHeading.heading).toBeNull();
    expect(await prisma.locationPing.count({ where: { providerId: p.id } })).toBe(2);
  });

  it("un ping fresco vuelve a hacer candidato a un gruero que estaba sin señal", async () => {
    const stale = await createProvider({ lastSeenAt: at(-minutes(5)) });
    const r1 = await createRequest(await createUser(), towInput(), T0);
    expect(r1.status).toBe("ESCALATED");
    await recordProviderLocation(stale.id, northOf(ZONA_10, 1), at(1));
    const r2 = await createRequest(await createUser(), towInput(), at(2));
    expect(r2.status).toBe("SEARCHING");
    expect(mustPending(r2).providerId).toBe(stale.id);
  });
});

describe("dispatch.advanceAll (ticker)", () => {
  it("avanza las ofertas vencidas de todas las búsquedas", async () => {
    const [a, b] = await createProvidersAtKm([1, 2, 3, 4]);
    const r1 = await createRequest(await createUser(), towInput(), T0);
    const r2 = await createRequest(await createUser(), towInput(), T0);
    expect(mustPending(r1).providerId).toBe(a.id);
    expect(mustPending(r2).providerId).toBe(b.id);

    const result = await advanceAll(at(40));
    expect(result.advanced).toBe(2);
    for (const id of [r1.id, r2.id]) {
      const fresh = (await loadRequest(id))!;
      expect(fresh.status).toBe("SEARCHING");
      expect(fresh.offers).toHaveLength(2);
      expect(offerByRound(fresh, 1).response).toBe("EXPIRED");
      const o2 = mustPending(fresh);
      expect(o2.round).toBe(2);
      expect(o2.providerId).not.toBe(offerByRound(fresh, 1).providerId);
      expect(o2.expiresAt).toEqual(at(80));
    }
    // Nunca dos ofertas pendientes para el mismo gruero.
    const pend = await prisma.dispatchOffer.findMany({ where: { response: "PENDING" } });
    expect(new Set(pend.map((o) => o.providerId)).size).toBe(2);
  });

  it("no toca ofertas vigentes ni solicitudes que no están buscando", async () => {
    const [a] = await createProvidersAtKm([1, 2]);
    const searching = await createRequest(await createUser(), towInput(), T0);
    const assigned = await createRequest(await createUser(), towInput(), T0);
    expect(mustPending(assigned).providerId).not.toBe(a.id);
    await acceptOffer(mustPending(assigned).id, mustPending(assigned).providerId, at(2));

    const result = await advanceAll(at(30));
    expect(result.advanced).toBe(1);
    const s = (await loadRequest(searching.id))!;
    expect(s.offers).toHaveLength(1);
    expect(mustPending(s).response).toBe("PENDING");
    expect((await loadRequest(assigned.id))!.status).toBe("EN_ROUTE");
  });

  it("pasa a OFFLINE a los ONLINE sin ping en 10 min (o sin ping nunca); respeta BUSY y a los frescos", async () => {
    expect(DISPATCH.providerOfflineAfterMs).toBe(minutes(10) * 1000);
    const stale = await createProvider({ lastSeenAt: at(-minutes(11)) });
    const never = await createProvider({ lastSeenAt: null });
    const fresh = await createProvider({ lastSeenAt: at(-minutes(9)) });
    const busyStale = await createProvider({ status: "BUSY", lastSeenAt: at(-minutes(30)) });
    const alreadyOff = await createProvider({ status: "OFFLINE", lastSeenAt: at(-minutes(30)) });

    const result = await advanceAll(T0);
    expect(result.offlined).toBe(2);
    expect(await providerStatus(stale.id)).toBe("OFFLINE");
    expect(await providerStatus(never.id)).toBe("OFFLINE");
    expect(await providerStatus(fresh.id)).toBe("ONLINE");
    expect(await providerStatus(busyStale.id)).toBe("BUSY");
    expect(await providerStatus(alreadyOff.id)).toBe("OFFLINE");

    // Un minuto después, el que estaba fresco también cae.
    expect((await advanceAll(at(minutes(1) + 1))).offlined).toBe(1);
    expect(await providerStatus(fresh.id)).toBe("OFFLINE");
  });

  it("borra el historial de ubicación de más de 24 h y conserva el reciente", async () => {
    const p = await createProvider();
    await recordProviderLocation(p.id, ZONA_10, at(-25 * 3600));
    await recordProviderLocation(p.id, ZONA_10, at(-23 * 3600));
    await recordProviderLocation(p.id, ZONA_10, at(-60));
    await advanceAll(T0);
    const left = await prisma.locationPing.findMany({ where: { providerId: p.id }, orderBy: { at: "asc" } });
    expect(left.map((x) => x.at)).toEqual([at(-23 * 3600), at(-60)]);
  });

  it("una búsqueda que ya agotó su plazo se escala desde el ticker", async () => {
    await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await advanceAll(at(minutes(2)));
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.status).toBe("ESCALATED");
    expect(fresh.escalationReason).toBe("SEARCH_TIMEOUT");
  });
});

describe("dispatch.rateRequest", () => {
  /** Servicio completo con `provider` para `user` (termina en `base` + 60 s). */
  async function completedJob(provider: { id: string }, base: number) {
    const user = await createUser();
    // Ping fresco: si no, tras el salto de tiempo el gruero ya no es candidato.
    await prisma.provider.update({ where: { id: provider.id }, data: { lastSeenAt: at(base) } });
    const req = await createRequest(user, towInput(), at(base));
    const offer = mustPending(req);
    expect(offer.providerId).toBe(provider.id);
    await acceptOffer(offer.id, provider.id, at(base + 5));
    await providerTransition(req.id, provider.id, "ARRIVED", undefined, at(base + 20));
    await providerTransition(req.id, provider.id, "IN_PROGRESS", req.pin, at(base + 30));
    const done = await providerTransition(req.id, provider.id, "COMPLETED", undefined, at(base + 60));
    expect(done.status).toBe("COMPLETED");
    return done;
  }

  it("solo se califica un servicio COMPLETED (NOT_COMPLETED, 409)", async () => {
    const [a] = await createProvidersAtKm([1]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await acceptOffer(mustPending(req).id, a.id, at(5));
    await expectDispatchError(rateRequest(req.id, "CLIENT", 5, undefined, at(10)), "NOT_COMPLETED", 409);
    await cancelRequest(req.id, "PBX", undefined, at(20));
    await expectDispatchError(rateRequest(req.id, "CLIENT", 5, undefined, at(30)), "NOT_COMPLETED", 409);
    await expectDispatchError(rateRequest("no-existe", "CLIENT", 5, undefined, at(30)), "REQUEST_NOT_FOUND", 404);
    expect(await prisma.rating.count()).toBe(0);
  });

  it("la calificación del cliente recalcula ratingSum/ratingCount del gruero y deja un evento", async () => {
    const [a] = await createProvidersAtKm([1]);
    const done = await completedJob(a, 0);
    await rateRequest(done.id, "CLIENT", 5, "Excelente", at(100));

    const p = await prisma.provider.findUniqueOrThrow({ where: { id: a.id } });
    expect(p.ratingSum).toBe(5);
    expect(p.ratingCount).toBe(1);
    expect(providerRating(p)).toBe(5);
    const fresh = (await loadRequest(done.id))!;
    expect(fresh.ratings).toHaveLength(1);
    expect(fresh.ratings[0]).toMatchObject({ byRole: "CLIENT", stars: 5, comment: "Excelente", createdAt: at(100) });
    expect(eventData(fresh, "RATED")).toEqual({ byRole: "CLIENT", stars: 5 });
  });

  it("volver a calificar reemplaza (upsert) y no cuenta doble", async () => {
    const [a] = await createProvidersAtKm([1]);
    const done = await completedJob(a, 0);
    await rateRequest(done.id, "CLIENT", 5, "Excelente", at(100));
    await rateRequest(done.id, "CLIENT", 3, undefined, at(110));

    const p = await prisma.provider.findUniqueOrThrow({ where: { id: a.id } });
    expect(p.ratingSum).toBe(3);
    expect(p.ratingCount).toBe(1);
    const ratings = await prisma.rating.findMany({ where: { requestId: done.id } });
    expect(ratings).toHaveLength(1);
    expect(ratings[0].stars).toBe(3);
    expect(ratings[0].comment).toBeNull();
  });

  it("varios servicios del mismo gruero se acumulan; el promedio se redondea a 1 decimal", async () => {
    const [a] = await createProvidersAtKm([1]);
    const first = await completedJob(a, 0);
    const second = await completedJob(a, 1000);
    const third = await completedJob(a, 2000);
    await rateRequest(first.id, "CLIENT", 4, undefined, at(3000));
    await rateRequest(second.id, "CLIENT", 5, undefined, at(3001));
    await rateRequest(third.id, "CLIENT", 4, undefined, at(3002));
    const p = await prisma.provider.findUniqueOrThrow({ where: { id: a.id } });
    expect(p.ratingSum).toBe(13);
    expect(p.ratingCount).toBe(3);
    expect(providerRating(p)).toBe(4.3);
  });

  it("la calificación del gruero hacia el cliente se guarda aparte y no afecta su propio promedio", async () => {
    const [a] = await createProvidersAtKm([1]);
    const done = await completedJob(a, 0);
    await rateRequest(done.id, "PROVIDER", 2, "Cliente impuntual", at(100));
    const p = await prisma.provider.findUniqueOrThrow({ where: { id: a.id } });
    expect(p.ratingSum).toBe(0);
    expect(p.ratingCount).toBe(0);
    expect(providerRating(p)).toBeNull();
    const fresh = (await loadRequest(done.id))!;
    expect(fresh.ratings.map((r) => r.byRole)).toEqual(["PROVIDER"]);
    // Ambas partes pueden calificar el mismo servicio.
    await rateRequest(done.id, "CLIENT", 5, undefined, at(110));
    expect((await loadRequest(done.id))!.ratings).toHaveLength(2);
  });
});

describe("dispatch.advanceRequest + ticker: sin duplicar ofertas", () => {
  it("el ticker y la lectura del cliente a la vez producen una sola oferta nueva", async () => {
    await createProvidersAtKm([1, 2]);
    const req = await createRequest(await createUser(), towInput(), T0);
    await Promise.all([advanceAll(at(40)), advanceRequest(req.id, at(40)), advanceRequest(req.id, at(40))]);
    const fresh = (await loadRequest(req.id))!;
    expect(fresh.offers).toHaveLength(2);
    expect(fresh.offers.filter((o) => o.response === "PENDING")).toHaveLength(1);
  });
});
