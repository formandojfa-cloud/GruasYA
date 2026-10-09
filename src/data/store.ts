// Estado de la app. Con Supabase configurado (VITE_SUPABASE_URL y
// VITE_SUPABASE_ANON_KEY) los datos viven en la nube y se comparten entre
// teléfonos; si no, viven en localStorage y se sincronizan entre pestañas del
// mismo navegador (modo demo).
import { useSyncExternalStore } from 'react';
import { crearNube, HAY_NUBE, type Nube } from './nube';
import { estadoInicial, type Estado } from './semilla';

const CLAVE = 'gruaya-demo-v6';
let cache: Estado | null = null;
const oyentes = new Set<() => void>();

// ---------- nube ----------
let nube: Nube | null = null;
let listo = !HAY_NUBE; // en modo demo no hay nada que esperar
let errorNube = '';
let tiempoReal = false; // canal en vivo de Supabase conectado
let escuchando = false;

function arrancarNube() {
  if (!HAY_NUBE || nube) return;
  nube = crearNube();
  nube
    .cargar()
    .then((e) => {
      cache = e;
      listo = true;
      errorNube = '';
      if (!escuchando) {
        escuchando = true;
        nube!.escuchar(
          (nuevo) => {
            cache = nuevo;
            avisar();
          },
          (conectado) => {
            tiempoReal = conectado;
            avisar();
          },
        );
      }
      avisar();
    })
    .catch((err: Error) => {
      errorNube = err.message;
      avisar();
    });
}

function leerLocal(): Estado {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const e = JSON.parse(crudo) as Estado;
      if (e.version === 4) return e;
    }
  } catch {
    // almacenamiento bloqueado o dañado: se arranca de cero
  }
  return estadoInicial();
}

export function obtener(): Estado {
  if (!cache) cache = HAY_NUBE ? estadoInicial() : leerLocal();
  return cache;
}

function avisar() {
  oyentes.forEach((f) => f());
}

// Aplica el cambio sobre lo último conocido y lo guarda (nube o localStorage).
export function actualizar(cambio: (e: Estado) => void) {
  if (HAY_NUBE) {
    if (!listo) return; // todavía no llegó el estado real: no se escribe nada encima
    const antes = cache!;
    const e = structuredClone(antes);
    cambio(e);
    cache = e;
    avisar();
    void nube!.guardar(antes, e);
    return;
  }
  const e = structuredClone(leerLocal());
  cambio(e);
  cache = e;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    // sin almacenamiento la demo sigue funcionando en esta pestaña
  }
  avisar();
}

export function reiniciar() {
  if (HAY_NUBE) {
    listo = false;
    avisar();
    nube!
      .borrarTodo()
      .then(() => nube!.cargar())
      .then((e) => {
        cache = e;
        listo = true;
        avisar();
      })
      .catch((err: Error) => {
        errorNube = err.message;
        avisar();
      });
    return;
  }
  actualizar((e) => Object.assign(e, estadoInicial()));
}

if (typeof window !== 'undefined') {
  if (HAY_NUBE) arrancarNube();
  else
    window.addEventListener('storage', (ev) => {
      if (ev.key === CLAVE) {
        cache = null;
        avisar();
      }
    });
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function useEstado(): Estado {
  return useSyncExternalStore(suscribir, obtener);
}

export interface Conexion {
  nube: boolean;
  listo: boolean;
  error: string;
  tiempoReal: boolean;
}
const leerConexion = (): Conexion => ({ nube: HAY_NUBE, listo, error: errorNube, tiempoReal });
let conexionCache = leerConexion();
export function useConexion(): Conexion {
  return useSyncExternalStore(suscribir, () => {
    const c = leerConexion();
    if (c.nube !== conexionCache.nube || c.listo !== conexionCache.listo || c.error !== conexionCache.error || c.tiempoReal !== conexionCache.tiempoReal)
      conexionCache = c;
    return conexionCache;
  });
}

export function reintentarNube() {
  nube = null;
  errorNube = '';
  arrancarNube();
}

export function nuevoId(prefijo: string) {
  return `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
