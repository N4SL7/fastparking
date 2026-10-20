/** Contratos de la API (mismos nombres que el backend). */
export type EstadoZona = 'DISPONIBLE' | 'POCOS_CUPOS' | 'LLENA';
export type EstadoRetencion = 'VIGENTE' | 'CANCELADA' | 'EXPIRADA' | 'REASIGNADA' | 'INVALIDADA' | 'UTILIZADA';

export interface Zona {
  idZona: number;
  codigo: string;
  nombre: string;
  idPiso: number;
  pisoCodigo: string;
  pisoNombre: string;
  ordenCercania: number;
  capacidadTotal: number;
  ocupados: number;
  retenidas: number;
  cupoLogico: number;
  estado: EstadoZona;
  actualizadoEn: string;
}

export interface Piso {
  idPiso: number;
  codigo: string;
  nombre: string;
  zonas: Zona[];
}

export interface Disponibilidad {
  generadoEn: string;
  granularidad: 'ZONA';
  datosSimulados: boolean;
  pisos: Piso[];
}

export interface Retencion {
  idRetencion: string;
  estado: EstadoRetencion;
  idZona: number;
  zonaCodigo: string;
  zonaNombre: string;
  pisoNombre: string;
  creadaEn: string;
  venceEn: string;
  cerradaEn: string | null;
  motivoCierre: string | null;
  idRetencionOrigen: string | null;
  puesto: number | null;
  aviso: string;
}

export interface Ubicacion {
  idZona: number;
  zonaCodigo: string;
  zonaNombre: string;
  pisoCodigo: string;
  pisoNombre: string;
  puesto: number | null;
  referencia: string | null;
  registradaEn: string;
}

export interface Alternativa {
  idZona: number;
  codigo: string;
  nombre: string;
  pisoNombre: string;
  cupoLogico: number;
}

/** Mensaje SSE "retencion" */
export interface CambioRetencion {
  tipo: 'CREADA' | 'CANCELADA' | 'EXPIRADA' | 'REASIGNADA' | 'INVALIDADA' | 'UTILIZADA';
  retencion: Retencion | null;
  anterior?: Retencion | null;
}

export type MetodoPago = 'TARJETA' | 'NEQUI' | 'PSE';

export interface Comprobante {
  idPago: string;
  codigo: string;
  minutos: number;
  tarifaMinuto: number;
  valor: number;
  metodo: MetodoPago;
  estado: 'APROBADO_SIMULADO';
  pagadoEn: string;
  salidaHasta: string;
  ingreso: string;
  aviso: string;
}

export interface Cotizacion {
  ingreso: string;
  minutos: number;
  tarifaMinuto: number;
  valor: number;
  moneda: 'COP';
  tarifaIlustrativa: boolean;
  pago: Comprobante | null;
}
