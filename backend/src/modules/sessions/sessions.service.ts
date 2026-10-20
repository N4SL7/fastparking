import { createHash, randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import type { Db } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';

export interface SesionVista {
  idSesion: string;
  creadaEn: Date;
  expiraEn: Date;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * D-02: crea (o reanuda) una sesión anónima a partir del token impreso en el QR del tiquete.
 * Solo se guarda el hash del token; no se recogen placas ni datos personales (Ley 1581 de 2012).
 * Si el conductor abre la URL sin QR, se genera un token aleatorio de demostración.
 */
export async function crearOReanudarSesion(db: Db, tokenQr?: string): Promise<SesionVista> {
  const token = tokenQr ?? randomUUID();
  const { rows } = await db.query<{ id_sesion: string; creada_en: Date; expira_en: Date }>(
    `INSERT INTO sesion_visita (id_sesion, token_hash, expira_en)
     VALUES ($1, $2, now() + make_interval(hours => $3::int))
     ON CONFLICT (token_hash) DO UPDATE SET token_hash = EXCLUDED.token_hash
     RETURNING id_sesion, creada_en, expira_en`,
    [randomUUID(), hash(token), config.sessionHours],
  );
  const s = rows[0];
  if (s.expira_en.getTime() <= Date.now()) {
    throw new AppError(410, 'SESION_EXPIRADA', 'El QR de este tiquete ya expiró. Solicita uno nuevo.');
  }
  return { idSesion: s.id_sesion, creadaEn: s.creada_en, expiraEn: s.expira_en };
}

/** Verifica que la sesión exista y siga vigente. */
export async function validarSesion(db: Db, idSesion: string): Promise<void> {
  const { rows } = await db.query<{ vigente: boolean }>(
    'SELECT expira_en > now() AS vigente FROM sesion_visita WHERE id_sesion = $1',
    [idSesion],
  );
  if (rows.length === 0) throw new AppError(401, 'SESION_INVALIDA', 'La sesión no existe. Vuelve a escanear el QR.');
  if (!rows[0].vigente) throw new AppError(401, 'SESION_EXPIRADA', 'Tu sesión expiró. Vuelve a escanear el QR.');
}
