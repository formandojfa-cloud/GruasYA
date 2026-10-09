// Un paso del reparto en el servidor: carga el estado de la nube, calcula lo que
// haga falta por internet (tiempos por calle, ruta de las grúas simuladas),
// corre el mismo `tick` de la app y guarda solo lo que cambió. Lo llama la
// función de Supabase cada pocos segundos y al instante cuando alguien pide,
// acepta o rechaza.
import { aplicarRutaGrua, etasDe, rutaGruaDe } from '../data/eta';
import { tick } from '../data/motor';
import type { Nube } from '../data/nube';
import type { Estado } from '../data/semilla';

const TOPE_RUTAS_MS = 6000;

function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tiempo agotado')), ms);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

export interface ResumenPaso {
  servicios: number;
  buscando: number;
  ofertasNuevas: number;
  ms: number;
}

// Rellena, antes del tick, lo que el tick no puede esperar: tiempos por calle de
// los servicios nuevos y la ruta de las grúas simuladas recién asignadas.
export async function prepararEstado(e: Estado) {
  const nuevos = e.servicios.filter((s) => s.estado === 'buscando' && !s.etasListas);
  await Promise.all(
    nuevos.map(async (s) => {
      try {
        s.etas = await conTope(etasDe(e, s.id), TOPE_RUTAS_MS);
      } catch {
        // sin rutas, el despacho usa la estimación en línea recta
      }
      s.etasListas = true;
    }),
  );
  const simuladas = e.servicios.filter((s) => {
    const g = e.grueros.find((x) => x.id === s.grueroId);
    return s.estado === 'asignado' && !s.rutaGrua && g?.automatico;
  });
  await Promise.all(
    simuladas.map(async (s) => {
      try {
        const r = await conTope(rutaGruaDe(e, s.id), TOPE_RUTAS_MS);
        if (r) aplicarRutaGrua(s, r);
      } catch {
        // la grúa simulada avanza en línea recta
      }
    }),
  );
}

export async function pasoServidor(nube: Nube, ahora = Date.now()): Promise<ResumenPaso> {
  const inicio = Date.now();
  const e = await nube.cargar();
  const antes = structuredClone(e);
  await prepararEstado(e);
  const ofertasAntes = e.servicios.reduce((n, s) => n + s.ofertas.length, 0);
  tick(e, ahora, { servidor: true });
  e.motorServidorEn = ahora;
  await nube.guardar(antes, e);
  return {
    servicios: e.servicios.length,
    buscando: e.servicios.filter((s) => s.estado === 'buscando').length,
    ofertasNuevas: e.servicios.reduce((n, s) => n + s.ofertas.length, 0) - ofertasAntes,
    ms: Date.now() - inicio,
  };
}
