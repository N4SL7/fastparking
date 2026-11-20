/**
 * Reglas puras del agente de reasignación (sin base de datos ni LLM), probadas con pruebas unitarias.
 * Son también el PLAN B (D-21): si el LLM no responde o propone algo inválido, decide esta función.
 */
import type { PuestoCandidato } from '../zones/puestos.service.js';

export interface Origen {
  idZona: number;
  pisoOrden: number;
  ordenCercania: number;
  puesto: number | null;
}

/**
 * Distancia ESTIMADA en metros entre el puesto original y un candidato (plano ilustrativo, RN-09).
 * Cambiar de piso pesa más que cambiar de zona, y cambiar de zona más que moverse dentro de ella (RN-14).
 */
export function distanciaEstimada(origen: Origen, c: Pick<PuestoCandidato, 'idZona' | 'pisoOrden' | 'ordenCercania' | 'puesto'>): number {
  const pisos = Math.abs(c.pisoOrden - origen.pisoOrden);
  const zonas = Math.abs(c.ordenCercania - origen.ordenCercania);
  const dentro = c.idZona === origen.idZona ? Math.abs(c.puesto - (origen.puesto ?? 1)) : c.puesto;
  return Math.round(pisos * 80 + zonas * 22 + dentro * 2.5);
}

/**
 * RN-14 aplicado a puestos: mismo piso primero, luego zona más cercana, luego puesto más cercano.
 * Devuelve los candidatos ordenados (el primero es la decisión de las reglas).
 */
export function ordenarCandidatos<T extends PuestoCandidato>(origen: Origen, candidatos: T[]): (T & { distanciaMetros: number })[] {
  return candidatos
    .map((c) => ({ ...c, distanciaMetros: distanciaEstimada(origen, c) }))
    .sort(
      (a, b) =>
        Math.abs(a.pisoOrden - origen.pisoOrden) - Math.abs(b.pisoOrden - origen.pisoOrden) ||
        Math.abs(a.ordenCercania - origen.ordenCercania) - Math.abs(b.ordenCercania - origen.ordenCercania) ||
        a.distanciaMetros - b.distanciaMetros ||
        a.pisoOrden - b.pisoOrden ||
        a.ordenCercania - b.ordenCercania,
    );
}

/** Mensaje del plan B: claro, corto y con el aviso de simulación (RN-03). */
export function mensajeReglas(anterior: { zona: string; puesto: number | null }, nuevo: { zona: string; puesto: number; distanciaMetros: number }, motivo: 'PUESTO_OCUPADO' | 'CONFLICTO_OCUPACION'): string {
  const que =
    motivo === 'PUESTO_OCUPADO'
      ? `Otro vehículo ocupó tu puesto ${anterior.zona}-${String(anterior.puesto ?? 0).padStart(2, '0')}.`
      : `La zona ${anterior.zona} se llenó.`;
  return `${que} Te asigné el puesto ${nuevo.zona}-${String(nuevo.puesto).padStart(2, '0')}, a unos ${nuevo.distanciaMetros} m. Sigue la flecha.`;
}
