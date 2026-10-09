// Variables de entorno en los tres lugares donde corre este código: la app
// (Vite las mete en import.meta.env al compilar), la función en Supabase (Deno)
// y Node (pruebas, scripts).
type Env = Record<string, string | undefined>;
declare const Deno: { env: { get(n: string): string | undefined } } | undefined;
declare const process: { env: Env } | undefined;

export function leerEntorno(...nombres: string[]): string | undefined {
  const vite = (import.meta as unknown as { env?: Env }).env;
  for (const n of nombres) {
    const v =
      vite?.[n] ??
      (typeof Deno !== 'undefined' ? Deno?.env.get(n) : undefined) ??
      (typeof process !== 'undefined' ? process?.env?.[n] : undefined);
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}
