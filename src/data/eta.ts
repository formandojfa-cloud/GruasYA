// Tiempos de llegada por calle. La búsqueda H3 y la línea recta sirven para
// encontrar candidatos rápido; el tiempo que se promete sale de la ruta real
// (Mapbox con tráfico, u OSRM), que sí rodea barrancos, puentes y sentidos.
import { distanciaKm } from '../domain/geo';
import { celdasCercanas, enCeldas, indicePorCelda } from '../domain/h3';
import { calcularRuta } from './rutas';
import { actualizar, obtener } from './store';

const CANDIDATOS_A_CONSULTAR = 5;
const RADIO_MAXIMO_KM = 10;
const enCurso = new Set<string>();

// Consulta la ruta de las grúas más cercanas en línea recta hacia el cliente.
export async function calcularEtas(servicioId: string) {
  if (enCurso.has(servicioId)) return;
  enCurso.add(servicioId);
  try {
    const e = obtener();
    const s = e.servicios.find((x) => x.id === servicioId);
    if (!s) return;
    const libres = e.grueros.filter((g) => g.disponible);
    const cercanas = enCeldas(indicePorCelda(libres), celdasCercanas(s.origen, RADIO_MAXIMO_KM))
      .sort((a, b) => distanciaKm(a.ubicacion, s.origen) - distanciaKm(b.ubicacion, s.origen))
      .slice(0, CANDIDATOS_A_CONSULTAR);
    const hora = new Date().getHours();
    const rutas = await Promise.all(cercanas.map((g) => calcularRuta(g.ubicacion, s.origen, hora)));
    actualizar((e2) => {
      const s2 = e2.servicios.find((x) => x.id === servicioId);
      if (!s2) return;
      s2.etas = Object.fromEntries(cercanas.map((g, i) => [g.id, { minutos: rutas[i].minutos, km: rutas[i].distanciaKm }]));
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
    const e = obtener();
    const s = e.servicios.find((x) => x.id === servicioId);
    const g = s && e.grueros.find((x) => x.id === s.grueroId);
    if (!s || !g) return;
    const r = await calcularRuta(g.ubicacion, s.origen, new Date().getHours());
    actualizar((e2) => {
      const s2 = e2.servicios.find((x) => x.id === servicioId);
      if (!s2 || s2.estado !== 'asignado') return;
      s2.rutaGrua = r.geometria;
      s2.rutaGruaPasos = r.pasos;
      s2.minutosGrua = r.minutos;
      s2.avanceGruaKm = 0;
      s2.rutaGruaEn = Date.now();
      s2.etaPrometido ??= r.minutos;
    });
  } finally {
    enCurso.delete(clave);
  }
}
