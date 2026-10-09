// Corre el despacho y la simulación de la demo una vez por segundo. Solo una
// pestaña lo ejecuta a la vez (Web Locks); en producción esto vive en el servidor.
import { DESPACHO_INICIAL, ofertaVencida, siguientePaso } from '../domain/despacho';
import { avanzar, distanciaKm, largoRutaKm, puntoEnRuta } from '../domain/geo';
import { aceptar, cerrarSiPagado, contarRechazo } from './acciones';
import { calcularEtas, calcularRutaGrua } from './eta';
import type { Estado } from './semilla';
import { HAY_NUBE, idDispositivo } from './nube';
import { actualizar } from './store';

const SEGUNDOS_BOT_ACEPTA = 4;
const SEGUNDOS_EN_SITIO = 6;
const KM_POR_TICK = 0.25; // velocidad acelerada para que la demo no tarde
const ESPERA_ETAS_MS = 6000; // tiempo máximo esperando rutas antes de ofrecer igual
const RECALCULAR_GPS_MS = 30_000;

// `dispositivo`: en la nube, este teléfono solo despacha y simula los servicios que
// pidió él mismo; así dos teléfonos no se pisan escribiendo el mismo servicio.
export function tick(e: Estado, ahora: number, dispositivo?: string) {
  if (!dispositivo) {
    for (const g of e.grueros) {
      if (!g.gpsEnVivo && (g.disponible || !g.automatico)) g.ubicacionEn = ahora; // GPS simulado
    }
  }

  for (const c of e.conductores) {
    if (c.verificacion === 'pendiente' && e.demo.aprobacionAutomatica) c.verificacion = 'aprobada';
  }

  for (const s of e.servicios) {
    if (dispositivo && s.dispositivo !== dispositivo) continue;
    if (s.estado === 'buscando') {
      // Antes de la primera oferta se piden los tiempos por calle de los candidatos.
      if (!s.etasListas) {
        void calcularEtas(s.id);
        if (ahora - s.creadoEn < ESPERA_ETAS_MS) continue;
      }
      const vencida = ofertaVencida(s, ahora);
      if (vencida) {
        vencida.resultado = 'vencida';
        const g = e.grueros.find((x) => x.id === vencida.grueroId);
        if (g) contarRechazo(g);
      }
      // Con las grúas simuladas apagadas no se les ofrece: cada oferta a un bot
      // que no responde costaría 90 s antes de llegar al piloto real.
      const elegibles = e.grueros.filter((g) => !g.automatico || e.demo.gruerosAutomaticos);
      const paso = siguientePaso(s, elegibles, ahora, DESPACHO_INICIAL);
      if (paso.tipo === 'ofrecer') {
        s.radioKm = paso.radioKm;
        s.ofertas.push({ grueroId: paso.grueroId, enviadaEn: ahora });
      } else if (paso.tipo === 'sin_grua') {
        s.estado = 'sin_grua';
      }

      const pendiente = s.ofertas.find((o) => !o.resultado);
      const bot = pendiente && e.grueros.find((x) => x.id === pendiente.grueroId && x.automatico);
      if (pendiente && bot && e.demo.gruerosAutomaticos && ahora - pendiente.enviadaEn >= SEGUNDOS_BOT_ACEPTA * 1000) {
        aceptar(e, s.id, bot.id);
      }
      continue;
    }

    const g = s.grueroId ? e.grueros.find((x) => x.id === s.grueroId) : undefined;
    if (!g) continue;
    const auto = g.automatico && e.demo.gruerosAutomaticos;

    if (s.estado === 'asignado') {
      if (!s.rutaGrua || (g.gpsEnVivo && ahora - (s.rutaGruaEn ?? 0) > RECALCULAR_GPS_MS)) void calcularRutaGrua(s.id);
      if (!g.gpsEnVivo && g.automatico) {
        if (s.rutaGrua) {
          // La grúa simulada avanza por las calles hacia el cliente.
          s.avanceGruaKm = Math.min((s.avanceGruaKm ?? 0) + KM_POR_TICK, largoRutaKm(s.rutaGrua));
          g.ubicacion =
            s.avanceGruaKm >= largoRutaKm(s.rutaGrua) ? s.origen : puntoEnRuta(s.rutaGrua, s.avanceGruaKm);
        } else g.ubicacion = acercar(g.ubicacion, s.origen);
      }
      if (auto && distanciaKm(g.ubicacion, s.origen) < 0.05) {
        s.estado = 'en_sitio';
        s.llegadaEn = ahora;
        s.chat.push({ de: 'gruero', texto: 'Ya llegué, estoy junto a su vehículo.', en: ahora });
      }
    } else if (s.estado === 'en_sitio' && auto) {
      if (ahora - (s.llegadaEn ?? ahora) >= SEGUNDOS_EN_SITIO * 1000) {
        s.evidencias = ['foto-1.jpg', 'foto-2.jpg', 'video-360.mp4'];
        s.estado = 'en_ruta';
      }
    } else if (s.estado === 'en_ruta') {
      // La grúa avanza por las calles de la ruta cotizada.
      s.avanceKm = (s.avanceKm ?? 0) + KM_POR_TICK;
      if (!g.gpsEnVivo && g.automatico) g.ubicacion = puntoEnRuta(s.ruta, s.avanceKm);
      if (auto && s.avanceKm >= largoRutaKm(s.ruta)) {
        s.estado = 'entregado';
        s.cobradoPorGruero = true;
        cerrarSiPagado(e, s);
      }
    }
  }
}

function acercar(desde: { lat: number; lng: number }, hacia: { lat: number; lng: number }) {
  const d = distanciaKm(desde, hacia);
  if (d === 0) return hacia;
  return avanzar(desde, hacia, KM_POR_TICK / d);
}

export function arrancarMotor() {
  const correr = () => {
    const id = setInterval(() => actualizar((e) => tick(e, Date.now(), HAY_NUBE ? idDispositivo() : undefined)), 1000);
    return () => clearInterval(id);
  };
  try {
    navigator.locks.request('gruaya-motor', () => new Promise<void>(() => correr())).catch(correr);
  } catch {
    correr(); // navegador sin Web Locks
  }
}
