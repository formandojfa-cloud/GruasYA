import type { Clima, EstadoServicio, Problema, TipoVehiculo } from '../domain/tipos';

export const quetzales = (n: number) => {
  const decimales = Number.isInteger(n) ? 0 : 2;
  return `Q${n.toLocaleString('es-GT', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
};

export const km = (n: number) => `${n.toLocaleString('es-GT', { maximumFractionDigits: 1 })} km`;

export const minutos = (n: number) => `${Math.max(1, Math.round(n))} min`;

export const NOMBRE_VEHICULO: Record<TipoVehiculo, string> = {
  moto: 'Moto',
  carro: 'Carro',
  pickup: 'Pickup o camioneta',
};

export const NOMBRE_PROBLEMA: Record<Problema, string> = {
  no_arranca: 'No arranca',
  choque: 'Choque',
  llanta: 'Llanta sin repuesto',
  otro: 'Otro',
};

export const NOMBRE_ESTADO: Record<EstadoServicio, string> = {
  buscando: 'Buscando grúa',
  asignado: 'Grúa en camino',
  en_sitio: 'La grúa llegó',
  en_ruta: 'Rumbo al destino',
  entregado: 'Entregado, falta confirmar pago',
  pagado: 'Pagado',
  sin_grua: 'Sin grúa: la central te llama',
  cancelado: 'Cancelado',
};

export const NOMBRE_CLIMA: Record<Clima, string> = {
  seco: 'sin lluvia',
  lluvia: 'lluvia',
  lluvia_fuerte: 'lluvia fuerte',
};
