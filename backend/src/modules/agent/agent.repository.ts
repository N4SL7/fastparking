import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/pool.js';
import type { DecisionAgente, MotivoReasignacion } from './agent.service.js';

/** D-22: deja constancia de cada decisión del agente (trazabilidad de la IA). */
export async function registrarDecision(
  db: Db,
  datos: {
    idRetencion: string;
    idRetencionNueva: string | null;
    idEvento: string | null;
    motivo: MotivoReasignacion;
    decision: DecisionAgente;
  },
): Promise<void> {
  const d = datos.decision;
  await db.query(
    `INSERT INTO decision_agente (id_decision, id_retencion, id_retencion_nueva, id_evento, motivo, motor, modelo,
       zona_propuesta, puesto_propuesto, propuesta_valida, pasos, mensaje, error, latencia_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`,
    [
      randomUUID(),
      datos.idRetencion,
      datos.idRetencionNueva,
      datos.idEvento,
      datos.motivo,
      d.motor,
      d.modelo,
      d.propuesta?.zona ?? d.elegido?.zona ?? null,
      d.propuesta?.puesto ?? d.elegido?.puesto ?? null,
      d.propuestaValida,
      JSON.stringify(d.pasos),
      d.mensaje.slice(0, 240),
      d.error,
      d.latenciaMs,
    ],
  );
}

export interface DecisionVista {
  creadaEn: Date;
  motivo: string;
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

/** Últimas decisiones del agente, para el registro en vivo de /simulacion. Sin datos personales. */
export async function ultimasDecisiones(db: Db, limite = 15): Promise<DecisionVista[]> {
  const { rows } = await db.query<{
    creada_en: Date;
    motivo: string;
    motor: 'LLM' | 'REGLAS';
    modelo: string | null;
    zona_anterior: string;
    puesto_anterior: number | null;
    zona_nueva: string | null;
    puesto_nuevo: number | null;
    propuesta_valida: boolean;
    pasos: { herramienta: string }[];
    mensaje: string | null;
    error: string | null;
    latencia_ms: number;
  }>(
    `SELECT d.creada_en, d.motivo, d.motor, d.modelo, za.codigo AS zona_anterior, ra.puesto AS puesto_anterior,
            zn.codigo AS zona_nueva, rn.puesto AS puesto_nuevo, d.propuesta_valida, d.pasos, d.mensaje, d.error, d.latencia_ms
     FROM decision_agente d
     JOIN retencion ra ON ra.id_retencion = d.id_retencion
     JOIN zona za ON za.id_zona = ra.id_zona
     LEFT JOIN retencion rn ON rn.id_retencion = d.id_retencion_nueva
     LEFT JOIN zona zn ON zn.id_zona = rn.id_zona
     ORDER BY d.creada_en DESC LIMIT $1`,
    [limite],
  );
  return rows.map((f) => ({
    creadaEn: f.creada_en,
    motivo: f.motivo,
    motor: f.motor,
    modelo: f.modelo,
    zonaAnterior: f.zona_anterior,
    puestoAnterior: f.puesto_anterior,
    zonaNueva: f.zona_nueva,
    puestoNuevo: f.puesto_nuevo,
    propuestaValida: f.propuesta_valida,
    herramientas: f.pasos.map((p) => p.herramienta),
    mensaje: f.mensaje,
    error: f.error,
    latenciaMs: f.latencia_ms,
  }));
}
