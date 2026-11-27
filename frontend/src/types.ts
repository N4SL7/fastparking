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
  /** v2.0 (D-23): estado real de cada puesto. */
  puestos?: { numero: number; estado: 'LIBRE' | 'OCUPADO' | 'RETENIDO'; conFastParking?: boolean }[];
}

export interface Piso {
  idPiso: number;
  codigo: string;
  nombre: string;
  zonas: Zona[];
}

export interface Disponibilidad {
  generadoEn: string;
  granularidad: 'ZONA' | 'PUESTO';
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
  /** v2.0: aviso redactado por el agente (LLM) o por el plan B de reglas. */
  mensaje?: string;
  motor?: 'LLM' | 'REGLAS';
}

/** v2.0: GET /api/demo/estado */
export interface DecisionAgente {
  creadaEn: string;
  motivo: 'PUESTO_OCUPADO' | 'CONFLICTO_OCUPACION';
  motor: 'LLM' | 'REGLAS';
  modelo: string | null;
  zonaAnterior: string;
  puestoAnterior: number | null;
  zonaNueva: string | null;
  puestoNuevo: number | null;
  propuestaValida: boolean;
  herramientas: string[];
  mensaje: string | null;
  error: string | null;
  latenciaMs: number;
}

export interface EstadoDemo {
  trafico: { activo: boolean; intervaloMs: number; eventosGenerados: number };
  agente: { motor: 'LLM' | 'REGLAS'; modelo: string | null };
  controlesHabilitados: boolean;
  decisiones: DecisionAgente[];
  navegaciones?: { idZona: number; puesto: number; duracionMs: number; transcurridoMs: number; desde?: { x: number; y: number } }[];
  intruso?: EstadoIntruso;
}

/** v2.1: fase del carro intruso de la demostración. */
export interface EstadoIntruso {
  fase: 'INACTIVO' | 'ESPERANDO' | 'EN_CAMINO' | 'ESTACIONADO';
  zona?: string;
  puesto?: number;
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
