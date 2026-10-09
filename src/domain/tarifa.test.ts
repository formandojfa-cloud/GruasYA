import { describe, expect, it } from 'vitest';
import { calcularTarifa, cargoCancelacion, esHorarioNocturno, PARAMETROS_INICIALES, type Viaje } from './tarifa';

const viaje = (distanciaKm: number, minutos = 10, clima: Viaje['clima'] = 'seco'): Viaje => ({ distanciaKm, minutos, clima });

describe('calcularTarifa', () => {
  it('cobra el ejemplo del documento: carro, 15 km, de día = Q525', () => {
    const t = calcularTarifa(viaje(15), 'carro', 12);
    expect(t.total).toBe(525);
    expect(t.comision).toBe(52.5);
    expect(t.gananciaGruero).toBe(472.5);
  });

  it('aplica el recargo nocturno: el mismo viaje de noche = Q630', () => {
    expect(calcularTarifa(viaje(15), 'carro', 23).total).toBe(630);
    expect(calcularTarifa(viaje(15), 'carro', 3).total).toBe(630);
  });

  it('cobra banderazo más km desde el primero', () => {
    expect(calcularTarifa(viaje(4), 'carro', 12).total).toBe(360);
  });

  it('ajusta por tipo de vehículo', () => {
    expect(calcularTarifa(viaje(5), 'moto', 12).total).toBe(300);
    expect(calcularTarifa(viaje(5), 'pickup', 12).total).toBe(450);
  });
});

describe('tráfico y clima', () => {
  it('cobra los minutos de viaje arriba de los incluidos', () => {
    // 15 km en 40 min: Q300 + 15 km × Q15 + 25 min × Q3 = Q600
    expect(calcularTarifa(viaje(15, 40), 'carro', 12).total).toBe(600);
  });

  it('aplica recargo por lluvia y por lluvia fuerte', () => {
    expect(calcularTarifa(viaje(15, 10, 'lluvia'), 'carro', 12).total).toBe(604);
    expect(calcularTarifa(viaje(15, 10, 'lluvia_fuerte'), 'carro', 12).total).toBe(683);
  });
});

describe('esHorarioNocturno', () => {
  it('reconoce el rango que cruza la medianoche', () => {
    expect(esHorarioNocturno(22, PARAMETROS_INICIALES)).toBe(true);
    expect(esHorarioNocturno(5, PARAMETROS_INICIALES)).toBe(true);
    expect(esHorarioNocturno(6, PARAMETROS_INICIALES)).toBe(false);
    expect(esHorarioNocturno(21, PARAMETROS_INICIALES)).toBe(false);
  });
});

describe('cargoCancelacion', () => {
  it('es la mitad de la tarifa', () => {
    expect(cargoCancelacion(550)).toBe(275);
  });
});
