/**
 * Flujo completo de grúa a través de la API (sin interfaz): cascada de
 * ofertas, expiración, escalamiento al PBX, asignación externa, seguimiento,
 * PIN y cierre. Corre contra el servidor que levanta playwright.config.ts con
 * ofertas de 6 s para no esperar 40 s.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { OfferView, PbxOverview, ProviderSelf, RequestView } from "@/lib/types";

const PICKUP = { lat: 14.5995, lng: -90.5069, address: "Zona 10" };
const DROPOFF = { lat: 14.6151, lng: -90.5569, address: "Taller zona 11" };
// Teléfonos únicos por corrida: un cliente solo puede tener un servicio activo.
const RUN = String(Date.now()).slice(-4);
const PHONE = (n: number) => `555${n}${RUN}`;

async function json<T>(res: Promise<import("@playwright/test").APIResponse> | import("@playwright/test").APIResponse): Promise<T> {
  const r = await res;
  const body = (await r.json()) as T & { error?: { code: string; message: string } };
  if (!r.ok()) throw new Error(`${r.status()} ${body.error?.code}: ${body.error?.message}`);
  return body;
}

async function clientCtx(playwright: typeof import("@playwright/test"), baseURL: string, phone: string, name: string) {
  const ctx = await playwright.request.newContext({ baseURL });
  await json(ctx.post("/api/auth/client", { data: { phone, name } }));
  return ctx;
}

async function providerCtx(playwright: typeof import("@playwright/test"), baseURL: string, token: string, at: { lat: number; lng: number }) {
  const ctx = await playwright.request.newContext({ baseURL });
  await json(ctx.post("/api/provider/auth", { data: { token } }));
  await json(ctx.post("/api/provider/location", { data: at }));
  await json(ctx.post("/api/provider/status", { data: { status: "ONLINE" } }));
  return ctx;
}

async function pbxCtx(playwright: typeof import("@playwright/test"), baseURL: string) {
  const ctx = await playwright.request.newContext({ baseURL });
  await json(ctx.post("/api/pbx/auth", { data: { password: "e2e-pbx", name: "Operador E2E" } }));
  return ctx;
}

async function pendingOffer(ctx: APIRequestContext): Promise<OfferView | null> {
  const me = await json<ProviderSelf>(ctx.get("/api/provider/me"));
  return me.pendingOffer;
}

test.describe.configure({ mode: "serial" });

test("sin grúas conectadas: escala al PBX, el operador asigna un gruero externo y el servicio se completa con PIN", async ({ playwright, baseURL }) => {
  const client = await clientCtx(playwright, baseURL!, PHONE(1), "Cliente Uno");
  const pbx = await pbxCtx(playwright, baseURL!);

  const req = await json<RequestView>(
    client.post("/api/requests", { data: { kind: "TOW", vehicleKind: "SEDAN", pickup: PICKUP, dropoff: DROPOFF } }),
  );
  expect(req.status).toBe("ESCALATED");
  expect(req.escalation?.reason).toBe("NO_PROVIDERS_AVAILABLE");
  expect(req.pin).toMatch(/^\d{4}$/);
  expect(req.priceTotal).toBe(275 + 8 * 20 + 50); // no socio: +Q50

  const overview = await json<PbxOverview>(pbx.get("/api/pbx/overview"));
  expect(overview.alerts.some((a) => a.requestId === req.id)).toBe(true);

  const assigned = await json<{ request: RequestView; invite: { accessLink: string; whatsapp: string } }>(
    pbx.post(`/api/pbx/requests/${req.id}/assign`, {
      data: { external: { name: "Gruero Externo", phone: "4999-0001", plate: "C111AAA", vehicleLabel: "Plataforma" } },
    }),
  );
  expect(assigned.request.status).toBe("EN_ROUTE");
  expect(assigned.request.assignedBy).toBe("PBX");
  expect(assigned.invite.whatsapp).toContain("wa.me/5024999");
  const token = new URL(assigned.invite.accessLink).searchParams.get("token")!;

  const ext = await playwright.request.newContext({ baseURL });
  const me = await json<ProviderSelf>(ext.post("/api/provider/auth", { data: { token } }));
  expect(me.status).toBe("BUSY");
  expect(me.activeJob?.id).toBe(req.id);
  expect(me.activeJob?.pin).toBeUndefined();
  await json(ext.post("/api/provider/location", { data: { lat: 14.6, lng: -90.51, heading: 90 } }));

  const live = await json<RequestView>(client.get(`/api/requests/${req.id}`));
  expect(live.providerLive?.target).toBe("PICKUP");
  expect(live.provider?.phone).toBe("49990001");

  // Seguimiento público: sin PIN ni teléfonos.
  const share = await json<RequestView>(ext.get(`/api/track/${req.id}`));
  expect(share.pin).toBeUndefined();
  expect(share.client).toBeUndefined();
  expect(share.provider?.phone).toBeUndefined();

  await json(ext.post(`/api/provider/jobs/${req.id}/transition`, { data: { to: "ARRIVED" } }));
  const bad = await ext.post(`/api/provider/jobs/${req.id}/transition`, { data: { to: "IN_PROGRESS", pin: req.pin === "0000" ? "1111" : "0000" } });
  expect(bad.status()).toBe(400);
  await json(ext.post(`/api/provider/jobs/${req.id}/transition`, { data: { to: "IN_PROGRESS", pin: req.pin } }));
  const done = await json<RequestView>(ext.post(`/api/provider/jobs/${req.id}/transition`, { data: { to: "COMPLETED" } }));
  expect(done.status).toBe("COMPLETED");

  const rated = await json<RequestView>(client.post(`/api/requests/${req.id}/rate`, { data: { stars: 5 } }));
  expect(rated.ratings.client).toBe(5);

  // El externo vuelve a OFFLINE: no entra a la cascada sin conectarse él mismo.
  const after = await json<ProviderSelf>(ext.get("/api/provider/me"));
  expect(after.status).toBe("OFFLINE");
});

test("cascada: el más cercano rechaza, el siguiente deja expirar, el tercero acepta; el cliente ve la grúa en vivo", async ({ playwright, baseURL }) => {
  const client = await clientCtx(playwright, baseURL!, PHONE(2), "Cliente Dos");
  const near = await providerCtx(playwright, baseURL!, "tow-zona10", { lat: 14.5995, lng: -90.5069 });
  const mid = await providerCtx(playwright, baseURL!, "tow-zona11", { lat: 14.6151, lng: -90.5569 });
  const far = await providerCtx(playwright, baseURL!, "tow-mixco", { lat: 14.6333, lng: -90.6064 });

  const req = await json<RequestView>(
    client.post("/api/requests", { data: { kind: "TOW", vehicleKind: "SUV", pickup: PICKUP, dropoff: DROPOFF } }),
  );
  expect(req.status).toBe("SEARCHING");
  expect(req.search.currentOffer?.providerName).toBe("Grúas Rodríguez");

  const o1 = await pendingOffer(near);
  expect(o1?.round).toBe(1);
  expect(o1?.payoutQ).toBe(435 - Math.round(435 * 0.1)); // tarifa − 10 % de comisión
  await json(near.post(`/api/provider/offers/${o1!.id}/reject`));

  await expect.poll(async () => (await pendingOffer(mid))?.round ?? null, { timeout: 5_000 }).toBe(2);
  // El segundo no responde: la oferta de 6 s expira y pasa al tercero.
  await expect.poll(async () => (await pendingOffer(far))?.round ?? null, { timeout: 15_000, intervals: [500] }).toBe(3);
  expect(await pendingOffer(mid)).toBeNull();

  const o3 = await pendingOffer(far);
  const accepted = await json<RequestView>(far.post(`/api/provider/offers/${o3!.id}/accept`));
  expect(accepted.status).toBe("EN_ROUTE");
  expect(accepted.client?.name).toBe("Cliente");
  expect(accepted.pin).toBeUndefined();

  await json(far.post("/api/provider/location", { data: { lat: 14.61, lng: -90.55, heading: 120 } }));
  const view = await json<RequestView>(client.get(`/api/requests/${req.id}`));
  expect(view.status).toBe("EN_ROUTE");
  expect(view.provider?.name).toBe("Grúas Mixco 24/7");
  expect(view.providerLive?.etaMinutes).toBeGreaterThan(0);
  expect(view.search.offersSent).toBe(3);

  // Cancelación del cliente con grúa en camino: cargo de Q50 y grúa liberada.
  const cancelled = await json<RequestView>(client.post(`/api/requests/${req.id}/cancel`, { data: { reason: "Ya no la necesito" } }));
  expect(cancelled.status).toBe("CANCELLED");
  expect(cancelled.cancellation?.feeQ).toBe(50);
  const farMe = await json<ProviderSelf>(far.get("/api/provider/me"));
  expect(farMe.status).toBe("ONLINE");

  for (const ctx of [near, mid, far]) await json(ctx.post("/api/provider/status", { data: { status: "OFFLINE" } }));
});

test("el gruero asignado se baja: vuelve a buscar sin él y escala si nadie más puede", async ({ playwright, baseURL }) => {
  const client = await clientCtx(playwright, baseURL!, PHONE(3), "Cliente Tres");
  const only = await providerCtx(playwright, baseURL!, "tow-villanueva", { lat: 14.6, lng: -90.51 });

  const req = await json<RequestView>(
    client.post("/api/requests", { data: { kind: "TOW", vehicleKind: "PICKUP", pickup: PICKUP, dropoff: DROPOFF } }),
  );
  const offer = await pendingOffer(only);
  await json(only.post(`/api/provider/offers/${offer!.id}/accept`));
  const bail = await json<{ requestStatus: string }>(only.post(`/api/provider/jobs/${req.id}/cancel`, { data: { reason: "Falla mecánica" } }));
  expect(bail.requestStatus).toBe("ESCALATED");

  const view = await json<RequestView>(client.get(`/api/requests/${req.id}`));
  expect(view.search.epoch).toBe(2);
  expect(view.provider).toBeNull();
  expect(view.events.map((e) => e.type)).toContain("PROVIDER_CANCELLED");

  const onlyMe = await json<ProviderSelf>(only.get("/api/provider/me"));
  expect(onlyMe.status).toBe("ONLINE");
  await json(client.post(`/api/requests/${req.id}/cancel`, { data: {} }));
  await json(only.post("/api/provider/status", { data: { status: "OFFLINE" } }));
});
