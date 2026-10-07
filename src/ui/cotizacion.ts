import { useEffect, useState } from 'react';
import { calcularRuta, consultarClima, type Ruta } from '../data/rutas';
import type { Clima, Coordenada } from '../domain/tipos';

export interface Cotizacion {
  ruta: Ruta;
  clima: Clima;
}

// Pide ruta y clima cada vez que cambian los puntos (con una pausa corta para no
// consultar en cada toque del mapa) y descarta respuestas viejas.
export function useCotizacion(origen: Coordenada, destino: Coordenada) {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const clave = `${origen.lat},${origen.lng};${destino.lat},${destino.lng}`;

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const t = setTimeout(async () => {
      const [ruta, clima] = await Promise.all([
        calcularRuta(origen, destino, new Date().getHours()),
        consultarClima(origen),
      ]);
      if (vigente) {
        setCotizacion({ ruta, clima });
        setCargando(false);
      }
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
    // la clave resume origen y destino
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return { cotizacion, cargando };
}
