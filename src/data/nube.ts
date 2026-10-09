// Datos en la nube (Supabase) para que conductor y piloto se vean desde teléfonos
// distintos. Cada conductor, gruero, servicio y los ajustes son una fila con el
// objeto completo en JSON; la app sigue trabajando con el mismo Estado de la demo
// y aquí solo se mandan las filas que cambiaron.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ParametrosTarifa } from '../domain/tarifa';
import type { Conductor, Gruero, Servicio } from '../domain/tipos';
import { estadoInicial, type AjustesDemo, type Estado } from './semilla';

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '')
  .replace(/\/+$/, '');
const CLAVE = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const HAY_NUBE = Boolean(URL && CLAVE);

type Tabla = 'ajustes' | 'conductores' | 'grueros' | 'servicios';
interface Fila {
  id: string;
  datos: unknown;
}

const REFRESCO_MS = 5_000; // por si los avisos en vivo no llegan

let cliente: SupabaseClient | null = null;
function conexion(): SupabaseClient {
  if (!cliente) cliente = createClient(URL!, CLAVE!, { auth: { persistSession: false } });
  return cliente;
}

// Identifica este navegador: el servicio lo despacha el teléfono que lo pidió.
export function idDispositivo(): string {
  try {
    const guardado = localStorage.getItem('gruaya-dispositivo');
    if (guardado) return guardado;
    const nuevo = `d-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('gruaya-dispositivo', nuevo);
    return nuevo;
  } catch {
    return 'd-sin-almacenamiento';
  }
}

function armar(filas: Record<Tabla, Fila[]>): Estado {
  const base = estadoInicial();
  const ajustes = filas.ajustes.find((f) => f.id === 'global')?.datos as
    | { tarifa: ParametrosTarifa; demo: AjustesDemo }
    | undefined;
  return {
    version: base.version,
    tarifa: ajustes?.tarifa ?? base.tarifa,
    demo: ajustes?.demo ?? base.demo,
    conductores: filas.conductores.map((f) => f.datos as Conductor),
    grueros: filas.grueros.map((f) => f.datos as Gruero),
    servicios: filas.servicios
      .map((f) => f.datos as Servicio)
      .sort((a, b) => a.creadoEn - b.creadoEn),
  };
}

function filasDe(e: Estado): Record<Tabla, Fila[]> {
  return {
    ajustes: [{ id: 'global', datos: { tarifa: e.tarifa, demo: e.demo } }],
    conductores: e.conductores.map((c) => ({ id: c.id, datos: c })),
    grueros: e.grueros.map((g) => ({ id: g.id, datos: g })),
    servicios: e.servicios.map((s) => ({ id: s.id, datos: s })),
  };
}

export interface Nube {
  cargar(): Promise<Estado>;
  // Manda a la nube solo lo que cambió entre dos estados.
  guardar(antes: Estado, despues: Estado): Promise<void>;
  borrarTodo(): Promise<void>;
  // Llama a `alCambiar` con el estado nuevo cuando otro teléfono cambia algo, y a
  // `alEstado` con el estado del canal en vivo (conectado o no).
  escuchar(alCambiar: (e: Estado) => void, alEstado?: (conectado: boolean) => void): () => void;
}

export function crearNube(): Nube {
  const sb = conexion();
  let filas: Record<Tabla, Fila[]> = { ajustes: [], conductores: [], grueros: [], servicios: [] };

  async function leerTodo(): Promise<Record<Tabla, Fila[]>> {
    const tablas: Tabla[] = ['ajustes', 'conductores', 'grueros', 'servicios'];
    const resultados = await Promise.all(tablas.map((t) => sb.from(t).select('id, datos')));
    const salida = { ajustes: [], conductores: [], grueros: [], servicios: [] } as Record<Tabla, Fila[]>;
    tablas.forEach((t, i) => {
      const r = resultados[i];
      if (r.error) throw new Error(`${t}: ${r.error.message}`);
      salida[t] = (r.data ?? []) as Fila[];
    });
    return salida;
  }

  async function sembrar() {
    const inicial = filasDe(estadoInicial());
    for (const t of Object.keys(inicial) as Tabla[]) {
      if (inicial[t].length === 0) continue;
      const { error } = await sb.from(t).upsert(inicial[t]);
      if (error) throw new Error(`${t}: ${error.message}`);
    }
  }

  return {
    async cargar() {
      filas = await leerTodo();
      if (filas.ajustes.length === 0) {
        // Primera vez: se crean la tarifa, el conductor demo y los grueros de ejemplo.
        await sembrar();
        filas = await leerTodo();
      }
      return armar(filas);
    },

    async guardar(antes, despues) {
      const a = filasDe(antes);
      const d = filasDe(despues);
      const tareas: PromiseLike<unknown>[] = [];
      for (const t of Object.keys(d) as Tabla[]) {
        const previas = new Map(a[t].map((f) => [f.id, JSON.stringify(f.datos)]));
        const cambiadas = d[t].filter((f) => previas.get(f.id) !== JSON.stringify(f.datos));
        if (cambiadas.length) tareas.push(sb.from(t).upsert(cambiadas).then(({ error }) => error && console.error(t, error.message)));
        const actuales = new Set(d[t].map((f) => f.id));
        const borradas = a[t].filter((f) => !actuales.has(f.id)).map((f) => f.id);
        if (borradas.length) tareas.push(sb.from(t).delete().in('id', borradas).then(({ error }) => error && console.error(t, error.message)));
      }
      filas = d;
      await Promise.all(tareas);
    },

    async borrarTodo() {
      for (const t of ['servicios', 'conductores', 'grueros', 'ajustes'] as Tabla[]) {
        const { error } = await sb.from(t).delete().neq('id', '');
        if (error) throw new Error(`${t}: ${error.message}`);
      }
      filas = { ajustes: [], conductores: [], grueros: [], servicios: [] };
    },

    escuchar(alCambiar, alEstado) {
      const aplicar = (t: Tabla, tipo: string, nueva?: Fila, vieja?: { id: string }) => {
        const lista = filas[t].filter((f) => f.id !== (nueva?.id ?? vieja?.id));
        if (tipo !== 'DELETE' && nueva) lista.push(nueva);
        filas = { ...filas, [t]: lista };
        alCambiar(armar(filas));
      };
      const canal = sb.channel('gruaya');
      for (const t of ['ajustes', 'conductores', 'grueros', 'servicios'] as Tabla[]) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, (ev) =>
          aplicar(t, ev.eventType, ev.new as Fila | undefined, ev.old as { id: string } | undefined),
        );
      }
      canal.subscribe((estado) => alEstado?.(estado === 'SUBSCRIBED'));
      const refresco = setInterval(() => {
        leerTodo()
          .then((f) => {
            filas = f;
            alCambiar(armar(filas));
          })
          .catch((err) => console.error('refresco', err));
      }, REFRESCO_MS);
      return () => {
        clearInterval(refresco);
        void sb.removeChannel(canal);
      };
    },
  };
}
