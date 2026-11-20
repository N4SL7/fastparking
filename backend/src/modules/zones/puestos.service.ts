import type { Db } from '../../db/pool.js';

/** Estado de un puesto individual (D-23). RETENIDO = tiene una retención VIGENTE encima. */
export type EstadoPuesto = 'LIBRE' | 'OCUPADO' | 'RETENIDO';

export interface PuestoCandidato {
  idZona: number;
  zona: string;
  piso: string;
  pisoOrden: number;
  ordenCercania: number;
  puesto: number;
}

/** Puestos de todas las zonas con su estado, para que la PWA dibuje el plano real (RF-10). */
export async function estadosDePuestos(db: Db): Promise<Map<number, { numero: number; estado: EstadoPuesto }[]>> {
  const { rows } = await db.query<{ id_zona: number; numero: number; ocupado: boolean; retenido: boolean }>(
    `SELECT p.id_zona, p.numero, p.ocupado,
            EXISTS (SELECT 1 FROM retencion r WHERE r.id_zona = p.id_zona AND r.puesto = p.numero
                    AND r.estado = 'VIGENTE' AND r.vence_en > now()) AS retenido
     FROM puesto p ORDER BY p.id_zona, p.numero`,
  );
  const mapa = new Map<number, { numero: number; estado: EstadoPuesto }[]>();
  for (const f of rows) {
    if (!mapa.has(f.id_zona)) mapa.set(f.id_zona, []);
    mapa.get(f.id_zona)!.push({ numero: f.numero, estado: f.ocupado ? 'OCUPADO' : f.retenido ? 'RETENIDO' : 'LIBRE' });
  }
  return mapa;
}

/** Puestos libres (ni ocupados ni retenidos) de todo el parqueadero: candidatos para reasignar. */
export async function puestosLibres(db: Db): Promise<PuestoCandidato[]> {
  const { rows } = await db.query<{
    id_zona: number;
    zona: string;
    piso: string;
    piso_orden: number;
    orden_cercania: number;
    numero: number;
  }>(
    `SELECT z.id_zona, z.codigo AS zona, pi.codigo AS piso, pi.orden AS piso_orden, z.orden_cercania, p.numero
     FROM puesto p
     JOIN zona z ON z.id_zona = p.id_zona
     JOIN piso pi ON pi.id_piso = z.id_piso
     WHERE NOT p.ocupado
       AND NOT EXISTS (SELECT 1 FROM retencion r WHERE r.id_zona = p.id_zona AND r.puesto = p.numero
                       AND r.estado = 'VIGENTE' AND r.vence_en > now())
     ORDER BY pi.orden, z.orden_cercania, p.numero`,
  );
  return rows.map((f) => ({
    idZona: f.id_zona,
    zona: f.zona,
    piso: f.piso,
    pisoOrden: f.piso_orden,
    ordenCercania: f.orden_cercania,
    puesto: f.numero,
  }));
}

/** Primer puesto libre de una zona (el más cercano a la rampa) o null. */
export async function primerPuestoLibre(db: Db, idZona: number): Promise<number | null> {
  const libres = (await puestosLibres(db)).filter((p) => p.idZona === idZona);
  return libres[0]?.puesto ?? null;
}

/** ¿El puesto existe y está libre (sin vehículo ni retención vigente)? */
export async function puestoEstaLibre(db: Db, idZona: number, numero: number): Promise<boolean> {
  const { rows } = await db.query<{ libre: boolean }>(
    `SELECT (NOT p.ocupado AND NOT EXISTS (
               SELECT 1 FROM retencion r WHERE r.id_zona = p.id_zona AND r.puesto = p.numero
               AND r.estado = 'VIGENTE' AND r.vence_en > now())) AS libre
     FROM puesto p WHERE p.id_zona = $1 AND p.numero = $2`,
    [idZona, numero],
  );
  return rows[0]?.libre ?? false;
}

/** Marca un puesto como ocupado o libre y mantiene zona.ocupados = número de puestos ocupados. */
export async function marcarPuesto(db: Db, idZona: number, numero: number, ocupado: boolean): Promise<boolean> {
  const { rowCount } = await db.query(
    'UPDATE puesto SET ocupado = $3, actualizado_en = now() WHERE id_zona = $1 AND numero = $2 AND ocupado <> $3',
    [idZona, numero, ocupado],
  );
  if (rowCount === 1) {
    await db.query(
      `UPDATE zona SET ocupados = (SELECT COUNT(*)::int FROM puesto WHERE id_zona = $1 AND ocupado), actualizado_en = now()
       WHERE id_zona = $1`,
      [idZona],
    );
  }
  return rowCount === 1;
}

/** Recalcula qué puestos están ocupados después de un evento por ZONA (sin puesto concreto). */
export async function ajustarPuestos(db: Db, idZona: number): Promise<void> {
  await db.query('SELECT fp_ajustar_puestos($1::smallint)', [idZona]);
}
