export type Coordenada = { lat: number; lng: number };

export type TipoVehiculo = 'moto' | 'carro' | 'pickup';
export type TipoGrua = 'plataforma' | 'arrastre';
export type Problema = 'no_arranca' | 'choque' | 'llanta' | 'otro';

export type EstadoServicio =
  | 'buscando' // ofreciendo a grueros cercanos
  | 'asignado' // un gruero aceptó y va en camino
  | 'en_sitio' // el gruero llegó al vehículo
  | 'en_ruta' // vehículo cargado rumbo al destino
  | 'entregado' // falta confirmar el pago en efectivo
  | 'pagado' // ambos confirmaron el pago
  | 'sin_grua' // nadie aceptó: lo toma la central
  | 'cancelado';

export type Verificacion = 'pendiente' | 'aprobada' | 'rechazada';

export interface Conductor {
  id: string;
  telefono: string;
  nombre: string;
  placa: string;
  verificacion: Verificacion;
  dpiFrente?: string; // nombre de archivo (en la demo no se guarda la imagen)
  dpiReverso?: string;
  selfie?: string;
  deudaCancelacion: number; // Q pendientes por cancelar tarde
}

export interface Gruero {
  id: string;
  nombre: string;
  telefono: string;
  placaGrua: string;
  tipoGrua: TipoGrua;
  calificacion: number; // promedio 1 a 5
  disponible: boolean;
  ubicacion: Coordenada;
  ubicacionEn: number; // epoch ms de la última ubicación
  ultimoServicioEn: number; // epoch ms; sirve para desempatar
  rechazosSeguidos: number;
  comisionAcumulada: number; // Q registrados (no cobrados en el piloto)
  automatico?: boolean; // gruero simulado de la demo
}

export interface Oferta {
  grueroId: string;
  enviadaEn: number;
  resultado?: 'aceptada' | 'rechazada' | 'vencida';
}

export interface MensajeChat {
  de: 'conductor' | 'gruero';
  texto: string;
  en: number;
}

export interface Servicio {
  id: string;
  conductorId: string;
  creadoEn: number;
  origen: Coordenada;
  destino: Coordenada;
  destinoTexto: string;
  vehiculo: TipoVehiculo;
  problema: Problema;
  distanciaKm: number;
  tarifa: number;
  comision: number;
  estado: EstadoServicio;
  radioKm: number;
  ofertas: Oferta[];
  grueroId?: string;
  llegadaEn?: number; // cuando el gruero marcó que llegó
  evidencias: string[]; // fotos y video al cargar
  cobradoPorGruero: boolean;
  pagoConfirmadoConductor: boolean;
  calificacion?: number;
  cargoCancelacion?: number;
  chat: MensajeChat[];
}
