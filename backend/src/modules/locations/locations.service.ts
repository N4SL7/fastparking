import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';

export interface UbicacionVista {
  idZona: number;
  zonaCodigo: string;
  zonaNombre: string;
  pisoCodigo: string;
  pisoNombre: string;
  puesto: number | null;
  referencia: string | null;
  registradaEn: Date;
}

/** RF-09: guarda (o reemplaza) dónde dejó el vehículo el conductor. Solo datos mínimos: zona y una referencia libre. */
export async function guardarUbicacion(
  db: Db,
  idSesion: string,
  idZona: number,
  referencia?: string,
  puesto?: number,
): Promise<UbicacionVista> {
  const zona = await db.query('SELECT 1 FROM zona WHERE id_zona = $1', [idZona]);
  if (zona.rows.length === 0) throw new AppError(404, 'ZONA_NO_EXISTE', 'La zona indicada no existe.');
  await db.query(
    `INSERT INTO ubicacion_vehiculo (id_ubicacion, id_sesion, id_zona, puesto, referencia)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id_sesion) DO UPDATE
       SET id_zona = EXCLUDED.id_zona, puesto = EXCLUDED.puesto, referencia = EXCLUDED.referencia, registrada_en = now()`,
    [randomUUID(), idSesion, idZona, puesto ?? null, referencia || null],
  );
  return (await obtenerUbicacion(db, idSesion))!;
}

/** RF-09: recupera la ubicación guardada de la sesión (o null). */
export async function obtenerUbicacion(db: Db, idSesion: string): Promise<UbicacionVista | null> {
  const { rows } = await db.query<{
    id_zona: number;
    zona_codigo: string;
    zona_nombre: string;
    piso_codigo: string;
    piso_nombre: string;
    puesto: number | null;
    referencia: string | null;
    registrada_en: Date;
  }>(
    `SELECT u.id_zona, z.codigo AS zona_codigo, z.nombre AS zona_nombre, p.codigo AS piso_codigo,
            p.nombre AS piso_nombre, u.puesto, u.referencia, u.registrada_en
     FROM ubicacion_vehiculo u
     JOIN zona z ON z.id_zona = u.id_zona
     JOIN piso p ON p.id_piso = z.id_piso
     WHERE u.id_sesion = $1`,
    [idSesion],
  );
  const f = rows[0];
  if (!f) return null;
  return {
    idZona: f.id_zona,
    zonaCodigo: f.zona_codigo,
    zonaNombre: f.zona_nombre,
    pisoCodigo: f.piso_codigo,
    pisoNombre: f.piso_nombre,
    puesto: f.puesto,
    referencia: f.referencia,
    registradaEn: f.registrada_en,
  };
}
