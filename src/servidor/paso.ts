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

export interface OfertaNueva {
  servicioId: string;
  grueroId: string;
  titulo: string;
  cuerpo: string;
}

export interface ResumenPaso {
  servicios: number;
  buscando: number;
  ofertasNuevas: number;
  avisos: OfertaNueva[]; // para mandar las notificaciones push
  ms: number;
}

const NOMBRE_VEHICULO: Record<string, string> = { carro: 'Carro', moto: 'Moto', pickup: 'Pickup o camioneta' };
const NOMBRE_PROBLEMA: Record<string, string> = {
  no_arranca: 'No arranca',
  accidente: 'Accidente',
  llanta: 'Llanta',
  bateria: 'Batería',
  otro: 'Otro',
};

// Qué ofertas aparecieron en este paso (comparando con el estado anterior).
export function ofertasNuevas(antes: Estado, despues: Estado): OfertaNueva[] {
  const previas = new Set(antes.servicios.flatMap((s) => s.ofertas.map((o) => `${s.id}|${o.grueroId}|${o.enviadaEn}`)));
  const salida: OfertaNueva[] = [];
  for (const s of despues.servicios) {
    for (const o of s.ofertas) {
      if (o.resultado || previas.has(`${s.id}|${o.grueroId}|${o.enviadaEn}`)) continue;
      const eta = s.etas?.[o.grueroId]?.minutos;
      salida.push({
        servicioId: s.id,
        grueroId: o.grueroId,
        titulo: `Nueva solicitud · Q${Math.round(s.tarifa - s.comision)} para ti`,
        cuerpo: `${eta ? `Recogida a ${Math.max(1, Math.round(eta))} min · ` : ''}${NOMBRE_VEHICULO[s.vehiculo] ?? s.vehiculo} · ${
          NOMBRE_PROBLEMA[s.problema] ?? s.problema
        } · tienes 90 s`,
      });
    }
  }
  return salida;
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
  tick(e, ahora, { servidor: true });
  e.motorServidorEn = ahora;
  await nube.guardar(antes, e);
  const avisos = ofertasNuevas(antes, e);
  return {
    servicios: e.servicios.length,
    buscando: e.servicios.filter((s) => s.estado === 'buscando').length,
    ofertasNuevas: avisos.length,
    avisos,
    ms: Date.now() - inicio,
  };
}
