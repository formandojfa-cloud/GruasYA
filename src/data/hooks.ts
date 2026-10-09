// Ganchos de React sobre el store (separados para que el servidor no cargue React).
import { useSyncExternalStore } from 'react';
import { obtener, obtenerConexion, suscribir, type Conexion } from './store';
import type { Estado } from './semilla';

export function useEstado(): Estado {
  return useSyncExternalStore(suscribir, obtener);
}

export function useConexion(): Conexion {
  return useSyncExternalStore(suscribir, obtenerConexion);
}
