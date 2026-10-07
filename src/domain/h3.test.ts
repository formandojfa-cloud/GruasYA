import { describe, expect, it } from 'vitest';
import { distanciaKm } from './geo';
import { anillosParaRadio, bordeCelda, celdaDe, celdasCercanas, enCeldas, indicePorCelda } from './h3';

const CENTRO = { lat: 14.6349, lng: -90.5069 }; // Ciudad de Guatemala

describe('H3', () => {
  it('ubica un punto en una celda de resolución 8 con 6 lados', () => {
    const c = celdaDe(CENTRO);
    expect(c).toMatch(/^88/);
    expect(bordeCelda(c)).toHaveLength(6);
  });

  it('el área de búsqueda cubre todo punto dentro del radio', () => {
    for (const radio of [5, 10]) {
      const celdas = celdasCercanas(CENTRO, radio);
      for (let i = 0; i < 360; i += 10) {
        const a = (i * Math.PI) / 180;
        const p = { lat: CENTRO.lat + (radio / 111.32) * Math.cos(a), lng: CENTRO.lng + (radio / (111.32 * Math.cos((CENTRO.lat * Math.PI) / 180))) * Math.sin(a) };
        expect(distanciaKm(CENTRO, p)).toBeCloseTo(radio, 0);
        expect(celdas.has(celdaDe(p))).toBe(true);
      }
    }
  });

  it('no busca en toda la ciudad: 5 km son unos cientos de celdas', () => {
    expect(anillosParaRadio(5)).toBeLessThan(12);
    expect(celdasCercanas(CENTRO, 5).size).toBeLessThan(400);
  });

  it('el índice devuelve solo lo que está en las celdas pedidas', () => {
    const cerca = { id: 'cerca', ubicacion: { lat: CENTRO.lat + 0.01, lng: CENTRO.lng } };
    const lejos = { id: 'lejos', ubicacion: { lat: CENTRO.lat + 0.5, lng: CENTRO.lng } };
    const ids = enCeldas(indicePorCelda([cerca, lejos]), celdasCercanas(CENTRO, 5)).map((x) => x.id);
    expect(ids).toEqual(['cerca']);
  });
});
