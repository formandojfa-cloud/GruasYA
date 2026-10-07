import { describe, expect, it } from 'vitest';
import { candidatos, ofertaVencida, siguientePaso } from './despacho';
import type { Gruero, Servicio } from './tipos';

const AHORA = 1_000_000_000;
const ORIGEN = { lat: 14.6, lng: -90.5 };
// ~0.009 grados de latitud ≈ 1 km
const aKm = (km: number) => ({ lat: ORIGEN.lat + km * 0.009, lng: ORIGEN.lng });

function gruero(id: string, km: number, extra: Partial<Gruero> = {}): Gruero {
  return {
    id,
    nombre: id,
    telefono: '',
    placaGrua: '',
    tipoGrua: 'plataforma',
    calificacion: 4.5,
    disponible: true,
    ubicacion: aKm(km),
    ubicacionEn: AHORA,
    ultimoServicioEn: 0,
    rechazosSeguidos: 0,
    comisionAcumulada: 0,
    ...extra,
  };
}

function servicio(extra: Partial<Servicio> = {}): Servicio {
  return {
    id: 's1',
    conductorId: 'c1',
    creadoEn: AHORA,
    origen: ORIGEN,
    destino: aKm(5),
    destinoTexto: '',
    vehiculo: 'carro',
    problema: 'no_arranca',
    distanciaKm: 5,
    minutos: 15,
    clima: 'seco',
    ruta: [ORIGEN, aKm(5)],
    fuenteRuta: 'estimada',
    tarifa: 250,
    comision: 25,
    estado: 'buscando',
    radioKm: 5,
    ofertas: [],
    evidencias: [],
    cobradoPorGruero: false,
    pagoConfirmadoConductor: false,
    chat: [],
    ...extra,
  };
}

describe('candidatos', () => {
  it('ordena por cercanía y descarta no disponibles, lejanos o sin ubicación reciente', () => {
    const lista = candidatos(
      [
        gruero('lejos', 3),
        gruero('cerca', 1),
        gruero('ocupado', 0.5, { disponible: false }),
        gruero('fuera', 8),
        gruero('viejo', 0.2, { ubicacionEn: AHORA - 3 * 60 * 1000 }),
      ],
      ORIGEN,
      5,
      new Set(),
      AHORA,
    );
    expect(lista.map((c) => c.gruero.id)).toEqual(['cerca', 'lejos']);
  });

  it('desempata por calificación', () => {
    const lista = candidatos(
      [gruero('a', 1, { calificacion: 4 }), gruero('b', 1, { calificacion: 5 })],
      ORIGEN,
      5,
      new Set(),
      AHORA,
    );
    expect(lista[0].gruero.id).toBe('b');
  });
});

describe('siguientePaso', () => {
  it('ofrece al más cercano dentro de 5 km', () => {
    expect(siguientePaso(servicio(), [gruero('a', 2), gruero('b', 1)], AHORA)).toEqual({
      tipo: 'ofrecer',
      grueroId: 'b',
      radioKm: 5,
    });
  });

  it('espera mientras la oferta tiene tiempo', () => {
    const s = servicio({ ofertas: [{ grueroId: 'b', enviadaEn: AHORA - 30_000 }] });
    expect(siguientePaso(s, [gruero('b', 1)], AHORA)).toEqual({ tipo: 'esperar' });
  });

  it('pasa al siguiente si el primero rechazó', () => {
    const s = servicio({ ofertas: [{ grueroId: 'b', enviadaEn: AHORA, resultado: 'rechazada' }] });
    expect(siguientePaso(s, [gruero('a', 2), gruero('b', 1)], AHORA)).toMatchObject({ grueroId: 'a' });
  });

  it('amplía a 10 km cuando no queda nadie en 5 km', () => {
    expect(siguientePaso(servicio(), [gruero('a', 8)], AHORA)).toEqual({
      tipo: 'ofrecer',
      grueroId: 'a',
      radioKm: 10,
    });
  });

  it('manda a la central si no hay nadie ni a 10 km', () => {
    expect(siguientePaso(servicio(), [gruero('a', 15)], AHORA)).toEqual({ tipo: 'sin_grua' });
  });
});

describe('ofertaVencida', () => {
  it('detecta una oferta sin respuesta tras 90 segundos', () => {
    const s = servicio({ ofertas: [{ grueroId: 'b', enviadaEn: AHORA - 91_000 }] });
    expect(ofertaVencida(s, AHORA)?.grueroId).toBe('b');
    expect(ofertaVencida(s, AHORA - 2_000)).toBeUndefined();
  });
});
