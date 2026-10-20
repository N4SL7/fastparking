/** D-11: catálogo único de estados de la retención temporal simulada. */
export const ESTADOS_RETENCION = ['VIGENTE', 'CANCELADA', 'EXPIRADA', 'REASIGNADA', 'INVALIDADA'] as const;
export type EstadoRetencion = (typeof ESTADOS_RETENCION)[number];

/**
 * RN-06: solo una retención VIGENTE puede cambiar de estado; los demás estados son finales.
 *   VIGENTE → CANCELADA   (el conductor cancela, RF-08)
 *   VIGENTE → EXPIRADA    (se alcanza vence_en, RF-05)
 *   VIGENTE → REASIGNADA  (un evento ocupa la zona y existe alternativa; nace una retención nueva, RF-15)
 *   VIGENTE → INVALIDADA  (un evento ocupa la zona y no hay alternativa, RF-06/RF-07)
 */
const TRANSICIONES: Record<EstadoRetencion, readonly EstadoRetencion[]> = {
  VIGENTE: ['CANCELADA', 'EXPIRADA', 'REASIGNADA', 'INVALIDADA'],
  CANCELADA: [],
  EXPIRADA: [],
  REASIGNADA: [],
  INVALIDADA: [],
};

export function esTransicionValida(desde: EstadoRetencion, hacia: EstadoRetencion): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

/** RN-13: cuando un evento deja la zona sin cupo, ceden primero las retenciones MÁS RECIENTES (respeta el orden de llegada). */
export function seleccionarAfectadas<T extends { creadaEn: Date }>(vigentes: T[], exceso: number): T[] {
  if (exceso <= 0) return [];
  return [...vigentes].sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime()).slice(0, exceso);
}
