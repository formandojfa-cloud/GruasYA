/**
 * Ayudas pequeñas del panel del PBX (no cruzan la API; lo compartido vive en src/lib).
 */
import type { Place, ProviderKind, RequestEventView, RequestStatus, ServiceKind } from "@/lib/types";

export type LatLngLike = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en línea recta (km). Copia local para no arrastrar h3-js al navegador. */
export function haversineKm(a: LatLngLike, b: LatLngLike): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Tipo de proveedor que atiende cada servicio (misma regla que el despacho). */
export function providerKindFor(kind: ServiceKind): ProviderKind {
  return kind === "TOW" ? "TOW" : "MOTO";
}

/** Emoji del prototipo: 🚚 grúa, 🏍️ motorista. */
export function glyphFor(kind: ProviderKind): string {
  return kind === "TOW" ? "🚚" : "🏍️";
}

export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function coordsLabel(p: LatLngLike): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

export function placeLabel(p: Place | null | undefined): string {
  if (!p) return "—";
  return p.address?.trim() ? p.address : coordsLabel(p);
}

export function mapsLink(p: LatLngLike): string {
  return `https://www.google.com/maps?q=${p.lat},${p.lng}`;
}

export const ASSIGNED_STATUSES: readonly RequestStatus[] = ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
export const ASSIGNABLE_STATUSES: readonly RequestStatus[] = ["SEARCHING", "ESCALATED"];
export const CANCELLABLE_STATUSES: readonly RequestStatus[] = ["SEARCHING", "ESCALATED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

export const ASSIGNED_BY_LABELS: Record<string, string> = {
  AUTO: "Cascada automática",
  PBX: "La central",
};

export const CANCELLED_BY_LABELS: Record<string, string> = {
  CLIENT: "el conductor",
  PROVIDER: "el piloto",
  PBX: "la central",
  SYSTEM: "el sistema",
};

/** Las etiquetas de src/lib/format hablan al conductor; en la Central hablamos del conductor y del piloto. */
export const PBX_EVENT_OVERRIDES: Record<string, string> = {
  HELP_REQUESTED: "El conductor pidió hablar con la central",
  RATED: "El conductor calificó el servicio",
  OFFER_SENT: "Se ofreció el servicio a un piloto",
  OFFER_REJECTED: "El piloto rechazó la oferta",
  OFFER_EXPIRED: "El piloto no respondió",
  ASSIGNED: "Piloto asignado",
  ARRIVED: "El piloto llegó al punto",
  PROVIDER_CANCELLED: "El piloto asignado se bajó",
};

export const OFFER_RESPONSE_LABELS: Record<string, string> = {
  OFFER_SENT: "enviada",
  OFFER_REJECTED: "rechazada",
  OFFER_EXPIRED: "sin respuesta",
};

export function isOfferEvent(e: RequestEventView): boolean {
  return e.type.startsWith("OFFER_");
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Copia al portapapeles con respaldo para navegadores sin `navigator.clipboard`. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* seguimos con el respaldo */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Nombre del proveedor a partir de un evento o del id, con respaldo. */
export function providerNameFrom(
  data: Record<string, unknown> | null,
  byId: Map<string, string>,
  byOffer: Map<string, string>,
): string | null {
  if (!data) return null;
  const direct = str(data.providerName);
  if (direct) return direct;
  const pid = str(data.providerId);
  if (pid && byId.has(pid)) return byId.get(pid)!;
  const oid = str(data.offerId);
  if (oid && byOffer.has(oid)) return byOffer.get(oid)!;
  return pid ? `#${shortId(pid)}` : null;
}
