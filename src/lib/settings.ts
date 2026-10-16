/**
 * Ajustes editables en vivo (fila única `Settings`, id "default"): tarifa,
 * despacho e interruptores. `getSettings()` lee con caché de 5 s por proceso;
 * `updateSettings()` escribe y refresca la caché; `peekSettings()` devuelve lo
 * último leído (o los defaults) sin tocar la BD, para código sincrónico.
 */
import { z } from "zod";
import type { Settings as SettingsRow } from "@/generated/prisma/client";
import type { Weather } from "@/generated/prisma/enums";
import { DISPATCH, FLAG_DEFAULTS, TARIFF_DEFAULTS } from "./config";
import { prisma } from "./db";
import type { Tariff } from "./pricing";

export const SETTINGS_ID = "default";
const CACHE_MS = 5_000;

export type DispatchSettings = {
  offerSeconds: number;
  radiiKm: number[];
  locationFreshMs: number;
  rechazosParaPausar: number;
  searchTimeoutMs: number;
  maxOffers: number;
};

export type Flags = {
  weather: Weather;
  shareContactNumbers: boolean;
  requireLoadPhotos: boolean;
  requirePin: boolean;
  identityRequiredForTow: boolean;
};

export type AppSettings = {
  tariff: Tariff;
  dispatch: DispatchSettings;
  flags: Flags;
  updatedAt: string | null;
};

/** Lo que las interfaces públicas necesitan (`GET /api/config`). */
export type PublicConfig = {
  tariff: Tariff;
  flags: Flags;
  dispatch: Pick<DispatchSettings, "offerSeconds" | "radiiKm">;
};

export const DEFAULT_TARIFF: Tariff = {
  banderazo: TARIFF_DEFAULTS.banderazo,
  kmIncluidos: TARIFF_DEFAULTS.kmIncluidos,
  precioKm: TARIFF_DEFAULTS.precioKm,
  minutosIncluidos: TARIFF_DEFAULTS.minutosIncluidos,
  precioMinuto: TARIFF_DEFAULTS.precioMinuto,
  factorVehiculo: {
    moto: TARIFF_DEFAULTS.factorMoto,
    carro: TARIFF_DEFAULTS.factorCarro,
    pickup: TARIFF_DEFAULTS.factorPickup,
  },
  recargoNocturno: TARIFF_DEFAULTS.recargoNocturno,
  horaNocheInicio: TARIFF_DEFAULTS.horaNocheInicio,
  horaNocheFin: TARIFF_DEFAULTS.horaNocheFin,
  recargoLluvia: TARIFF_DEFAULTS.recargoLluvia,
  recargoLluviaFuerte: TARIFF_DEFAULTS.recargoLluviaFuerte,
  comision: TARIFF_DEFAULTS.comision,
  fraccionCancelacion: TARIFF_DEFAULTS.fraccionCancelacion,
  nonMemberTowFeeQ: TARIFF_DEFAULTS.nonMemberTowFeeQ,
  lightNonMemberFlatQ: TARIFF_DEFAULTS.lightNonMemberFlatQ,
  freeCancelMinutes: TARIFF_DEFAULTS.freeCancelMinutes,
};

export const DEFAULT_SETTINGS: AppSettings = {
  tariff: DEFAULT_TARIFF,
  dispatch: {
    offerSeconds: DISPATCH.offerSeconds,
    radiiKm: [...DISPATCH.radiiKm],
    locationFreshMs: DISPATCH.providerStaleMs,
    rechazosParaPausar: DISPATCH.rechazosParaPausar,
    searchTimeoutMs: DISPATCH.searchTimeoutMs,
    maxOffers: DISPATCH.maxOffersPerEpoch,
  },
  flags: { ...FLAG_DEFAULTS },
  updatedAt: null,
};

// ---------- Validación (PATCH /api/pbx/settings) ----------

const mult = z.number().min(1).max(3);

export const SettingsPatchSchema = z
  .object({
    tariff: z
      .object({
        banderazo: z.number().int().min(0).max(5000),
        kmIncluidos: z.number().min(0).max(200),
        precioKm: z.number().min(0).max(500),
        minutosIncluidos: z.number().min(0).max(600),
        precioMinuto: z.number().min(0).max(100),
        factorVehiculo: z
          .object({ moto: z.number().min(0.1).max(3), carro: z.number().min(0.1).max(3), pickup: z.number().min(0.1).max(3) })
          .partial(),
        recargoNocturno: mult,
        horaNocheInicio: z.number().int().min(0).max(23),
        horaNocheFin: z.number().int().min(0).max(23),
        recargoLluvia: mult,
        recargoLluviaFuerte: mult,
        comision: z.number().min(0).max(0.5),
        fraccionCancelacion: z.number().min(0).max(1),
        nonMemberTowFeeQ: z.number().int().min(0).max(1000),
        lightNonMemberFlatQ: z.number().int().min(0).max(2000),
        freeCancelMinutes: z.number().int().min(0).max(60),
      })
      .partial()
      .optional(),
    dispatch: z
      .object({
        offerSeconds: z.number().int().min(15).max(600),
        radiiKm: z.array(z.number().min(1).max(100)).min(1).max(6),
        locationFreshMs: z.number().int().min(10_000).max(3_600_000),
        rechazosParaPausar: z.number().int().min(1).max(20),
        searchTimeoutMs: z.number().int().min(30_000).max(3_600_000),
        maxOffers: z.number().int().min(1).max(30),
      })
      .partial()
      .optional(),
    flags: z
      .object({
        weather: z.enum(["NONE", "RAIN", "HEAVY_RAIN"]),
        shareContactNumbers: z.boolean(),
        requireLoadPhotos: z.boolean(),
        requirePin: z.boolean(),
        identityRequiredForTow: z.boolean(),
      })
      .partial()
      .optional(),
  })
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

// ---------- Conversión fila ↔ objeto ----------

function parseRadii(raw: string): number[] {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr) && arr.every((n) => typeof n === "number" && n > 0)) return arr as number[];
  } catch {
    // se usa el default
  }
  return [...DISPATCH.radiiKm];
}

export function rowToSettings(row: SettingsRow): AppSettings {
  return {
    tariff: {
      banderazo: row.banderazo,
      kmIncluidos: row.kmIncluidos,
      precioKm: row.precioKm,
      minutosIncluidos: row.minutosIncluidos,
      precioMinuto: row.precioMinuto,
      factorVehiculo: { moto: row.factorMoto, carro: row.factorCarro, pickup: row.factorPickup },
      recargoNocturno: row.recargoNocturno,
      horaNocheInicio: row.horaNocheInicio,
      horaNocheFin: row.horaNocheFin,
      recargoLluvia: row.recargoLluvia,
      recargoLluviaFuerte: row.recargoLluviaFuerte,
      comision: row.comision,
      fraccionCancelacion: row.fraccionCancelacion,
      nonMemberTowFeeQ: row.nonMemberTowFeeQ,
      lightNonMemberFlatQ: row.lightNonMemberFlatQ,
      freeCancelMinutes: row.freeCancelMinutes,
    },
    dispatch: {
      offerSeconds: row.offerSeconds,
      radiiKm: parseRadii(row.radiiKm),
      locationFreshMs: row.locationFreshMs,
      rechazosParaPausar: row.rechazosParaPausar,
      searchTimeoutMs: row.searchTimeoutMs,
      maxOffers: row.maxOffers,
    },
    flags: {
      weather: row.weather,
      shareContactNumbers: row.shareContactNumbers,
      requireLoadPhotos: row.requireLoadPhotos,
      requirePin: row.requirePin,
      identityRequiredForTow: row.identityRequiredForTow,
    },
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Columnas de la fila a partir de los defaults (para crearla). */
export function defaultSettingsRow() {
  const d = DEFAULT_SETTINGS;
  return {
    id: SETTINGS_ID,
    banderazo: d.tariff.banderazo,
    kmIncluidos: d.tariff.kmIncluidos,
    precioKm: d.tariff.precioKm,
    minutosIncluidos: d.tariff.minutosIncluidos,
    precioMinuto: d.tariff.precioMinuto,
    factorMoto: d.tariff.factorVehiculo.moto,
    factorCarro: d.tariff.factorVehiculo.carro,
    factorPickup: d.tariff.factorVehiculo.pickup,
    recargoNocturno: d.tariff.recargoNocturno,
    horaNocheInicio: d.tariff.horaNocheInicio,
    horaNocheFin: d.tariff.horaNocheFin,
    recargoLluvia: d.tariff.recargoLluvia,
    recargoLluviaFuerte: d.tariff.recargoLluviaFuerte,
    comision: d.tariff.comision,
    fraccionCancelacion: d.tariff.fraccionCancelacion,
    nonMemberTowFeeQ: d.tariff.nonMemberTowFeeQ,
    lightNonMemberFlatQ: d.tariff.lightNonMemberFlatQ,
    freeCancelMinutes: d.tariff.freeCancelMinutes,
    offerSeconds: d.dispatch.offerSeconds,
    radiiKm: JSON.stringify(d.dispatch.radiiKm),
    locationFreshMs: d.dispatch.locationFreshMs,
    rechazosParaPausar: d.dispatch.rechazosParaPausar,
    searchTimeoutMs: d.dispatch.searchTimeoutMs,
    maxOffers: d.dispatch.maxOffers,
    weather: d.flags.weather,
    shareContactNumbers: d.flags.shareContactNumbers,
    requireLoadPhotos: d.flags.requireLoadPhotos,
    requirePin: d.flags.requirePin,
    identityRequiredForTow: d.flags.identityRequiredForTow,
  };
}

function patchToRow(patch: SettingsPatch) {
  const t = patch.tariff ?? {};
  const d = patch.dispatch ?? {};
  const f = patch.flags ?? {};
  const { factorVehiculo, ...tariffRest } = t;
  const data: Record<string, unknown> = { ...tariffRest, ...f };
  if (factorVehiculo?.moto !== undefined) data.factorMoto = factorVehiculo.moto;
  if (factorVehiculo?.carro !== undefined) data.factorCarro = factorVehiculo.carro;
  if (factorVehiculo?.pickup !== undefined) data.factorPickup = factorVehiculo.pickup;
  const { radiiKm, ...dispatchRest } = d;
  Object.assign(data, dispatchRest);
  if (radiiKm) data.radiiKm = JSON.stringify([...radiiKm].sort((a, b) => a - b));
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

// ---------- Caché por proceso ----------

type Cache = { value: AppSettings; loadedAt: number };
const globalCache = globalThis as unknown as { __rsSettings?: Cache | null };

/** Crea la fila si no existe y la devuelve (idempotente). */
export async function ensureSettingsRow(): Promise<SettingsRow> {
  return prisma.settings.upsert({ where: { id: SETTINGS_ID }, create: defaultSettingsRow(), update: {} });
}

export async function getSettings(now: number = Date.now()): Promise<AppSettings> {
  const cached = globalCache.__rsSettings;
  if (cached && now - cached.loadedAt < CACHE_MS) return cached.value;
  const row = (await prisma.settings.findUnique({ where: { id: SETTINGS_ID } })) ?? (await ensureSettingsRow());
  const value = rowToSettings(row);
  globalCache.__rsSettings = { value, loadedAt: now };
  return value;
}

/** Último valor cargado (o los defaults si nunca se leyó). No consulta la BD. */
export function peekSettings(): AppSettings {
  return globalCache.__rsSettings?.value ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: SettingsPatch, now: number = Date.now()): Promise<AppSettings> {
  const data = patchToRow(SettingsPatchSchema.parse(patch));
  const row = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { ...defaultSettingsRow(), ...data },
    update: data,
  });
  const value = rowToSettings(row);
  globalCache.__rsSettings = { value, loadedAt: now };
  return value;
}

/** Olvida la caché (pruebas, o tras escribir la fila por fuera). */
export function invalidateSettingsCache(): void {
  globalCache.__rsSettings = null;
}

export function toPublicConfig(s: AppSettings): PublicConfig {
  return {
    tariff: s.tariff,
    flags: s.flags,
    dispatch: { offerSeconds: s.dispatch.offerSeconds, radiiKm: s.dispatch.radiiKm },
  };
}
