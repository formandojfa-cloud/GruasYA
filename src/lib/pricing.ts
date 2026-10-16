/**
 * Precio fijo antes de pedir, como en Uber: el cliente ve el total y el
 * desglose antes de confirmar. La fórmula de grúa es la del prototipo GruaYa
 * (`src/domain/tarifa.ts`):
 *
 *   total = round((banderazo + kmAdicionales×precioKm + minutosAdicionales×precioMinuto)
 *                 × factorVehiculo × factorHorario × factorClima)
 *   comisión = total × comision (2 decimales) · ganancia del gruero = total − comisión
 *
 * `quoteFor` es pura: recibe la tarifa (de `getSettings()`) y no lee env ni BD.
 */
import type { ServiceKind, VehicleKind, Weather } from "@/generated/prisma/enums";
import { TIME_ZONE } from "./config";

export type QuoteLine = { label: string; amountQ: number };

/** Parámetros de la tarifa (fila `Settings`); nombres del prototipo. */
export type Tariff = {
  banderazo: number; // Q
  kmIncluidos: number;
  precioKm: number; // Q por km adicional
  minutosIncluidos: number;
  precioMinuto: number; // Q por minuto adicional de viaje
  factorVehiculo: Record<VehicleClass, number>;
  recargoNocturno: number; // multiplicador entre horaNocheInicio y horaNocheFin
  horaNocheInicio: number;
  horaNocheFin: number;
  recargoLluvia: number;
  recargoLluviaFuerte: number;
  comision: number; // fracción para GruaYa
  fraccionCancelacion: number; // fracción de la tarifa si se cancela tras aceptar
  nonMemberTowFeeQ: number;
  lightNonMemberFlatQ: number;
  freeCancelMinutes: number;
};

/** Clase de vehículo para la tarifa: Moto · Carro · Pickup o camioneta. */
export type VehicleClass = "moto" | "carro" | "pickup";

export const VEHICLE_CLASS: Record<VehicleKind, VehicleClass> = {
  MOTO: "moto",
  SEDAN: "carro",
  SUV: "pickup",
  PICKUP: "pickup",
};

export const VEHICLE_CLASS_LABEL: Record<VehicleClass, string> = {
  moto: "Moto",
  carro: "Carro",
  pickup: "Pickup o camioneta",
};

export const WEATHER_LABEL: Record<Weather, string> = {
  NONE: "sin lluvia",
  RAIN: "lluvia",
  HEAVY_RAIN: "lluvia fuerte",
};

export type Quote = {
  kind: ServiceKind;
  currency: "GTQ";
  isMember: boolean;
  /** Distancia de remolque por calles (km, 2 decimales). 0 en asistencias ligeras. */
  distanceKm: number;
  /** Duración estimada del remolque (min). */
  minutes: number;
  /** Km que se cobran: lo que excede los km incluidos (fraccionario, como el prototipo). */
  billableKm: number;
  baseQ: number;
  includedKm: number;
  perKmQ: number;
  extraKmQ: number;
  includedMinutes: number;
  perMinuteQ: number;
  billableMinutes: number;
  extraMinutesQ: number;
  vehicleClass: VehicleClass | null;
  vehicleFactor: number;
  nightFactor: number;
  weather: Weather;
  weatherFactor: number;
  /** Tarifa del gruero (antes del cargo de no socio). */
  providerTariffQ: number;
  nonMemberFeeQ: number;
  /** Compatibilidad con la versión anterior: recargo nocturno expresado en Q. */
  nightSurchargeQ: number;
  totalQ: number;
  lines: QuoteLine[];
  /** Una línea: "Banderazo Q300 + 1.6 km × Q15 + 5 min × Q3 · nocturno ×1.2". */
  formula: string;
  commissionQ: number;
  /** Lo que recibe el proveedor y lo que queda a la plataforma (solo grúa). */
  providerPayoutQ: number;
  platformRevenueQ: number;
  /** Cargo si el cliente cancela cuando la grúa ya aceptó (fracción de la tarifa). */
  cancellationFeeQ: number;
  /** Texto corto para la UI, p. ej. "Incluido en tu membresía". */
  summary: string;
};

export type QuoteInput = {
  kind: ServiceKind;
  distanceKm: number;
  /** Duración estimada del remolque; por defecto 0 (solo km). */
  minutes?: number;
  vehicleKind?: VehicleKind;
  weather?: Weather;
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

/** Hora (0–23) en la zona horaria del negocio (Guatemala, sin horario de verano). */
export function localHour(at: Date, timeZone: string = TIME_ZONE): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(at);
  const n = Number(h);
  return Number.isFinite(n) ? n % 24 : at.getHours();
}

export function esHorarioNocturno(hora: number, t: Pick<Tariff, "horaNocheInicio" | "horaNocheFin">): boolean {
  return t.horaNocheInicio > t.horaNocheFin
    ? hora >= t.horaNocheInicio || hora < t.horaNocheFin
    : hora >= t.horaNocheInicio && hora < t.horaNocheFin;
}

export function isNightTime(at: Date, t: Pick<Tariff, "horaNocheInicio" | "horaNocheFin">): boolean {
  return esHorarioNocturno(localHour(at), t);
}

export function factorClima(weather: Weather, t: Pick<Tariff, "recargoLluvia" | "recargoLluviaFuerte">): number {
  if (weather === "RAIN") return t.recargoLluvia;
  if (weather === "HEAVY_RAIN") return t.recargoLluviaFuerte;
  return 1;
}

/** Cargo por cancelar tras aceptar: fracción de la tarifa, redondeado a Q. */
export function cargoCancelacion(tarifaQ: number, t: Pick<Tariff, "fraccionCancelacion">): number {
  return Math.round(tarifaQ * t.fraccionCancelacion);
}

function fmtNum(n: number, maxDecimals = 1): string {
  return n.toLocaleString("es-GT", { maximumFractionDigits: maxDecimals });
}

export function quoteFor(input: QuoteInput, tariff: Tariff): Quote {
  const at = input.at ?? new Date();
  const distanceKm = Math.max(0, round2(input.distanceKm));
  const minutes = Math.max(0, round1(input.minutes ?? 0));
  const weather: Weather = input.weather ?? "NONE";

  if (LIGHT_KINDS.has(input.kind)) {
    const total = input.isMember ? 0 : tariff.lightNonMemberFlatQ;
    const lines: QuoteLine[] = input.isMember
      ? [{ label: "Asistencia incluida en tu membresía", amountQ: 0 }]
      : [{ label: "Asistencia ligera (no socio)", amountQ: total }];
    return {
      kind: input.kind,
      currency: "GTQ",
      isMember: input.isMember,
      distanceKm: 0,
      minutes: 0,
      billableKm: 0,
      baseQ: 0,
      includedKm: 0,
      perKmQ: 0,
      extraKmQ: 0,
      includedMinutes: 0,
      perMinuteQ: 0,
      billableMinutes: 0,
      extraMinutesQ: 0,
      vehicleClass: null,
      vehicleFactor: 1,
      nightFactor: 1,
      weather: "NONE",
      weatherFactor: 1,
      providerTariffQ: total,
      nonMemberFeeQ: 0,
      nightSurchargeQ: 0,
      totalQ: total,
      lines,
      formula: input.isMember ? "Incluida en tu membresía" : `Asistencia ligera Q${total}`,
      commissionQ: 0,
      providerPayoutQ: total,
      platformRevenueQ: 0,
      cancellationFeeQ: 0,
      summary: input.isMember ? "Incluido en tu membresía" : `Q${total} por servicio`,
    };
  }

  // Grúa: fórmula del prototipo.
  const vehicleClass = VEHICLE_CLASS[input.vehicleKind ?? "SEDAN"];
  const kmAdicionales = round2(Math.max(0, distanceKm - tariff.kmIncluidos));
  const porKm = kmAdicionales * tariff.precioKm;
  const minutosAdicionales = round1(Math.max(0, minutes - tariff.minutosIncluidos));
  const porMinuto = minutosAdicionales * tariff.precioMinuto;
  const factorVehiculo = tariff.factorVehiculo[vehicleClass] ?? 1;
  const factorHorario = isNightTime(at, tariff) ? tariff.recargoNocturno : 1;
  const fClima = factorClima(weather, tariff);
  const providerTariffQ = Math.round((tariff.banderazo + porKm + porMinuto) * factorVehiculo * factorHorario * fClima);
  const comision = Math.round(providerTariffQ * tariff.comision * 100) / 100;
  const nonMemberFeeQ = input.isMember ? 0 : tariff.nonMemberTowFeeQ;
  const totalQ = providerTariffQ + nonMemberFeeQ;

  const lines: QuoteLine[] = [
    {
      label: tariff.kmIncluidos > 0 ? `Banderazo (incluye ${fmtNum(tariff.kmIncluidos)} km)` : "Banderazo",
      amountQ: tariff.banderazo,
    },
  ];
  const formula: string[] = [`Banderazo Q${fmtNum(tariff.banderazo)}`];
  if (kmAdicionales > 0) {
    lines.push({ label: `${fmtNum(kmAdicionales)} km más × Q${fmtNum(tariff.precioKm)}`, amountQ: round2(porKm) });
    formula.push(`${fmtNum(kmAdicionales)} km × Q${fmtNum(tariff.precioKm)}`);
  }
  if (minutosAdicionales > 0) {
    lines.push({
      label: `${fmtNum(minutosAdicionales, 0)} min más por tráfico × Q${fmtNum(tariff.precioMinuto)}`,
      amountQ: round2(porMinuto),
    });
    formula.push(`${fmtNum(minutosAdicionales, 0)} min × Q${fmtNum(tariff.precioMinuto)}`);
  }
  let text = formula.join(" + ");
  const factors: string[] = [];
  if (factorVehiculo !== 1) {
    lines.push({ label: `${VEHICLE_CLASS_LABEL[vehicleClass]} ×${fmtNum(factorVehiculo, 2)}`, amountQ: 0 });
    factors.push(`${VEHICLE_CLASS_LABEL[vehicleClass].toLowerCase()} ×${fmtNum(factorVehiculo, 2)}`);
  }
  if (factorHorario !== 1) {
    lines.push({ label: `Horario nocturno ×${fmtNum(factorHorario, 2)}`, amountQ: 0 });
    factors.push(`nocturno ×${fmtNum(factorHorario, 2)}`);
  }
  if (fClima !== 1) {
    lines.push({ label: `Por ${WEATHER_LABEL[weather]} ×${fmtNum(fClima, 2)}`, amountQ: 0 });
    factors.push(`${WEATHER_LABEL[weather]} ×${fmtNum(fClima, 2)}`);
  }
  if (factors.length) text += ` · ${factors.join(" · ")}`;
  if (nonMemberFeeQ > 0) {
    lines.push({ label: "Cargo por servicio (no socio)", amountQ: nonMemberFeeQ });
    text += ` + Q${nonMemberFeeQ} no socio`;
  }

  return {
    kind: input.kind,
    currency: "GTQ",
    isMember: input.isMember,
    distanceKm,
    minutes,
    billableKm: kmAdicionales,
    baseQ: tariff.banderazo,
    includedKm: tariff.kmIncluidos,
    perKmQ: tariff.precioKm,
    extraKmQ: round2(porKm),
    includedMinutes: tariff.minutosIncluidos,
    perMinuteQ: tariff.precioMinuto,
    billableMinutes: minutosAdicionales,
    extraMinutesQ: round2(porMinuto),
    vehicleClass,
    vehicleFactor: factorVehiculo,
    nightFactor: factorHorario,
    weather,
    weatherFactor: fClima,
    providerTariffQ,
    nonMemberFeeQ,
    nightSurchargeQ: factorHorario !== 1 ? Math.round(providerTariffQ - providerTariffQ / factorHorario) : 0,
    totalQ,
    lines,
    formula: text,
    commissionQ: comision,
    providerPayoutQ: round2(providerTariffQ - comision),
    platformRevenueQ: round2(comision + nonMemberFeeQ),
    cancellationFeeQ: cargoCancelacion(providerTariffQ, tariff),
    summary: input.isMember ? "Tarifa directa de socio" : "Incluye cargo por servicio",
  };
}

export function formatQ(amount: number): string {
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `Q${amount.toLocaleString("es-GT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
