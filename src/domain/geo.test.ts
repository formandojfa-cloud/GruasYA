import { describe, expect, it } from 'vitest';
import { largoRutaKm, puntoEnRuta, rutaRestante } from './geo';

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

describe('rutaRestante', () => {
  const ruta = [
    { lat: 14.6, lng: -90.5 },
    { lat: 14.61, lng: -90.5 },
    { lat: 14.62, lng: -90.5 },
  ];
  it('corta la ruta en el punto más cercano al vehículo', () => {
    const r = rutaRestante(ruta, { lat: 14.615, lng: -90.5001 });
    expect(r).toHaveLength(2);
    expect(r[0].lat).toBeCloseTo(14.615, 4);
    expect(r[1]).toEqual(ruta[2]);
  });
  it('deja la ruta completa si el vehículo está lejos de ella', () => {
    expect(rutaRestante(ruta, { lat: 14.61, lng: -90.6 })).toEqual(ruta);
  });
});
