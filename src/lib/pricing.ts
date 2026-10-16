import type { ServiceKind } from "@/generated/prisma/enums";
import { PRICING } from "./config";

export type QuoteLine = { label: string; amountQ: number };

export type Quote = {
  kind: ServiceKind;
  currency: "GTQ";
  isMember: boolean;
  /** Distancia de remolque estimada (km, 2 decimales). 0 en asistencias ligeras. */
  distanceKm: number;
  /** Km que se cobran: redondeo hacia arriba de lo que excede los km incluidos. */
  billableKm: number;
  baseQ: number;
  includedKm: number;
  perKmQ: number;
  extraKmQ: number;
  nonMemberFeeQ: number;
  nightSurchargeQ: number;
  totalQ: number;
  lines: QuoteLine[];
  /** Lo que recibe el proveedor y lo que queda a la plataforma (solo grúa). */
  providerPayoutQ: number;
  platformRevenueQ: number;
  /** Texto corto para la UI, p. ej. "Incluido en tu membresía". */
  summary: string;
};

export type QuoteInput = {
  kind: ServiceKind;
  distanceKm: number;
  isMember: boolean;
  /** Hora local del servicio; por defecto ahora. */
  at?: Date;
};

export const LIGHT_KINDS: ReadonlySet<ServiceKind> = new Set<ServiceKind>([
  "TIRE",
  "BATTERY",
  "FUEL",
  "LOCKSMITH",
]);

export function isNightTime(at: Date): boolean {
  const { enabled, startHour, endHour } = PRICING.night;
  if (!enabled) return false;
  const h = at.getHours();
  // Rango que cruza la medianoche (p. ej. 22 → 6).
  return startHour > endHour ? h >= startHour || h < endHour : h >= startHour && h < endHour;
}

/**
 * Calcula el precio antes de pedir, como hace Uber: el cliente ve el total y
 * el desglose antes de confirmar. Es una función pura.
 */
export function quoteFor(input: QuoteInput): Quote {
  const at = input.at ?? new Date();
  const distanceKm = Math.max(0, round2(input.distanceKm));

  if (LIGHT_KINDS.has(input.kind)) {
    const total = input.isMember ? 0 : PRICING.lightNonMemberFlatQ;
    const lines: QuoteLine[] = input.isMember
      ? [{ label: "Asistencia incluida en tu membresía", amountQ: 0 }]
      : [{ label: "Asistencia ligera (no socio)", amountQ: total }];
    return {
      kind: input.kind,
      currency: "GTQ",
      isMember: input.isMember,
      distanceKm: 0,
      billableKm: 0,
      baseQ: 0,
      includedKm: 0,
      perKmQ: 0,
      extraKmQ: 0,
      nonMemberFeeQ: 0,
      nightSurchargeQ: 0,
      totalQ: total,
      lines,
      providerPayoutQ: total,
      platformRevenueQ: 0,
      summary: input.isMember ? "Incluido en tu membresía" : `Q${total} por servicio`,
    };
  }

  // Grúa: banderazo + km adicionales + cargo de no socio + nocturno.
  const { baseQ, includedKm, perKmQ } = PRICING.tow;
  const billableKm = Math.max(0, Math.ceil(distanceKm - includedKm - 1e-9));
  const extraKmQ = billableKm * perKmQ;
  const nonMemberFeeQ = input.isMember ? 0 : PRICING.nonMemberTowFeeQ;
  const nightSurchargeQ = isNightTime(at) ? PRICING.night.surchargeQ : 0;
  const providerTariffQ = baseQ + extraKmQ + nightSurchargeQ;
  const totalQ = providerTariffQ + nonMemberFeeQ;

  const lines: QuoteLine[] = [
    { label: includedKm > 0 ? `Banderazo (incluye ${includedKm} km)` : "Banderazo", amountQ: baseQ },
  ];
  if (billableKm > 0) {
    lines.push({ label: `${billableKm} km adicionales × Q${perKmQ}`, amountQ: extraKmQ });
  }
  if (nightSurchargeQ > 0) lines.push({ label: "Recargo nocturno", amountQ: nightSurchargeQ });
  if (nonMemberFeeQ > 0) lines.push({ label: "Cargo por servicio (no socio)", amountQ: nonMemberFeeQ });

  const commission = Math.round(providerTariffQ * PRICING.platformCommission);

  return {
    kind: input.kind,
    currency: "GTQ",
    isMember: input.isMember,
    distanceKm,
    billableKm,
    baseQ,
    includedKm,
    perKmQ,
    extraKmQ,
    nonMemberFeeQ,
    nightSurchargeQ,
    totalQ,
    lines,
    providerPayoutQ: providerTariffQ - commission,
    platformRevenueQ: commission + nonMemberFeeQ,
    summary: input.isMember ? "Tarifa directa de socio" : "Incluye cargo por servicio",
  };
}

export function formatQ(amount: number): string {
  return `Q${amount.toLocaleString("es-GT", { maximumFractionDigits: 0 })}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
