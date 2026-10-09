import { describe, expect, it } from 'vitest';
import { calcularTarifa, cargoCancelacion, esHorarioNocturno, PARAMETROS_INICIALES, type Viaje } from './tarifa';

const viaje = (distanciaKm: number, minutos = 10, clima: Viaje['clima'] = 'seco'): Viaje => ({ distanciaKm, minutos, clima });

describe('calcularTarifa', () => {
  it('cobra el ejemplo del documento: carro, 15 km, de día = Q375', () => {
    const t = calcularTarifa(viaje(15), 'carro', 12);
    expect(t.total).toBe(375);
    expect(t.comision).toBe(37.5);
    expect(t.gananciaGruero).toBe(337.5);
  });

  it('aplica el recargo nocturno: el mismo viaje de noche = Q450', () => {
    expect(calcularTarifa(viaje(15), 'carro', 23).total).toBe(450);
    expect(calcularTarifa(viaje(15), 'carro', 3).total).toBe(450);
  });

  it('solo cobra banderazo dentro de los km incluidos', () => {
    expect(calcularTarifa(viaje(4), 'carro', 12).total).toBe(300);
  });

  it('ajusta por tipo de vehículo', () => {
    expect(calcularTarifa(viaje(5), 'moto', 12).total).toBe(240);
    expect(calcularTarifa(viaje(5), 'pickup', 12).total).toBe(360);
  });
});

describe('tráfico y clima', () => {
  it('cobra los minutos de viaje arriba de los incluidos', () => {
    // 15 km en 40 min: Q300 + 5 km × Q15 + 25 min × Q3 = Q450
    expect(calcularTarifa(viaje(15, 40), 'carro', 12).total).toBe(450);
  });

  it('aplica recargo por lluvia y por lluvia fuerte', () => {
    expect(calcularTarifa(viaje(15, 10, 'lluvia'), 'carro', 12).total).toBe(431);
    expect(calcularTarifa(viaje(15, 10, 'lluvia_fuerte'), 'carro', 12).total).toBe(488);
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
