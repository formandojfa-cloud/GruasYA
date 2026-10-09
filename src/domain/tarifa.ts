import type { Clima, TipoVehiculo } from './tipos';

export interface ParametrosTarifa {
  banderazo: number; // Q
  kmIncluidos: number;
  precioKm: number; // Q por km adicional
  minutosIncluidos: number;
  precioMinuto: number; // Q por minuto adicional de viaje: así el tráfico se refleja en el precio
  factorVehiculo: Record<TipoVehiculo, number>;
  recargoNocturno: number; // multiplicador entre horaNocheInicio y horaNocheFin
  horaNocheInicio: number;
  horaNocheFin: number;
  recargoLluvia: number; // multiplicador con lluvia
  recargoLluviaFuerte: number; // multiplicador con lluvia fuerte o tormenta
  comision: number; // fracción para GruaYa
  fraccionCancelacion: number; // fracción de la tarifa si se cancela tras aceptar
}

// Decisión del usuario (2026-10-09): Q300 de banderazo + Q15 por km desde el primero; se ajustan desde administración.
export const PARAMETROS_INICIALES: ParametrosTarifa = {
  banderazo: 300,
  kmIncluidos: 0,
  precioKm: 15,
  minutosIncluidos: 15,
  precioMinuto: 3,
  factorVehiculo: { moto: 0.8, carro: 1, pickup: 1.2 },
  recargoNocturno: 1.2,
  horaNocheInicio: 22,
  horaNocheFin: 6,
  recargoLluvia: 1.15,
  recargoLluviaFuerte: 1.3,
  comision: 0.1,
  fraccionCancelacion: 0.5,
};

export function esHorarioNocturno(hora: number, p: ParametrosTarifa): boolean {
  return p.horaNocheInicio > p.horaNocheFin
    ? hora >= p.horaNocheInicio || hora < p.horaNocheFin
    : hora >= p.horaNocheInicio && hora < p.horaNocheFin;
}

export interface Viaje {
  distanciaKm: number; // por calle, recogida → destino
  minutos: number; // duración estimada con tráfico
  clima: Clima;
}

export function factorClima(clima: Clima, p: ParametrosTarifa): number {
  if (clima === 'lluvia') return p.recargoLluvia;
  if (clima === 'lluvia_fuerte') return p.recargoLluviaFuerte;
  return 1;
}

export interface DesgloseTarifa {
  base: number;
  kmAdicionales: number;
  porKm: number;
  minutosAdicionales: number;
  porMinuto: number;
  factorVehiculo: number;
  factorHorario: number;
  factorClima: number;
  total: number; // redondeado a quetzales enteros
  comision: number;
  gananciaGruero: number;
}

export function calcularTarifa(
  viaje: Viaje,
  vehiculo: TipoVehiculo,
  hora: number,
  p: ParametrosTarifa = PARAMETROS_INICIALES,
): DesgloseTarifa {
  const kmAdicionales = Math.max(0, viaje.distanciaKm - p.kmIncluidos);
  const porKm = kmAdicionales * p.precioKm;
  const minutosAdicionales = Math.max(0, viaje.minutos - p.minutosIncluidos);
  const porMinuto = minutosAdicionales * p.precioMinuto;
  const factorVehiculo = p.factorVehiculo[vehiculo];
  const factorHorario = esHorarioNocturno(hora, p) ? p.recargoNocturno : 1;
  const fClima = factorClima(viaje.clima, p);
  const total = Math.round((p.banderazo + porKm + porMinuto) * factorVehiculo * factorHorario * fClima);
  const comision = Math.round(total * p.comision * 100) / 100;
  return {
    base: p.banderazo,
    kmAdicionales,
    porKm,
    minutosAdicionales,
    porMinuto,
    factorVehiculo,
    factorHorario,
    factorClima: fClima,
    total,
    comision,
    gananciaGruero: total - comision,
  };
}

export function cargoCancelacion(tarifa: number, p: ParametrosTarifa = PARAMETROS_INICIALES): number {
  return Math.round(tarifa * p.fraccionCancelacion);
}
