// Empaqueta la función del servidor en un solo archivo para Supabase (Deno).
import { build } from 'esbuild';
await build({
  entryPoints: ['src/servidor/edge.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'supabase/functions/motor/index.ts',
  legalComments: 'none',
  external: ['npm:*'], // Deno los resuelve al desplegar
  minify: true,
  banner: { js: '// Generado por `npm run motor` desde src/servidor/edge.ts. No editar a mano.' },
});
console.log('listo: supabase/functions/motor/index.ts');
