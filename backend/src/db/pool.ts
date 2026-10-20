import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

pool.on('error', (err) => {
  console.error('[db] error inesperado en una conexión inactiva', err);
});

/** Cliente de base de datos: el pool o una conexión dentro de una transacción. */
export type Db = Pick<pg.PoolClient, 'query'>;

const ERRORES_REINTENTABLES = new Set(['40P01', '40001']); // deadlock, serialization failure

/**
 * Ejecuta `fn` dentro de una transacción. Si PostgreSQL aborta por deadlock o conflicto de serialización,
 * reintenta hasta 3 veces (RNF-03: la consistencia la garantiza la base de datos, no el navegador).
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resultado = await fn(client);
      await client.query('COMMIT');
      return resultado;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const codigo = (err as { code?: string }).code;
      if (intento < 3 && codigo && ERRORES_REINTENTABLES.has(codigo)) continue;
      throw err;
    } finally {
      client.release();
    }
  }
}
