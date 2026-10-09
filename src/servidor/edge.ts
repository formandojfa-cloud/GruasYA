// Función de Supabase (Deno) que corre el reparto en el servidor y manda las
// notificaciones push de las ofertas nuevas. Se compila a
// supabase/functions/motor/index.ts con `npm run motor` y se despliega desde CI
// (o pegando ese archivo en el panel de Supabase → Edge Functions).
import webpush from 'npm:web-push@3.6.7';
import { leerEntorno } from '../data/entorno';
import { crearNube, type SuscripcionPush } from '../data/nube';
import { pasoServidor, type OfertaNueva } from './paso';

declare const Deno: { serve(f: (r: Request) => Promise<Response>): void };

const CANDADO = 'motor';
const CANDADO_MS = 20_000;
let nube: ReturnType<typeof crearNube> | null = null;
let enCurso: Promise<Response> | null = null;

// Claves VAPID (Admin → Ajustes → Notificaciones push las genera). Sin ellas no se manda nada.
const VAPID_PUBLICA = leerEntorno('VAPID_PUBLIC_KEY');
const VAPID_PRIVADA = leerEntorno('VAPID_PRIVATE_KEY');
const VAPID_CONTACTO = leerEntorno('VAPID_SUBJECT') ?? 'https://formandojfa-cloud.github.io/GruasYA/';

async function mandarPush(avisos: OfertaNueva[]): Promise<{ enviados: number; borrados: number }> {
  if (!avisos.length || !VAPID_PUBLICA || !VAPID_PRIVADA || !nube) return { enviados: 0, borrados: 0 };
  webpush.setVapidDetails(VAPID_CONTACTO, VAPID_PUBLICA, VAPID_PRIVADA);
  const subs = await nube.suscripcionesDe([...new Set(avisos.map((a) => a.grueroId))]);
  let enviados = 0;
  let borrados = 0;
  await Promise.all(
    avisos.flatMap((a) =>
      subs
        .filter((s: SuscripcionPush) => s.gruero_id === a.grueroId)
        .map(async (s: SuscripcionPush) => {
          const carga = JSON.stringify({ titulo: a.titulo, cuerpo: a.cuerpo, etiqueta: `oferta-${a.servicioId}`, urgente: true, url: s.datos.url });
          try {
            await webpush.sendNotification({ endpoint: s.datos.endpoint, keys: s.datos.keys }, carga, { TTL: 90, urgency: 'high' });
            enviados += 1;
          } catch (err) {
            const codigo = (err as { statusCode?: number }).statusCode;
            if (codigo === 404 || codigo === 410) {
              await nube!.borrarSuscripcion(s.id); // el teléfono se dio de baja
              borrados += 1;
            } else console.error('push', codigo, (err as Error).message);
          }
        }),
    ),
  );
  return { enviados, borrados };
}

async function correr(): Promise<Response> {
  nube ??= crearNube();
  const tomado = await nube.tomarCandado(CANDADO, CANDADO_MS);
  if (!tomado) return Response.json({ saltado: 'otro paso en curso' });
  try {
    const resumen = await pasoServidor(nube);
    const push = await mandarPush(resumen.avisos);
    return Response.json({ ...resumen, push });
  } finally {
    await nube.soltarCandado(CANDADO);
  }
}

Deno.serve(async () => {
  try {
    // Dos llamadas seguidas al mismo proceso comparten el paso.
    enCurso ??= correr().finally(() => (enCurso = null));
    return await enCurso;
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});
