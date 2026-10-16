/**
 * Utilidades pequeñas de la app del gruero: parseo del enlace mágico, enlaces
 * de navegación, geometría ligera (sin cargar h3-js en el cliente) y alertas.
 */
import type { LatLng } from "@/lib/geo";
import type { Place } from "@/lib/types";

/** Acepta el enlace completo (`https://…/driver?token=abc`) o solo el token. */
export function extractToken(input: string): string {
  const s = input.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    const t = u.searchParams.get("token");
    if (t) return t.trim();
  } catch {
    /* no es una URL completa */
  }
  const m = s.match(/token=([^&\s]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return s;
}

export function googleMapsUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

export function wazeUrl(p: LatLng): string {
  return `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
}

/** `tel:` con prefijo de Guatemala. */
export function telHref(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `tel:${d.startsWith("502") ? "+" + d : "+502" + d}`;
}

/** Dirección si la hay; si no, coordenadas legibles. */
export function placeLabel(p: Place | null | undefined): string {
  if (!p) return "—";
  const a = p.address?.trim();
  return a && a.length > 0 ? a : `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

export function initialOf(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  return t ? t[0].toUpperCase() : "?";
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Distancia en metros (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo de a → b en grados (0 = norte, 0..360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Vibración + pitido corto al llegar una oferta. Los navegadores pueden
 * bloquear el audio antes de la primera interacción: se ignora cualquier error.
 */
let lastAlertKey = "";

export function playOfferAlert(key?: string): void {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  // Una sola alerta por oferta (React en desarrollo monta dos veces).
  if (key) {
    if (key === lastAlertKey) return;
    lastAlertKey = key;
  }
  // Sin una interacción previa el navegador bloquea vibración y audio (y lo
  // reporta en consola); en ese caso no hay nada que hacer.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate([200, 100, 200]);
  } catch {
    /* sin vibración */
  }
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (t: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    };
    const t0 = ctx.currentTime;
    beep(t0);
    beep(t0 + 0.4);
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  } catch {
    /* audio bloqueado */
  }
}
