/** Reglas puras de disponibilidad (sin base de datos), probadas con pruebas unitarias. */

export type EstadoZona = 'DISPONIBLE' | 'POCOS_CUPOS' | 'LLENA';

/** RN-12: cupo lógico = capacidad − ocupados físicos (eventos) − retenciones vigentes. Nunca negativo. */
export function calcularCupoLogico(capacidad: number, ocupados: number, retenidas: number): number {
  return Math.max(0, capacidad - ocupados - retenidas);
}

/** RF-03: estado textual de la zona. "Pocos cupos" = 20 % de la capacidad o menos (mínimo 2). */
export function clasificarZona(cupoLogico: number, capacidad: number): EstadoZona {
  if (cupoLogico <= 0) return 'LLENA';
  if (cupoLogico <= Math.max(2, Math.ceil(capacidad * 0.2))) return 'POCOS_CUPOS';
  return 'DISPONIBLE';
}

export interface CandidataZona {
  idZona: number;
  pisoOrden: number;
  ordenCercania: number;
  cupoLogico: number;
}

/**
 * RF-15 / D-05: ordena las zonas alternativas de la más cercana a la más lejana.
 * 1) mismo piso primero (menor diferencia de piso), 2) menor diferencia de orden de cercanía,
 * 3) desempate estable por piso y orden. Excluye la zona de origen y las zonas sin cupo.
 */
export function ordenarAlternativas<T extends CandidataZona>(
  origen: { idZona: number; pisoOrden: number; ordenCercania: number },
  candidatas: T[],
): T[] {
  return candidatas
    .filter((z) => z.idZona !== origen.idZona && z.cupoLogico > 0)
    .sort(
      (a, b) =>
        Math.abs(a.pisoOrden - origen.pisoOrden) - Math.abs(b.pisoOrden - origen.pisoOrden) ||
        Math.abs(a.ordenCercania - origen.ordenCercania) - Math.abs(b.ordenCercania - origen.ordenCercania) ||
        a.pisoOrden - b.pisoOrden ||
        a.ordenCercania - b.ordenCercania,
    );
}
