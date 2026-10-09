// Notificaciones push para el piloto (nueva solicitud aunque la app esté cerrada
// o la pantalla apagada). Funciona como app instalada (PWA): Chrome en Android
// siempre; iPhone solo si se agrega a la pantalla de inicio.
import { leerEntorno } from '../data/entorno';
import { borrarSuscripcionPush, guardarSuscripcionPush } from '../data/store';

const CLAVE_PUBLICA = leerEntorno('VITE_VAPID_PUBLIC_KEY');

export type EstadoPush = 'no_soportado' | 'sin_clave' | 'pendiente' | 'activo' | 'bloqueado' | 'error';

function base64urlABytes(s: string): Uint8Array {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function haySoportePush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    return null;
  }
}

// Pide permiso (hay que llamarla desde un toque) y guarda la suscripción en la nube.
export async function activarPush(grueroId: string): Promise<EstadoPush> {
  if (!haySoportePush()) return 'no_soportado';
  if (!CLAVE_PUBLICA) return 'sin_clave';
  try {
    const permiso = await Notification.requestPermission();
    if (permiso === 'denied') return 'bloqueado';
    if (permiso !== 'granted') return 'pendiente';
    const reg = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64urlABytes(CLAVE_PUBLICA) as BufferSource }));
    guardarSuscripcionPush(grueroId, sub.toJSON(), `${location.origin}${location.pathname}`);
    return 'activo';
  } catch {
    return 'error';
  }
}

export async function desactivarPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      borrarSuscripcionPush(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    // nada que deshacer
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!haySoportePush()) return 'no_soportado';
  if (!CLAVE_PUBLICA) return 'sin_clave';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission !== 'granted') return 'pendiente';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ? 'activo' : 'pendiente';
  } catch {
    return 'error';
  }
}
