// Índice de hexágonos H3 (Uber, código abierto). Cada ubicación cae en una celda;
// para buscar grúas cercanas se toman las celdas alrededor del cliente en vez de
// medir la distancia a todas las grúas de la ciudad.
import { cellToBoundary, getHexagonEdgeLengthAvg, gridDisk, latLngToCell, UNITS } from 'h3-js';
import type { Coordenada } from './tipos';

// Resolución 8: hexágonos de ~0.46 km de lado (~0.7 km²), del tamaño de unas cuadras.
export const RESOLUCION = 8;

const LADO_KM = getHexagonEdgeLengthAvg(RESOLUCION, UNITS.km);
// Distancia entre centros de hexágonos vecinos.
const PASO_KM = LADO_KM * Math.sqrt(3);

export const celdaDe = (p: Coordenada) => latLngToCell(p.lat, p.lng, RESOLUCION);

// Anillos necesarios para cubrir todo un círculo del radio dado (con margen).
export const anillosParaRadio = (radioKm: number) => Math.ceil(radioKm / (PASO_KM * Math.sqrt(3) / 2)) + 1;

export function celdasCercanas(p: Coordenada, radioKm: number): Set<string> {
  return new Set(gridDisk(celdaDe(p), anillosParaRadio(radioKm)));
}

// Agrupa elementos por celda: así funciona el índice que tendría el servidor.
export function indicePorCelda<T extends { ubicacion: Coordenada }>(lista: T[]): Map<string, T[]> {
  const indice = new Map<string, T[]>();
  for (const x of lista) {
    const c = celdaDe(x.ubicacion);
    indice.set(c, [...(indice.get(c) ?? []), x]);
  }
  return indice;
}

// Elementos cuyas celdas caen dentro del área de búsqueda.
export function enCeldas<T>(indice: Map<string, T[]>, celdas: Set<string>): T[] {
  const res: T[] = [];
  for (const [c, xs] of indice) if (celdas.has(c)) res.push(...xs);
  return res;
}

export const bordeCelda = (celda: string): Coordenada[] =>
  cellToBoundary(celda).map(([lat, lng]) => ({ lat, lng }));
