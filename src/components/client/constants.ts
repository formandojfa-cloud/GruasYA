/**
 * Constantes y ayudas pequeñas de la app del cliente. Los parámetros de
 * negocio vienen de `@/lib/config` para no duplicar cifras.
 */
import { ApiClientError, errorMessage } from "@/lib/api";
import { PRICING } from "@/lib/config";
import type { LatLng } from "@/lib/geo";
import { ACTIVE_STATUSES, type ProviderKind, type RequestStatus, type ServiceKind, type VehicleKind } from "@/lib/types";

/** Centro por defecto cuando no hay GPS: Ciudad de Guatemala. */
export const GUATEMALA_CITY: LatLng = { lat: 14.6349, lng: -90.5069 };

export const STORAGE_VEHICLE = "rs.client.vehicle";
export const STORAGE_DRAFT = "rs.client.draft";

/** Intervalo de sondeo de la solicitud activa. */
export const POLL_MS = 2500;

export const SERVICE_ORDER: readonly ServiceKind[] = ["TOW", "TIRE", "BATTERY", "FUEL", "LOCKSMITH"];

export const KIND_HINTS: Record<ServiceKind, string> = {
  TOW: "Llevamos tu vehículo a donde digas",
  TIRE: "Cambiamos la llanta por tu repuesto",
  BATTERY: "Arrancamos tu vehículo",
  FUEL: "Te llevamos combustible",
  LOCKSMITH: "Abrimos tu vehículo sin daños",
};

export const VEHICLE_ICONS: Record<VehicleKind, string> = {
  SEDAN: "🚗",
  SUV: "🚙",
  PICKUP: "🛻",
  MOTO: "🏍️",
};

export const TOW_BASE_Q = PRICING.tow.baseQ;
export const LIGHT_NON_MEMBER_Q = PRICING.lightNonMemberFlatQ;
export const NON_MEMBER_TOW_FEE_Q = PRICING.nonMemberTowFeeQ;
export const CANCELLATION_FEE_Q = PRICING.cancellationFeeQ;

export function isLightKind(kind: ServiceKind): boolean {
  return kind !== "TOW";
}

export function isActiveStatus(status: RequestStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** "grúa" para remolques, "asistencia" para servicios ligeros. */
export function serviceNoun(kind: ServiceKind): "grúa" | "asistencia" {
  return kind === "TOW" ? "grúa" : "asistencia";
}

export function providerGlyph(kind: ProviderKind): string {
  return kind === "MOTO" ? "🏍️" : "🚚";
}

export function providerNoun(kind: ProviderKind): "gruero" | "motorista" {
  return kind === "MOTO" ? "motorista" : "gruero";
}

export function formatCoords(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

export function placeLabel(p: { lat: number; lng: number; address?: string | null }): string {
  const a = p.address?.trim();
  return a ? a : formatCoords(p);
}

/** Primeros tramos de una dirección larga de Nominatim. */
export function shortAddress(label: string, parts = 3): string {
  return label
    .split(",")
    .slice(0, parts)
    .map((s) => s.trim())
    .join(", ");
}

/** "m:ss" desde una marca de tiempo. */
export function elapsedLabel(fromIso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Enlace `tel:` con código de país para números de Guatemala. */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `tel:+${digits.length === 8 ? `502${digits}` : digits}`;
}

/** Mensaje mostrable: para errores de validación usa el primer detalle. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError && err.code === "VALIDATION" && Array.isArray(err.details)) {
    const first = err.details[0] as { message?: string } | undefined;
    if (first?.message) return first.message;
  }
  return errorMessage(err);
}
