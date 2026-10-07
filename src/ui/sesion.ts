import { useState } from 'react';

// Recuerda por pestaña quién es el usuario, para poder abrir varios papeles a la vez.
export function useSesion(clave: string, inicial: string | null = null) {
  const [valor, setValor] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(clave) ?? inicial;
    } catch {
      return inicial;
    }
  });
  const guardar = (v: string | null) => {
    setValor(v);
    try {
      if (v === null) sessionStorage.removeItem(clave);
      else sessionStorage.setItem(clave, v);
    } catch {
      // sin almacenamiento la sesión dura lo que la pestaña
    }
  };
  return [valor, guardar] as const;
}
