/** Contratos de la API (mismos nombres que el backend). */
export type EstadoZona = 'DISPONIBLE' | 'POCOS_CUPOS' | 'LLENA';
export type EstadoRetencion = 'VIGENTE' | 'CANCELADA' | 'EXPIRADA' | 'REASIGNADA' | 'INVALIDADA';

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
  aviso: string;
}

export interface Ubicacion {
  idZona: number;
  zonaCodigo: string;
  zonaNombre: string;
  pisoCodigo: string;
  pisoNombre: string;
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
  tipo: 'CREADA' | 'CANCELADA' | 'EXPIRADA' | 'REASIGNADA' | 'INVALIDADA';
  retencion: Retencion | null;
  anterior?: Retencion | null;
}
