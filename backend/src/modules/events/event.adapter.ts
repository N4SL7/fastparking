import { z } from 'zod';

/**
 * Adaptador de eventos de ocupación (contrato desacoplado, RNF-08).
 * Cualquier fuente (hoy el SIMULADOR; en el futuro un adaptador del fabricante de sensores, si el centro
 * comercial lo autoriza) debe convertir sus mensajes a este formato normalizado. Las reglas de negocio
 * nunca dependen de la marca o el protocolo del sensor.
 */
export interface EventoNormalizado {
  idEvento: string;
  codigoZona: string;
  tipo: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  fuente: 'SIMULADOR' | 'CONDUCTOR';
  ocurridoEn: Date;
}

/** Contrato de una fuente de ocupación. Solo existe la implementación simulada (ver /simulator). */
export interface FuenteOcupacion {
  readonly nombre: 'SIMULADOR';
  normalizar(mensaje: unknown): EventoNormalizado;
}

const EventoSimuladorSchema = z.object({
  idEvento: z.string().uuid(),
  zona: z.string().trim().min(1).max(10),
  tipo: z.enum(['ENTRADA', 'SALIDA']),
  cantidad: z.number().int().min(1).max(50).default(1),
  ocurridoEn: z.string().datetime({ offset: true }).optional(),
});

export const fuenteSimulador: FuenteOcupacion = {
  nombre: 'SIMULADOR',
  normalizar(mensaje) {
    const e = EventoSimuladorSchema.parse(mensaje);
    return {
      idEvento: e.idEvento,
      codigoZona: e.zona.toUpperCase(),
      tipo: e.tipo,
      cantidad: e.cantidad,
      fuente: 'SIMULADOR',
      ocurridoEn: e.ocurridoEn ? new Date(e.ocurridoEn) : new Date(),
    };
  },
};

/** Ocupación física resultante, limitada al rango [0, capacidad]. */
export function aplicarOcupacion(ocupados: number, capacidad: number, tipo: 'ENTRADA' | 'SALIDA', cantidad: number): number {
  return tipo === 'ENTRADA' ? Math.min(capacidad, ocupados + cantidad) : Math.max(0, ocupados - cantidad);
}
