/**
 * Ejecuta las migraciones SQL pendientes de backend/db/migrations en orden alfabético.
 * Con --seed, además carga los datos ilustrativos de backend/db/seed.sql.
 *
 * Se ejecuta desde la línea de comandos con src/db/cli.ts (npm run db:migrate | npm run db:seed).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';

const DIR_DB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db');

export async function aplicarMigraciones(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre VARCHAR(120) PRIMARY KEY,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query<{ nombre: string }>('SELECT nombre FROM schema_migrations');
  const aplicadas = new Set(rows.map((r) => r.nombre));
  const archivos = readdirSync(join(DIR_DB, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const nuevas: string[] = [];
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = readFileSync(join(DIR_DB, 'migrations', archivo), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
      await db.query('COMMIT');
      nuevas.push(archivo);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
  return nuevas;
}

export async function cargarSeed(db: Db): Promise<void> {
  await db.query(readFileSync(join(DIR_DB, 'seed.sql'), 'utf8'));
}
