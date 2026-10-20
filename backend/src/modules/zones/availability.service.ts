import type { Db } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';
import { calcularCupoLogico, clasificarZona, type EstadoZona } from './availability.rules.js';

export interface ZonaVista {
  idZona: number;
  codigo: string;
  nombre: string;
  idPiso: number;
  pisoCodigo: string;
  pisoNombre: string;
  pisoOrden: number;
  ordenCercania: number;
  capacidadTotal: number;
  ocupados: number;
  retenidas: number;
  cupoLogico: number;
  estado: EstadoZona;
  actualizadoEn: Date;
  esSimulada: boolean;
}

interface FilaZona {
  id_zona: number;
  codigo: string;
  nombre: string;
  id_piso: number;
  piso_codigo: string;
  piso_nombre: string;
  piso_orden: number;
  orden_cercania: number;
  capacidad_total: number;
  ocupados: number;
  retenidas: number;
  actualizado_en: Date;
  es_simulada: boolean;
}

const SQL_ZONAS = `
  SELECT z.id_zona, z.codigo, z.nombre, z.id_piso, p.codigo AS piso_codigo, p.nombre AS piso_nombre,
         p.orden AS piso_orden, z.orden_cercania, z.capacidad_total, z.ocupados, z.actualizado_en, z.es_simulada,
         (SELECT COUNT(*)::int FROM retencion r
           WHERE r.id_zona = z.id_zona AND r.estado = 'VIGENTE' AND r.vence_en > now()) AS retenidas
  FROM zona z
  JOIN piso p ON p.id_piso = z.id_piso`;

function aVista(f: FilaZona): ZonaVista {
  const cupoLogico = calcularCupoLogico(f.capacidad_total, f.ocupados, f.retenidas);
  return {
    idZona: f.id_zona,
    codigo: f.codigo,
    nombre: f.nombre,
    idPiso: f.id_piso,
    pisoCodigo: f.piso_codigo,
    pisoNombre: f.piso_nombre,
    pisoOrden: f.piso_orden,
    ordenCercania: f.orden_cercania,
    capacidadTotal: f.capacidad_total,
    ocupados: f.ocupados,
    retenidas: f.retenidas,
    cupoLogico,
    estado: clasificarZona(cupoLogico, f.capacidad_total),
    actualizadoEn: f.actualizado_en,
    esSimulada: f.es_simulada,
  };
}

/** RF-02: todas las zonas con su disponibilidad agregada, ordenadas por piso y cercanía. */
export async function listarZonas(db: Db): Promise<ZonaVista[]> {
  const { rows } = await db.query<FilaZona>(`${SQL_ZONAS} ORDER BY p.orden, z.orden_cercania`);
  return rows.map(aVista);
}

/** Respuesta de GET /api/zones agrupada por piso (RF-02, RF-03, RF-13). */
export async function obtenerDisponibilidad(db: Db) {
  const zonas = await listarZonas(db);
  const pisos = new Map<number, { idPiso: number; codigo: string; nombre: string; zonas: ZonaVista[] }>();
  for (const z of zonas) {
    if (!pisos.has(z.idPiso)) pisos.set(z.idPiso, { idPiso: z.idPiso, codigo: z.pisoCodigo, nombre: z.pisoNombre, zonas: [] });
    pisos.get(z.idPiso)!.zonas.push(z);
  }
  return {
    generadoEn: new Date(),
    granularidad: 'ZONA' as const,
    datosSimulados: true,
    pisos: [...pisos.values()],
  };
}

/**
 * Bloquea la fila de la zona (SELECT … FOR UPDATE) y devuelve su disponibilidad actual.
 * Dos transacciones que intenten retener en la misma zona se ejecutan una después de la otra (RNF-03).
 */
export async function bloquearZona(db: Db, idZona: number): Promise<ZonaVista> {
  const bloqueo = await db.query('SELECT id_zona FROM zona WHERE id_zona = $1 FOR UPDATE', [idZona]);
  if (bloqueo.rows.length === 0) throw new AppError(404, 'ZONA_NO_EXISTE', 'La zona solicitada no existe.');
  const { rows } = await db.query<FilaZona>(`${SQL_ZONAS} WHERE z.id_zona = $1`, [idZona]);
  return aVista(rows[0]);
}

/** Marca la zona como actualizada (RF-13: la PWA muestra cuándo cambió la disponibilidad). */
export async function marcarZonaActualizada(db: Db, idZona: number): Promise<void> {
  await db.query('UPDATE zona SET actualizado_en = now() WHERE id_zona = $1', [idZona]);
}
