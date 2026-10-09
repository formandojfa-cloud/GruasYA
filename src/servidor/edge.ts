// Función de Supabase (Deno) que corre el reparto en el servidor. Se compila a
// supabase/functions/motor/index.ts con `npm run motor` y se despliega desde CI
// (o pegando ese archivo en el panel de Supabase → Edge Functions).
import { crearNube } from '../data/nube';
import { pasoServidor } from './paso';

declare const Deno: { serve(f: (r: Request) => Promise<Response>): void };

const CANDADO = 'motor';
const CANDADO_MS = 20_000;
let nube: ReturnType<typeof crearNube> | null = null;
let enCurso: Promise<Response> | null = null;

async function correr(): Promise<Response> {
  nube ??= crearNube();
  const tomado = await nube.tomarCandado(CANDADO, CANDADO_MS);
  if (!tomado) return Response.json({ saltado: 'otro paso en curso' });
  try {
    return Response.json(await pasoServidor(nube));
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
