// Paquetes que Deno resuelve al desplegar (esbuild los deja como externos).
declare module 'npm:web-push@3.6.7' {
  export interface Suscripcion {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(sub: Suscripcion, payload: string, opts?: { TTL?: number; urgency?: string }): Promise<unknown>;
  };
  export default webpush;
}
