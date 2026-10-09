// Tiempos de llegada por calle. La búsqueda H3 y la línea recta sirven para
// encontrar candidatos rápido; el tiempo que se promete sale de la ruta real
// (Mapbox con tráfico, u OSRM), que sí rodea barrancos, puentes y sentidos.
// Las funciones "De" son puras (reciben el estado y devuelven el resultado) y
// las usa también el servidor; las otras aplican el resultado sobre el store de la app.
import { distanciaKm } from '../domain/geo';
import { celdasCercanas, enCeldas, indicePorCelda } from '../domain/h3';
import type { Servicio } from '../domain/tipos';
import { calcularRuta, type Ruta } from './rutas';
import type { Estado } from './semilla';
import { actualizar, obtener } from './store';

const CANDIDATOS_A_CONSULTAR = 5;
const RADIO_MAXIMO_KM = 10;
const enCurso = new Set<string>();

// Rutas de las grúas más cercanas (pilotos reales primero) hacia el cliente.
export async function etasDe(e: Estado, servicioId: string): Promise<Servicio['etas']> {
  const s = e.servicios.find((x) => x.id === servicioId);
  if (!s) return {};
  const libres = e.grueros.filter((g) => g.disponible);
  const cercanas = enCeldas(indicePorCelda(libres), celdasCercanas(s.origen, RADIO_MAXIMO_KM))
    .sort((a, b) => Number(a.automatico) - Number(b.automatico) || distanciaKm(a.ubicacion, s.origen) - distanciaKm(b.ubicacion, s.origen))
    .slice(0, CANDIDATOS_A_CONSULTAR);
  const hora = new Date().getHours();
  const rutas = await Promise.all(cercanas.map((g) => calcularRuta(g.ubicacion, s.origen, hora)));
  return Object.fromEntries(cercanas.map((g, i) => [g.id, { minutos: rutas[i].minutos, km: rutas[i].distanciaKm }]));
}

// Ruta de la grúa asignada hasta el cliente.
export async function rutaGruaDe(e: Estado, servicioId: string): Promise<Ruta | undefined> {
  const s = e.servicios.find((x) => x.id === servicioId);
  const g = s && e.grueros.find((x) => x.id === s.grueroId);
  if (!s || !g) return undefined;
  return calcularRuta(g.ubicacion, s.origen, new Date().getHours());
}

export function aplicarRutaGrua(s: Servicio, r: Ruta) {
  s.rutaGrua = r.geometria;
  s.rutaGruaPasos = r.pasos;
  s.minutosGrua = r.minutos;
  s.avanceGruaKm = 0;
  s.rutaGruaEn = Date.now();
  s.etaPrometido ??= r.minutos;
}

// Consulta la ruta de las grúas más cercanas en línea recta hacia el cliente.
export async function calcularEtas(servicioId: string) {
  if (enCurso.has(servicioId)) return;
  enCurso.add(servicioId);
  try {
    const etas = await etasDe(obtener(), servicioId);
    actualizar((e2) => {
      const s2 = e2.servicios.find((x) => x.id === servicioId);
      if (!s2) return;
      s2.etas = etas;
      s2.etasListas = true;
    });
  } catch {
    actualizar((e2) => {
      const s2 = e2.servicios.find((x) => x.id === servicioId);
      if (s2) s2.etasListas = true; // sin rutas, el despacho usa la estimación
    });
  } finally {
    enCurso.delete(servicioId);
  }
}

// Ruta de la grúa asignada hasta el cliente; se vuelve a pedir si la grúa usa GPS real.
export async function calcularRutaGrua(servicioId: string) {
  const clave = `grua:${servicioId}`;
  if (enCurso.has(clave)) return;
  enCurso.add(clave);
  try {
    const r = await rutaGruaDe(obtener(), servicioId);
    if (!r) return;
    actualizar((e2) => {
      const s2 = e2.servicios.find((x) => x.id === servicioId);
      if (!s2 || s2.estado !== 'asignado') return;
      aplicarRutaGrua(s2, r);
    });
  } finally {
    enCurso.delete(clave);
  }
}
