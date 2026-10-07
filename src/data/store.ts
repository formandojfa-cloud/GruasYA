// Backend simulado para la demo: todo vive en localStorage y se sincroniza entre
// pestañas del mismo navegador. Así se puede abrir el conductor en una pestaña y
// el gruero en otra. La versión real reemplaza este archivo por un servidor.
import { useSyncExternalStore } from 'react';
import { estadoInicial, type Estado } from './semilla';

const CLAVE = 'gruaya-demo-v3';
let cache: Estado | null = null;
const oyentes = new Set<() => void>();

function leer(): Estado {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const e = JSON.parse(crudo) as Estado;
      if (e.version === 3) return e;
    }
  } catch {
    // almacenamiento bloqueado o dañado: se arranca de cero
  }
  return estadoInicial();
}

export function obtener(): Estado {
  if (!cache) cache = leer();
  return cache;
}

function avisar() {
  oyentes.forEach((f) => f());
}

// Lee lo último guardado (pudo cambiar en otra pestaña), aplica el cambio y guarda.
export function actualizar(cambio: (e: Estado) => void) {
  const e = structuredClone(leer());
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
  actualizar((e) => Object.assign(e, estadoInicial()));
}

if (typeof window !== 'undefined') {
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

export function nuevoId(prefijo: string) {
  return `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
