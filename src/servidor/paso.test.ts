import { describe, expect, it, vi } from 'vitest';
import type { Nube } from '../data/nube';
import { estadoInicial, type Estado } from '../data/semilla';
import { pasoServidor } from './paso';

// Nube de mentira: guarda el estado en memoria y anota qué se escribió.
function nubeDePrueba(e: Estado) {
  const escrituras: Estado[] = [];
  const nube: Nube = {
    cargar: async () => structuredClone(e),
    guardar: async (_antes, despues) => {
      escrituras.push(structuredClone(despues));
      e = despues;
    },
    borrarTodo: async () => {},
    escuchar: () => () => {},
    avisarMotor: () => {},
    tomarCandado: async () => true,
    soltarCandado: async () => {},
  };
  return { nube, escrituras, estado: () => e };
}

function conSolicitud(): Estado {
  const e = estadoInicial();
  const real = e.grueros.find((g) => !g.automatico)!;
  real.gpsEnVivo = true;
  real.ubicacionEn = Date.now();
  e.servicios.push({
    id: 's-1',
    conductorId: 'c-demo',
    estado: 'buscando',
    creadoEn: Date.now() - 10_000, // ya pasó la espera de rutas
    vehiculo: 'carro',
    problema: 'no_arranca',
    origen: { ...real.ubicacion, lat: real.ubicacion.lat + 0.01 },
    destino: { lat: 14.58, lng: -90.55 },
    destinoTexto: 'Taller',
    distanciaKm: 8,
    minutos: 20,
    clima: 'seco',
    fuenteRuta: 'estimada',
    radioKm: 0,
    ruta: [],
    tarifa: 300,
    comision: 30,
    ofertas: [],
    evidencias: [],
    cobradoPorGruero: false,
    pagoConfirmadoConductor: false,
    chat: [],
  });
  return e;
}

describe('pasoServidor', () => {
  it('ofrece la solicitud nueva al piloto real y deja el latido del servidor', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('sin internet en la prueba')));
    const { nube, escrituras, estado } = nubeDePrueba(conSolicitud());
    const ahora = Date.now();
    const r = await pasoServidor(nube, ahora);
    expect(r.ofertasNuevas).toBe(1);
    const s = estado().servicios[0];
    expect(s.etasListas).toBe(true);
    expect(s.ofertas[0].grueroId).toBe('g-demo');
    expect(estado().motorServidorEn).toBe(ahora);
    expect(escrituras).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('no ofrece dos veces en dos pasos seguidos', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('sin internet')));
    const { nube, estado } = nubeDePrueba(conSolicitud());
    await pasoServidor(nube);
    await pasoServidor(nube);
    expect(estado().servicios[0].ofertas).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
