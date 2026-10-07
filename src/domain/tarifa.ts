import type { TipoVehiculo } from './tipos';

export interface ParametrosTarifa {
  banderazo: number; // Q
  kmIncluidos: number;
  precioKm: number; // Q por km adicional
  factorVehiculo: Record<TipoVehiculo, number>;
  recargoNocturno: number; // multiplicador entre horaNocheInicio y horaNocheFin
  horaNocheInicio: number;
  horaNocheFin: number;
  comision: number; // fracción para GruaYa
  fraccionCancelacion: number; // fracción de la tarifa si se cancela tras aceptar
}

// Valores de ejemplo del documento de alcance; se ajustan desde administración.
export const PARAMETROS_INICIALES: ParametrosTarifa = {
  banderazo: 250,
  kmIncluidos: 5,
  precioKm: 15,
  factorVehiculo: { moto: 0.8, carro: 1, pickup: 1.2 },
  recargoNocturno: 1.2,
  horaNocheInicio: 22,
  horaNocheFin: 6,
  comision: 0.1,
  fraccionCancelacion: 0.5,
};

export function esHorarioNocturno(hora: number, p: ParametrosTarifa): boolean {
  return p.horaNocheInicio > p.horaNocheFin
    ? hora >= p.horaNocheInicio || hora < p.horaNocheFin
    : hora >= p.horaNocheInicio && hora < p.horaNocheFin;
}

export interface DesgloseTarifa {
  base: number;
  kmAdicionales: number;
  porKm: number;
  factorVehiculo: number;
  factorHorario: number;
  total: number; // redondeado a quetzales enteros
  comision: number;
  gananciaGruero: number;
}

export function calcularTarifa(
  distanciaKm: number,
  vehiculo: TipoVehiculo,
  hora: number,
  p: ParametrosTarifa = PARAMETROS_INICIALES,
): DesgloseTarifa {
  const kmAdicionales = Math.max(0, distanciaKm - p.kmIncluidos);
  const porKm = kmAdicionales * p.precioKm;
  const factorVehiculo = p.factorVehiculo[vehiculo];
  const factorHorario = esHorarioNocturno(hora, p) ? p.recargoNocturno : 1;
  const total = Math.round((p.banderazo + porKm) * factorVehiculo * factorHorario);
  const comision = Math.round(total * p.comision * 100) / 100;
  return {
    base: p.banderazo,
    kmAdicionales,
    porKm,
    factorVehiculo,
    factorHorario,
    total,
    comision,
    gananciaGruero: total - comision,
  };
}

export function cargoCancelacion(tarifa: number, p: ParametrosTarifa = PARAMETROS_INICIALES): number {
  return Math.round(tarifa * p.fraccionCancelacion);
}
