import { PARAMETROS_INICIALES, type ParametrosTarifa } from '../domain/tarifa';
import type { Conductor, Coordenada, Gruero, Servicio } from '../domain/tipos';

export interface AjustesDemo {
  gruerosAutomaticos: boolean; // los grueros simulados aceptan y avanzan solos
  aprobacionAutomatica: boolean; // simula la respuesta del proveedor de verificación
}

export interface Estado {
  version: number;
  tarifa: ParametrosTarifa;
  demo: AjustesDemo;
  conductores: Conductor[];
  grueros: Gruero[];
  servicios: Servicio[];
}

export const CONDUCTOR_DEMO = 'c-demo';

export const CENTRO_CIUDAD: Coordenada = { lat: 14.6211, lng: -90.5163 };

export const DESTINOS_SUGERIDOS: { nombre: string; punto: Coordenada }[] = [
  { nombre: 'Taller en Zona 12', punto: { lat: 14.5876, lng: -90.5459 } },
  { nombre: 'Agencia en Zona 10', punto: { lat: 14.5998, lng: -90.5128 } },
  { nombre: 'Taller en Zona 1', punto: { lat: 14.6409, lng: -90.5133 } },
  { nombre: 'Taller en Mixco', punto: { lat: 14.6305, lng: -90.6029 } },
  { nombre: 'Taller en Zona 18', punto: { lat: 14.6553, lng: -90.4808 } },
];

function gruero(id: string, nombre: string, ubicacion: Coordenada, extra: Partial<Gruero> = {}): Gruero {
  return {
    id,
    nombre,
    telefono: '5555-0000',
    placaGrua: 'C-000AAA',
    tipoGrua: 'plataforma',
    calificacion: 4.7,
    disponible: true,
    ubicacion,
    ubicacionEn: Date.now(),
    ultimoServicioEn: 0,
    rechazosSeguidos: 0,
    comisionAcumulada: 0,
    automatico: true,
    ...extra,
  };
}

export function estadoInicial(): Estado {
  return {
    version: 4,
    tarifa: PARAMETROS_INICIALES,
    demo: { gruerosAutomaticos: true, aprobacionAutomatica: true },
    // Mientras el registro está desactivado, se entra directo con este conductor.
    conductores: [
      {
        id: CONDUCTOR_DEMO,
        telefono: '5555-1234',
        nombre: 'Conductor Demo',
        placa: 'P-123ABC',
        verificacion: 'aprobada',
        deudaCancelacion: 0,
      },
    ],
    grueros: [
      gruero('g-demo', 'Tu grúa (demo)', { lat: 14.6105, lng: -90.5205 }, {
        automatico: false,
        placaGrua: 'C-123GYA',
        calificacion: 5,
      }),
      gruero('g-z1', 'Grúas Don Beto', { lat: 14.6431, lng: -90.5156 }, { placaGrua: 'C-482BTZ', calificacion: 4.8 }),
      gruero('g-z18', 'Rescate Vial 18', { lat: 14.6575, lng: -90.4851 }, { placaGrua: 'C-905KLM', tipoGrua: 'arrastre' }),
      gruero('g-mixco', 'Grúas Mixco', { lat: 14.6331, lng: -90.6062 }, { placaGrua: 'C-311MXC', calificacion: 4.5 }),
      gruero('g-vn', 'Auxilio Villa Nueva', { lat: 14.5268, lng: -90.5874 }, { placaGrua: 'C-774VNV', calificacion: 4.6 }),
      gruero('g-z15', 'Grúas Express 15', { lat: 14.5902, lng: -90.4893 }, { placaGrua: 'C-650EXP', calificacion: 4.9 }),
    ],
    servicios: [],
  };
}
