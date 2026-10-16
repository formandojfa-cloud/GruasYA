/**
 * `quoteFor` es una función pura: el cliente ve el total y el desglose antes
 * de pedir. Valores por defecto de `config.ts`: banderazo Q275, Q20/km
 * (redondeo hacia arriba), 0 km incluidos, +Q50 no socio, nocturno apagado,
 * ligeras Q0 socio / Q150 no socio, comisión 10 %.
 */
import { describe, expect, it } from "vitest";
import { PRICING } from "@/lib/config";
import { formatQ, isNightTime, LIGHT_KINDS, quoteFor } from "@/lib/pricing";

const ROAD_KM_Z10_Z11 = 7.35; // zona 10 → zona 11 por carretera (haversine × 1.3)

describe("pricing.quoteFor — grúa", () => {
  it("socio: banderazo + km redondeados hacia arriba, sin cargo por servicio", () => {
    const q = quoteFor({ kind: "TOW", distanceKm: ROAD_KM_Z10_Z11, isMember: true, at: new Date("2026-10-16T15:00:00Z") });
    expect(q.kind).toBe("TOW");
    expect(q.currency).toBe("GTQ");
    expect(q.isMember).toBe(true);
    expect(q.distanceKm).toBe(7.35);
    expect(q.billableKm).toBe(8);
    expect(q.baseQ).toBe(275);
    expect(q.perKmQ).toBe(20);
    expect(q.extraKmQ).toBe(160);
    expect(q.nonMemberFeeQ).toBe(0);
    expect(q.nightSurchargeQ).toBe(0);
    expect(q.totalQ).toBe(435);
    expect(q.summary).toBe("Tarifa directa de socio");
    expect(q.lines).toEqual([
      { label: "Banderazo", amountQ: 275 },
      { label: "8 km adicionales × Q20", amountQ: 160 },
    ]);
  });

  it("no socio: misma tarifa del gruero + Q50 de cargo por servicio", () => {
    const q = quoteFor({ kind: "TOW", distanceKm: ROAD_KM_Z10_Z11, isMember: false, at: new Date("2026-10-16T15:00:00Z") });
    expect(q.nonMemberFeeQ).toBe(50);
    expect(q.totalQ).toBe(485);
    expect(q.summary).toBe("Incluye cargo por servicio");
    expect(q.lines.at(-1)).toEqual({ label: "Cargo por servicio (no socio)", amountQ: 50 });
    expect(q.lines).toHaveLength(3);
  });

  it("los km se cobran con redondeo hacia arriba (7.01 → 8) y los enteros exactos no suben (7.00 → 7)", () => {
    expect(quoteFor({ kind: "TOW", distanceKm: 7.01, isMember: true }).billableKm).toBe(8);
    expect(quoteFor({ kind: "TOW", distanceKm: 7, isMember: true }).billableKm).toBe(7);
    expect(quoteFor({ kind: "TOW", distanceKm: 0.2, isMember: true }).billableKm).toBe(1);
    expect(quoteFor({ kind: "TOW", distanceKm: 7.999, isMember: true }).billableKm).toBe(8);
  });

  it("sin distancia solo cobra el banderazo y no muestra línea de km", () => {
    const q = quoteFor({ kind: "TOW", distanceKm: 0, isMember: true });
    expect(q.billableKm).toBe(0);
    expect(q.extraKmQ).toBe(0);
    expect(q.totalQ).toBe(275);
    expect(q.lines).toEqual([{ label: "Banderazo", amountQ: 275 }]);
  });

  it("una distancia negativa se trata como 0 y la distancia se guarda con 2 decimales", () => {
    expect(quoteFor({ kind: "TOW", distanceKm: -3, isMember: true }).totalQ).toBe(275);
    expect(quoteFor({ kind: "TOW", distanceKm: 7.3549, isMember: true }).distanceKm).toBe(7.35);
  });

  it("includedKm es 0 por defecto: todos los km se cobran y la etiqueta del banderazo no menciona km incluidos", () => {
    expect(PRICING.tow.includedKm).toBe(0);
    const q = quoteFor({ kind: "TOW", distanceKm: 3, isMember: true });
    expect(q.includedKm).toBe(0);
    expect(q.billableKm).toBe(3);
    expect(q.lines[0].label).toBe("Banderazo");
  });

  it("el recargo nocturno está apagado por defecto, incluso a las 23:00", () => {
    const night = new Date(2026, 9, 16, 23, 30, 0); // hora local
    expect(PRICING.night.enabled).toBe(false);
    expect(isNightTime(night)).toBe(false);
    const q = quoteFor({ kind: "TOW", distanceKm: 5, isMember: false, at: night });
    expect(q.nightSurchargeQ).toBe(0);
    expect(q.lines.some((l) => l.label === "Recargo nocturno")).toBe(false);
    expect(q.totalQ).toBe(275 + 5 * 20 + 50);
  });

  it("providerPayoutQ es la tarifa del gruero menos 10 % de comisión; platformRevenueQ es comisión + cargo no socio", () => {
    const member = quoteFor({ kind: "TOW", distanceKm: ROAD_KM_Z10_Z11, isMember: true });
    const tariff = 275 + 160; // 435
    const commission = Math.round(tariff * 0.1); // 44
    expect(member.providerPayoutQ).toBe(tariff - commission); // 391
    expect(member.platformRevenueQ).toBe(commission);
    expect(member.providerPayoutQ + member.platformRevenueQ).toBe(member.totalQ);

    const nonMember = quoteFor({ kind: "TOW", distanceKm: ROAD_KM_Z10_Z11, isMember: false });
    expect(nonMember.providerPayoutQ).toBe(tariff - commission); // el gruero cobra lo mismo
    expect(nonMember.platformRevenueQ).toBe(commission + 50);
    expect(nonMember.providerPayoutQ + nonMember.platformRevenueQ).toBe(nonMember.totalQ);
  });
});

describe("pricing.quoteFor — asistencias ligeras", () => {
  it("LIGHT_KINDS son llanta, batería, combustible y cerrajería", () => {
    expect([...LIGHT_KINDS].sort()).toEqual(["BATTERY", "FUEL", "LOCKSMITH", "TIRE"]);
    expect(LIGHT_KINDS.has("TOW")).toBe(false);
  });

  it.each([...LIGHT_KINDS])("%s para socio: Q0, incluido en la membresía", (kind) => {
    const q = quoteFor({ kind, distanceKm: 12, isMember: true });
    expect(q.totalQ).toBe(0);
    expect(q.distanceKm).toBe(0); // la distancia no aplica
    expect(q.billableKm).toBe(0);
    expect(q.providerPayoutQ).toBe(0);
    expect(q.platformRevenueQ).toBe(0);
    expect(q.summary).toBe("Incluido en tu membresía");
    expect(q.lines).toEqual([{ label: "Asistencia incluida en tu membresía", amountQ: 0 }]);
  });

  it.each([...LIGHT_KINDS])("%s para no socio: tarifa plana Q150", (kind) => {
    const q = quoteFor({ kind, distanceKm: 12, isMember: false });
    expect(q.totalQ).toBe(150);
    expect(q.nonMemberFeeQ).toBe(0); // la tarifa plana ya es el cargo
    expect(q.providerPayoutQ).toBe(150);
    expect(q.platformRevenueQ).toBe(0);
    expect(q.summary).toBe("Q150 por servicio");
    expect(q.lines).toEqual([{ label: "Asistencia ligera (no socio)", amountQ: 150 }]);
  });
});

describe("pricing.formatQ", () => {
  it("antepone Q y no muestra decimales", () => {
    expect(formatQ(435)).toBe("Q435");
    expect(formatQ(0)).toBe("Q0");
    expect(formatQ(49.6)).toBe("Q50");
  });
});
