/**
 * Textos en español (los del prototipo GruaYa) y formatos compartidos por las
 * tres interfaces: Conductor (cliente), Piloto (gruero) y Central (PBX).
 */
import type { ProviderKind, ProviderStatus, RequestStatus, ServiceKind, VehicleKind } from "./types";

export { formatQ } from "./pricing";
export { escalationReasonLabel } from "./notifications";

export const KIND_LABELS: Record<ServiceKind, string> = {
  TOW: "Grúa",
  TIRE: "Cambio de llanta",
  BATTERY: "Paso de corriente",
  FUEL: "Combustible",
  LOCKSMITH: "Cerrajería",
};

export const KIND_ICONS: Record<ServiceKind, string> = {
  TOW: "🚛",
  TIRE: "🛞",
  BATTERY: "🔋",
  FUEL: "⛽",
  LOCKSMITH: "🔑",
};

export const VEHICLE_LABELS: Record<VehicleKind, string> = {
  SEDAN: "Carro",
  SUV: "Camioneta / SUV",
  PICKUP: "Pickup",
  MOTO: "Moto",
};

export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
  TOW: "Grúa",
  MOTO: "Motorista",
};

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  OFFLINE: "No disponible",
  ONLINE: "Disponible",
  BUSY: "En servicio",
};

/** Cómo se llama cada rol en la interfaz (prototipo: Conductor · Piloto · Admin/Central). */
export const ROLE_LABELS = {
  client: "Conductor",
  provider: "Piloto",
  pbx: "Central",
} as const;

/** Título de la tarjeta de estado (textos del prototipo). */
export const STATUS_LABELS: Record<RequestStatus, string> = {
  SEARCHING: "Buscando grúa",
  ESCALATED: "Sin grúa: la central te llama",
  EN_ROUTE: "Grúa en camino",
  ARRIVED: "La grúa llegó",
  IN_PROGRESS: "Vehículo cargado, en ruta",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

/** Versión corta para listas y chips. */
export const STATUS_SHORT: Record<RequestStatus, string> = {
  SEARCHING: "Buscando grúa",
  ESCALATED: "Sin grúa",
  EN_ROUTE: "En camino",
  ARRIVED: "Llegó",
  IN_PROGRESS: "En ruta",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/** Colores del prototipo: amarillo buscando, azul asignado/en sitio/en ruta, verde pagado, rojo sin grúa/cancelado. */
export const STATUS_TONE: Record<RequestStatus, Tone> = {
  SEARCHING: "warning",
  ESCALATED: "danger",
  EN_ROUTE: "info",
  ARRIVED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
};

/** Para las asistencias ligeras de la membresía no se habla de grúa ni de vehículo cargado. */
export function statusLabelFor(status: RequestStatus, kind: ServiceKind): string {
  const label = STATUS_LABELS[status];
  if (kind === "TOW") return label;
  if (status === "IN_PROGRESS") return "Servicio en curso";
  return label.replace("grúa", "asistencia").replace("Grúa", "Asistencia");
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString("es-GT", { maximumFractionDigits: 1 })} km`;
}

export function formatMinutes(min: number): string {
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string | Date, now: number = Date.now()): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.round((now - t) / 1000);
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return formatDateTime(new Date(t));
}

export function secondsUntil(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^502/, "");
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4)}` : phone;
}

export const EVENT_LABELS: Record<string, string> = {
  CREATED: "Solicitud creada",
  OFFER_SENT: "Se ofreció el servicio a una grúa",
  OFFER_REJECTED: "La grúa no pudo tomar el servicio",
  OFFER_EXPIRED: "La grúa no respondió",
  ESCALATED: "Pasó a la central",
  HELP_REQUESTED: "Pediste ayuda a la central",
  SEARCH_RESTARTED: "Se reinició la búsqueda",
  ASSIGNED: "Grúa en camino",
  ARRIVED: "La grúa llegó",
  IN_PROGRESS: "Vehículo cargado, en ruta",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  PROVIDER_CANCELLED: "La grúa asignada canceló",
  RATED: "Calificación enviada",
};
