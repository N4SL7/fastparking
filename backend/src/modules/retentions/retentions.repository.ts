import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/pool.js';
import type { EstadoRetencion } from './retention.rules.js';

export interface RetencionVista {
  idRetencion: string;
  idSesion: string;
  estado: EstadoRetencion;
  idZona: number;
  zonaCodigo: string;
  zonaNombre: string;
  pisoNombre: string;
  creadaEn: Date;
  venceEn: Date;
  cerradaEn: Date | null;
  motivoCierre: string | null;
  idRetencionOrigen: string | null;
  aviso: string;
}

interface FilaRetencion {
  id_retencion: string;
  id_sesion: string;
  estado: EstadoRetencion;
  id_zona: number;
  zona_codigo: string;
  zona_nombre: string;
  piso_nombre: string;
  creada_en: Date;
  vence_en: Date;
  cerrada_en: Date | null;
  motivo_cierre: string | null;
  id_retencion_origen: string | null;
}

const SQL_RETENCION = `
  SELECT r.id_retencion, r.id_sesion, r.estado, r.id_zona, z.codigo AS zona_codigo, z.nombre AS zona_nombre,
         p.nombre AS piso_nombre, r.creada_en, r.vence_en, r.cerrada_en, r.motivo_cierre, r.id_retencion_origen
  FROM retencion r
  JOIN zona z ON z.id_zona = r.id_zona
  JOIN piso p ON p.id_piso = z.id_piso`;

/** RN-03: todo resultado lleva el aviso de que la retención no garantiza el cupo físico. */
export const AVISO_RETENCION = 'Retención temporal simulada: no garantiza el cupo físico ni prioridad en el parqueadero.';

function aVista(f: FilaRetencion): RetencionVista {
  return {
    idRetencion: f.id_retencion,
    idSesion: f.id_sesion,
    estado: f.estado,
    idZona: f.id_zona,
    zonaCodigo: f.zona_codigo,
    zonaNombre: f.zona_nombre,
    pisoNombre: f.piso_nombre,
    creadaEn: f.creada_en,
    venceEn: f.vence_en,
    cerradaEn: f.cerrada_en,
    motivoCierre: f.motivo_cierre,
    idRetencionOrigen: f.id_retencion_origen,
    aviso: AVISO_RETENCION,
  };
}

export async function buscarPorId(db: Db, idRetencion: string): Promise<RetencionVista | null> {
  const { rows } = await db.query<FilaRetencion>(`${SQL_RETENCION} WHERE r.id_retencion = $1`, [idRetencion]);
  return rows[0] ? aVista(rows[0]) : null;
}

export async function buscarVigenteDeSesion(db: Db, idSesion: string): Promise<RetencionVista | null> {
  const { rows } = await db.query<FilaRetencion>(
    `${SQL_RETENCION} WHERE r.id_sesion = $1 AND r.estado = 'VIGENTE' AND r.vence_en > now()`,
    [idSesion],
  );
  return rows[0] ? aVista(rows[0]) : null;
}

/** Retenciones vigentes de una zona, bloqueadas para actualizarlas dentro de la transacción. */
export async function bloquearVigentesDeZona(db: Db, idZona: number): Promise<RetencionVista[]> {
  const { rows } = await db.query<FilaRetencion>(
    `${SQL_RETENCION}
     WHERE r.id_zona = $1 AND r.estado = 'VIGENTE' AND r.vence_en > now()
     ORDER BY r.creada_en DESC
     FOR UPDATE OF r`,
    [idZona],
  );
  return rows.map(aVista);
}

export async function insertar(
  db: Db,
  datos: { idSesion: string; idZona: number; minutos: number; idRetencionOrigen?: string },
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO retencion (id_retencion, id_sesion, id_zona, id_retencion_origen, estado, vence_en)
     VALUES ($1, $2, $3, $4, 'VIGENTE', now() + make_interval(mins => $5::int))`,
    [id, datos.idSesion, datos.idZona, datos.idRetencionOrigen ?? null, datos.minutos],
  );
  return id;
}

/** Cierra una retención VIGENTE (pasa a un estado final). Devuelve false si ya no estaba vigente. */
export async function cerrar(db: Db, idRetencion: string, estado: EstadoRetencion, motivo: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE retencion SET estado = $2, cerrada_en = now(), motivo_cierre = $3
     WHERE id_retencion = $1 AND estado = 'VIGENTE'`,
    [idRetencion, estado, motivo],
  );
  return rowCount === 1;
}

/** RF-12 / RNF-09: deja constancia de cada cambio de estado. */
export async function registrarHistorial(
  db: Db,
  datos: {
    idRetencion: string;
    estadoAnterior: EstadoRetencion | null;
    estadoNuevo: EstadoRetencion;
    motivo: string;
    idEvento?: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO historial_retencion (id_retencion, estado_anterior, estado_nuevo, motivo, id_evento)
     VALUES ($1, $2, $3, $4, $5)`,
    [datos.idRetencion, datos.estadoAnterior, datos.estadoNuevo, datos.motivo, datos.idEvento ?? null],
  );
}

/**
 * RF-05: marca como EXPIRADAS las retenciones vigentes cuyo vencimiento ya pasó y registra el historial.
 * Si se indica una sesión, solo expira las de esa sesión.
 */
export async function expirarVencidas(db: Db, idSesion?: string): Promise<{ idRetencion: string; idSesion: string }[]> {
  const { rows } = await db.query<{ id_retencion: string; id_sesion: string }>(
    `WITH expiradas AS (
       UPDATE retencion SET estado = 'EXPIRADA', cerrada_en = now(), motivo_cierre = 'VENCIMIENTO'
       WHERE estado = 'VIGENTE' AND vence_en <= now() AND ($1::uuid IS NULL OR id_sesion = $1::uuid)
       RETURNING id_retencion, id_sesion
     ), historial AS (
       INSERT INTO historial_retencion (id_retencion, estado_anterior, estado_nuevo, motivo)
       SELECT id_retencion, 'VIGENTE', 'EXPIRADA', 'VENCIMIENTO' FROM expiradas
     )
     SELECT id_retencion, id_sesion FROM expiradas`,
    [idSesion ?? null],
  );
  return rows.map((r) => ({ idRetencion: r.id_retencion, idSesion: r.id_sesion }));
}
