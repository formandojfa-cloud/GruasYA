import { useEffect, useState } from 'react';
import { calcularRuta, consultarClima, type Ruta } from '../data/rutas';
import { distanciaKm } from '../domain/geo';
import type { Clima, Coordenada, Gruero } from '../domain/tipos';

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

// Minutos por calle de la grúa libre más rápida en llegar (se consultan las 3 más
// cercanas en línea recta). null mientras se calcula o si no hay grúas.
export function useEtaGrua(origen: Coordenada, grueros: Gruero[]) {
  const [eta, setEta] = useState<number | null>(null);
  const cercanas = [...grueros]
    .sort((a, b) => distanciaKm(a.ubicacion, origen) - distanciaKm(b.ubicacion, origen))
    .slice(0, 3);
  const clave = `${origen.lat},${origen.lng};${cercanas.map((g) => g.id).join(',')}`;

  useEffect(() => {
    let vigente = true;
    setEta(null);
    if (cercanas.length === 0) return;
    const t = setTimeout(async () => {
      const hora = new Date().getHours();
      const rutas = await Promise.all(cercanas.map((g) => calcularRuta(g.ubicacion, origen, hora)));
      if (vigente) setEta(Math.min(...rutas.map((r) => r.minutos)));
    }, 600);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
    // la clave resume el origen y qué grúas se consultan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return eta;
}
