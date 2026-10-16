/**
 * Utilidades compartidas por las pruebas unitarias del motor de despacho.
 *
 * - Reloj fijo: todas las funciones de `dispatch` reciben `now`, así que la
 *   expiración de ofertas (40 s) y el tiempo total de búsqueda (2 min) se
 *   simulan con fechas, sin dormir.
 * - Datos únicos por prueba (teléfonos/tokens con contador) y limpieza de la
 *   BD antes de cada prueba, en orden de dependencias.
 */
import { beforeAll, beforeEach, expect, vi } from "vitest";
import type { Operator, Provider, User } from "@/generated/prisma/client";
import type { ProviderKind, ProviderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { DispatchError, type RequestWithRelations } from "@/lib/dispatch";
import type { LatLng } from "@/lib/geo";
import type { CreateRequestInput } from "@/lib/types";

// ---------- Reloj ----------

/** Instante de referencia de todas las pruebas (15:00 UTC, de día). */
export const T0 = new Date("2026-10-16T15:00:00.000Z");

/** `T0` más `seconds` segundos. */
export function at(seconds: number): Date {
  return new Date(T0.getTime() + seconds * 1000);
}

export function minutes(n: number): number {
  return n * 60;
}

// ---------- Lugares ----------

export const ZONA_10: LatLng = { lat: 14.5995, lng: -90.5069 };
export const ZONA_11: LatLng = { lat: 14.6151, lng: -90.5569 };

export const PICKUP = { ...ZONA_10, address: "Zona 10" };
export const DROPOFF = { ...ZONA_11, address: "Taller zona 11" };

/** Grados de latitud por kilómetro (haversine con R = 6371 km). */
const DEG_PER_KM = 1 / 111.195;

/** Un punto `km` kilómetros al norte de `from` (distancia en línea recta). */
export function northOf(from: LatLng, km: number): LatLng {
  return { lat: from.lat + km * DEG_PER_KM, lng: from.lng };
}

export function towInput(overrides: Partial<CreateRequestInput> = {}): CreateRequestInput {
  return {
    kind: "TOW",
    vehicleKind: "SEDAN",
    vehicleLabel: "Corolla gris",
    plate: "P123ABC",
    pickup: PICKUP,
    dropoff: DROPOFF,
    ...overrides,
  };
}

export function lightInput(kind: Exclude<CreateRequestInput["kind"], "TOW"> = "TIRE"): CreateRequestInput {
  return { kind, vehicleKind: "SEDAN", pickup: PICKUP };
}

// ---------- Datos únicos ----------

let seq = 0;
function next(): string {
  seq += 1;
  return String(seq).padStart(4, "0");
}

export async function createUser(opts: { isMember?: boolean; name?: string; membershipExpiresAt?: Date | null } = {}): Promise<User> {
  const n = next();
  return prisma.user.create({
    data: {
      phone: `5555${n}`,
      name: opts.name ?? `Cliente ${n}`,
      isMember: opts.isMember ?? true,
      membershipExpiresAt: opts.membershipExpiresAt ?? null,
    },
  });
}

export type ProviderOpts = {
  kind?: ProviderKind;
  status?: ProviderStatus;
  /** Ubicación actual; por defecto a 1 km del punto de recogida. */
  at?: LatLng | null;
  /** Último ping; por defecto `T0` (fresco). */
  lastSeenAt?: Date | null;
  isExternal?: boolean;
  name?: string;
};

export async function createProvider(opts: ProviderOpts = {}): Promise<Provider> {
  const n = next();
  const loc = opts.at === undefined ? northOf(ZONA_10, 1) : opts.at;
  return prisma.provider.create({
    data: {
      name: opts.name ?? `Grúa ${n}`,
      phone: `4000${n}`,
      kind: opts.kind ?? "TOW",
      status: opts.status ?? "ONLINE",
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      lastSeenAt: opts.lastSeenAt === undefined ? T0 : opts.lastSeenAt,
      isExternal: opts.isExternal ?? false,
      accessToken: `test-token-${n}`,
      plate: `C${n}XYZ`,
      vehicleLabel: "Grúa de plataforma",
    },
  });
}

/** `count` grúas conectadas a 1, 2, 3… km del punto de recogida (de más cerca a más lejos). */
export async function createProvidersAtKm(kms: number[], opts: ProviderOpts = {}): Promise<Provider[]> {
  const out: Provider[] = [];
  for (const km of kms) {
    out.push(await createProvider({ ...opts, at: northOf(ZONA_10, km), name: opts.name ?? `Grúa a ${km} km` }));
  }
  return out;
}

export async function createOperator(name = "Operador Prueba"): Promise<Operator> {
  return prisma.operator.create({ data: { name } });
}

// ---------- Limpieza ----------

/** Borra todas las filas en orden de dependencias. */
export async function cleanDb(): Promise<void> {
  await prisma.rating.deleteMany();
  await prisma.requestEvent.deleteMany();
  await prisma.escalationAlert.deleteMany();
  await prisma.dispatchOffer.deleteMany();
  await prisma.locationPing.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.operator.deleteMany();
}

/**
 * Registra los hooks estándar de un archivo de pruebas de despacho: BD limpia
 * antes de cada prueba y sin ruido del log de alertas al PBX (`console.warn`).
 */
export function useDispatchFixture(): void {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  beforeEach(async () => {
    await cleanDb();
  });
}

// ---------- Aserciones ----------

/** Espera que `promise` falle con un `DispatchError` del código dado. */
export async function expectDispatchError(promise: Promise<unknown>, code: string, status?: number): Promise<DispatchError> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, `se esperaba DispatchError ${code}`).toBeInstanceOf(DispatchError);
  const e = caught as DispatchError;
  expect(e.code).toBe(code);
  if (status !== undefined) expect(e.status).toBe(status);
  return e;
}

// ---------- Lecturas cómodas ----------

export function pendingOffer(req: RequestWithRelations) {
  return req.offers.find((o) => o.response === "PENDING") ?? null;
}

export function mustPending(req: RequestWithRelations) {
  const o = pendingOffer(req);
  if (!o) throw new Error(`la solicitud ${req.id} no tiene oferta pendiente (estado ${req.status})`);
  return o;
}

export function offerByRound(req: RequestWithRelations, round: number, epoch = req.searchEpoch) {
  const o = req.offers.find((x) => x.round === round && x.epoch === epoch);
  if (!o) throw new Error(`no hay oferta de la ronda ${round} en la época ${epoch}`);
  return o;
}

export function openAlerts(req: RequestWithRelations) {
  return req.alerts.filter((a) => !a.resolvedAt);
}

export function eventTypes(req: RequestWithRelations): string[] {
  return req.events.map((e) => e.type);
}

export function eventData(req: RequestWithRelations, type: string): Record<string, unknown> | null {
  const e = req.events.find((x) => x.type === type);
  if (!e) throw new Error(`no hay evento ${type}`);
  return e.data ? (JSON.parse(e.data) as Record<string, unknown>) : null;
}

export async function providerStatus(id: string): Promise<ProviderStatus> {
  const p = await prisma.provider.findUniqueOrThrow({ where: { id }, select: { status: true } });
  return p.status;
}
