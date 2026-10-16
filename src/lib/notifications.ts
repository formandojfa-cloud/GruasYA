/**
 * Enlaces y avisos hacia fuera de la app. Por ahora no se llama a ningún
 * proveedor externo: se generan enlaces de WhatsApp listos para abrir y se
 * registra la alerta en el log del servidor. El punto de integración para
 * WhatsApp Cloud API / Twilio / llamadas al PBX es `notifyPbxAlert`.
 */

export function appUrl(): string {
  return (process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Normaliza un número de Guatemala a formato internacional sin "+". */
export function toE164Gt(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 8 ? `502${digits}` : digits;
}

export function whatsappLink(phone: string, text?: string): string {
  const base = `https://wa.me/${toE164Gt(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function providerAccessLink(token: string): string {
  return `${appUrl()}/driver?token=${encodeURIComponent(token)}`;
}

export function clientTrackingLink(requestId: string): string {
  return `${appUrl()}/r/${requestId}`;
}

export function providerInviteText(name: string, token: string): string {
  return (
    `Hola ${name}, soy del PBX de asistencia vial. ` +
    `Entra a este enlace para recibir el servicio, compartir tu ubicación y marcar cuando llegues: ` +
    providerAccessLink(token)
  );
}

export type PbxAlertPayload = {
  alertId: string;
  requestId: string;
  reason: string;
  kind: string;
  pickupAddress: string | null;
  pickup: { lat: number; lng: number };
  clientName: string;
  clientPhone: string;
  priceTotal: number;
};

const REASON_LABELS: Record<string, string> = {
  NO_PROVIDERS_AVAILABLE: "No hay proveedores conectados cerca",
  NO_MORE_CANDIDATES: "Ningún proveedor cercano aceptó",
  MAX_OFFERS_REACHED: "Se agotaron los intentos automáticos",
  SEARCH_TIMEOUT: "Se agotó el tiempo de búsqueda",
  CLIENT_REQUESTED_OPERATOR: "El cliente pidió hablar con un operador",
  CLIENT_NEEDS_HELP: "El cliente necesita ayuda con un servicio en curso",
  PROVIDER_BAILED: "El proveedor asignado canceló",
};

export function escalationReasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

/**
 * Punto único de salida de alertas al PBX. Hoy: log estructurado. Mañana:
 * mensaje de WhatsApp o llamada al operador de turno.
 */
export function notifyPbxAlert(payload: PbxAlertPayload): void {
  const line = {
    event: "PBX_ALERT",
    ...payload,
    reasonLabel: escalationReasonLabel(payload.reason),
    panel: `${appUrl()}/pbx?request=${payload.requestId}`,
  };
  console.warn(JSON.stringify(line));
}
