import { cargoCancelacion, calcularTarifa } from '../domain/tarifa';
import type { Clima, Conductor, Coordenada, Gruero, Problema, Servicio, TipoVehiculo } from '../domain/tipos';
import type { Ruta } from './rutas';
import type { Estado } from './semilla';
import { actualizar, nuevoId } from './store';

const RECHAZOS_PARA_PAUSAR = 3;

function servicio(e: Estado, id: string) {
  const s = e.servicios.find((x) => x.id === id);
  if (!s) throw new Error(`Servicio ${id} no existe`);
  return s;
}

function gruero(e: Estado, id: string) {
  const g = e.grueros.find((x) => x.id === id);
  if (!g) throw new Error(`Gruero ${id} no existe`);
  return g;
}

// ---------- Conductor ----------

export function registrarConductor(datos: Omit<Conductor, 'id' | 'verificacion' | 'deudaCancelacion'>): string {
  const id = nuevoId('c');
  actualizar((e) => {
    e.conductores.push({ ...datos, id, verificacion: 'pendiente', deudaCancelacion: 0 });
  });
  return id;
}

export interface Solicitud {
  conductorId: string;
  origen: Coordenada;
  destino: Coordenada;
  destinoTexto: string;
  vehiculo: TipoVehiculo;
  problema: Problema;
  ruta: Ruta; // cotizada al mostrar el precio, para cobrar exactamente lo mostrado
  clima: Clima;
}

export function pedirGrua(sol: Solicitud): string {
  const id = nuevoId('s');
  actualizar((e) => {
    const conductor = e.conductores.find((c) => c.id === sol.conductorId);
    const { ruta, clima, ...resto } = sol;
    const t = calcularTarifa({ distanciaKm: ruta.distanciaKm, minutos: ruta.minutos, clima }, sol.vehiculo, new Date().getHours(), e.tarifa);
    // La cancelación tardía pendiente se cobra junto con este servicio.
    const deuda = conductor?.deudaCancelacion ?? 0;
    if (conductor) conductor.deudaCancelacion = 0;
    const s: Servicio = {
      id,
      ...resto,
      creadoEn: Date.now(),
      distanciaKm: ruta.distanciaKm,
      minutos: ruta.minutos,
      clima,
      ruta: ruta.geometria,
      fuenteRuta: ruta.fuente,
      tarifa: t.total + deuda,
      comision: t.comision,
      estado: 'buscando',
      radioKm: 0,
      ofertas: [],
      evidencias: [],
      cobradoPorGruero: false,
      pagoConfirmadoConductor: false,
      cargoCancelacion: deuda || undefined,
      chat: [],
    };
    e.servicios.push(s);
  });
  return id;
}

export function cancelarServicio(servicioId: string) {
  actualizar((e) => {
    const s = servicio(e, servicioId);
    if (!['buscando', 'asignado', 'en_sitio', 'sin_grua'].includes(s.estado)) return;
    if (s.grueroId && (s.estado === 'asignado' || s.estado === 'en_sitio')) {
      const cargo = cargoCancelacion(s.tarifa, e.tarifa);
      const c = e.conductores.find((x) => x.id === s.conductorId);
      if (c) c.deudaCancelacion += cargo;
      s.cargoCancelacion = cargo;
      const g = gruero(e, s.grueroId);
      g.disponible = true;
    }
    s.ofertas.forEach((o) => (o.resultado ??= 'vencida'));
    s.estado = 'cancelado';
  });
}

export function confirmarPagoConductor(servicioId: string) {
  actualizar((e) => {
    const s = servicio(e, servicioId);
    s.pagoConfirmadoConductor = true;
    cerrarSiPagado(e, s);
  });
}

export function calificar(servicioId: string, estrellas: number) {
  actualizar((e) => {
    const s = servicio(e, servicioId);
    if (s.calificacion || !s.grueroId) return;
    s.calificacion = estrellas;
    const g = gruero(e, s.grueroId);
    const previas = e.servicios.filter((x) => x.grueroId === g.id && x.calificacion && x.id !== s.id);
    const suma = previas.reduce((acc, x) => acc + (x.calificacion ?? 0), g.calificacion) + estrellas;
    g.calificacion = Math.round((suma / (previas.length + 2)) * 10) / 10;
  });
}

export function enviarMensaje(servicioId: string, de: 'conductor' | 'gruero', texto: string) {
  if (!texto.trim()) return;
  actualizar((e) => {
    servicio(e, servicioId).chat.push({ de, texto: texto.trim(), en: Date.now() });
  });
}

// ---------- Gruero ----------

// Ubicación en vivo desde el GPS del teléfono del gruero.
export function actualizarUbicacion(grueroId: string, p: Coordenada) {
  actualizar((e) => {
    const g = gruero(e, grueroId);
    g.ubicacion = p;
    g.ubicacionEn = Date.now();
    g.gpsEnVivo = true;
  });
}

export function dejarGps(grueroId: string) {
  actualizar((e) => {
    gruero(e, grueroId).gpsEnVivo = false;
  });
}

export function cambiarDisponible(grueroId: string, disponible: boolean) {
  actualizar((e) => {
    const g = gruero(e, grueroId);
    g.disponible = disponible;
    g.ubicacionEn = Date.now();
    if (disponible) g.rechazosSeguidos = 0;
  });
}

export function aceptarOferta(servicioId: string, grueroId: string) {
  actualizar((e) => aceptar(e, servicioId, grueroId));
}

export function aceptar(e: Estado, servicioId: string, grueroId: string) {
  const s = servicio(e, servicioId);
  const oferta = s.ofertas.find((o) => o.grueroId === grueroId && !o.resultado);
  if (!oferta || s.estado !== 'buscando') return;
  oferta.resultado = 'aceptada';
  s.grueroId = grueroId;
  s.estado = 'asignado';
  const g = gruero(e, grueroId);
  g.disponible = false;
  g.rechazosSeguidos = 0;
}

export function rechazarOferta(servicioId: string, grueroId: string) {
  actualizar((e) => {
    const s = servicio(e, servicioId);
    const oferta = s.ofertas.find((o) => o.grueroId === grueroId && !o.resultado);
    if (!oferta) return;
    oferta.resultado = 'rechazada';
    contarRechazo(gruero(e, grueroId));
  });
}

export function contarRechazo(g: Gruero) {
  g.rechazosSeguidos += 1;
  if (g.rechazosSeguidos >= RECHAZOS_PARA_PAUSAR) g.disponible = false;
}

export function marcarLlegada(servicioId: string) {
  actualizar((e) => {
    const s = servicio(e, servicioId);
    if (s.estado === 'asignado') {
      s.estado = 'en_sitio';
      s.llegadaEn = Date.now();
    }
  });
}

export function marcarCargado(servicioId: string, evidencias: string[]) {
  actualizar((e) => {
    const s = servicio(e, servicioId);
    if (s.estado !== 'en_sitio') return;
    s.evidencias = evidencias;
    s.estado = 'en_ruta';
  });
}

export function marcarEntregadoYCobrado(servicioId: string) {
  actualizar((e) => {
    const s = servicio(e, servicioId);
    if (s.estado !== 'en_ruta') return;
    s.estado = 'entregado';
    s.cobradoPorGruero = true;
    cerrarSiPagado(e, s);
  });
}

// El pago en efectivo se da por bueno cuando gruero y conductor lo confirman.
// La comisión se registra pero no se cobra durante el piloto.
export function cerrarSiPagado(e: Estado, s: Servicio) {
  if (s.estado !== 'entregado' || !s.cobradoPorGruero || !s.pagoConfirmadoConductor || !s.grueroId) return;
  s.estado = 'pagado';
  const g = gruero(e, s.grueroId);
  g.comisionAcumulada = Math.round((g.comisionAcumulada + s.comision) * 100) / 100;
  g.disponible = true;
  g.ultimoServicioEn = Date.now();
}

// ---------- Administración ----------

export function revisarConductor(conductorId: string, aprobado: boolean) {
  actualizar((e) => {
    const c = e.conductores.find((x) => x.id === conductorId);
    if (c) c.verificacion = aprobado ? 'aprobada' : 'rechazada';
  });
}
