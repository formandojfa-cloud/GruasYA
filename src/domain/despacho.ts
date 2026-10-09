import { distanciaKm, largoRutaKm, minutosEstimados } from './geo';
import { celdasCercanas, enCeldas, indicePorCelda } from './h3';
import type { Coordenada, Gruero, Servicio } from './tipos';

export interface ParametrosDespacho {
  radiosKm: number[]; // se prueba cada radio en orden antes de pasar a la central
  segundosParaAceptar: number;
  ubicacionVigenteMs: number; // ubicación más vieja que esto no cuenta
  rechazosParaPausar: number;
}

export const DESPACHO_INICIAL: ParametrosDespacho = {
  radiosKm: [5, 10],
  segundosParaAceptar: 90,
  ubicacionVigenteMs: 2 * 60 * 1000,
  rechazosParaPausar: 3,
};

export interface Candidato {
  gruero: Gruero;
  minutos: number;
}

// Grueros que pueden recibir la oferta, ordenados por quién llegaría antes;
// empate: mejor calificación, luego quien lleva más tiempo sin servicio.
export function candidatos(
  grueros: Gruero[],
  origen: Coordenada,
  radioKm: number,
  yaOfrecidos: Set<string>,
  ahora: number,
  p: ParametrosDespacho = DESPACHO_INICIAL,
  etas: Servicio['etas'] = {},
): Candidato[] {
  // Primero el índice H3 descarta las grúas fuera de las celdas cercanas;
  // después se mide la distancia exacta solo a las que quedan.
  const cercanas = enCeldas(indicePorCelda(grueros), celdasCercanas(origen, radioKm));
  return cercanas
    .filter(
      (g) =>
        g.disponible &&
        !yaOfrecidos.has(g.id) &&
        (g.automatico || ahora - g.ubicacionEn <= p.ubicacionVigenteMs) &&
        distanciaKm(g.ubicacion, origen) <= radioKm,
    )
    .map((gruero) => ({ gruero, minutos: etas[gruero.id]?.minutos ?? minutosEstimados(gruero.ubicacion, origen) }))
    .sort(
      (a, b) =>
        a.minutos - b.minutos ||
        b.gruero.calificacion - a.gruero.calificacion ||
        a.gruero.ultimoServicioEn - b.gruero.ultimoServicioEn,
    );
}

export type Decision =
  | { tipo: 'ofrecer'; grueroId: string; radioKm: number }
  | { tipo: 'esperar' } // hay una oferta vigente
  | { tipo: 'sin_grua' };

// Siguiente paso del despacho para un servicio en estado "buscando".
export function siguientePaso(
  servicio: Servicio,
  grueros: Gruero[],
  ahora: number,
  p: ParametrosDespacho = DESPACHO_INICIAL,
): Decision {
  const vigente = servicio.ofertas.find(
    (o) => !o.resultado && ahora - o.enviadaEn < p.segundosParaAceptar * 1000,
  );
  if (vigente) return { tipo: 'esperar' };

  const yaOfrecidos = new Set(servicio.ofertas.map((o) => o.grueroId));
  const radios = p.radiosKm.filter((r) => r >= servicio.radioKm);
  for (const radioKm of radios) {
    const [primero] = candidatos(grueros, servicio.origen, radioKm, yaOfrecidos, ahora, p, servicio.etas);
    if (primero) return { tipo: 'ofrecer', grueroId: primero.gruero.id, radioKm };
  }
  return { tipo: 'sin_grua' };
}

// Oferta sin respuesta que ya pasó su tiempo.
export function ofertaVencida(servicio: Servicio, ahora: number, p: ParametrosDespacho = DESPACHO_INICIAL) {
  return servicio.ofertas.find((o) => !o.resultado && ahora - o.enviadaEn >= p.segundosParaAceptar * 1000);
}

// Minutos que le faltan a la grúa asignada para llegar al cliente: por la ruta
// de calles si ya se calculó; si no, la estimación en línea recta.
export function minutosParaLlegar(servicio: Servicio, grua: Coordenada): number {
  if (servicio.rutaGrua && servicio.minutosGrua !== undefined) {
    const largo = largoRutaKm(servicio.rutaGrua);
    const falta = largo > 0 ? Math.max(0, 1 - (servicio.avanceGruaKm ?? 0) / largo) : 0;
    return servicio.minutosGrua * falta;
  }
  return minutosEstimados(grua, servicio.origen);
}
