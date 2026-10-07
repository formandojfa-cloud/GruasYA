import { describe, expect, it } from 'vitest';
import { largoRutaKm, puntoEnRuta } from './geo';

const ruta = [
  { lat: 14.6, lng: -90.5 },
  { lat: 14.61, lng: -90.5 },
  { lat: 14.61, lng: -90.49 },
];

describe('puntoEnRuta', () => {
  it('avanza siguiendo los tramos, no en línea recta', () => {
    const total = largoRutaKm(ruta);
    expect(puntoEnRuta(ruta, 0)).toEqual(ruta[0]);
    expect(puntoEnRuta(ruta, total + 1)).toEqual(ruta[2]);
    // a mitad del primer tramo la longitud no ha cambiado
    expect(puntoEnRuta(ruta, total / 4).lng).toBeCloseTo(-90.5);
  });
});
