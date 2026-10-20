/**
 * Uso:
 *   npm run db:migrate            aplica migraciones pendientes
 *   npm run db:seed               migra y RECARGA los datos ilustrativos (borra los datos actuales)
 *   node dist/db/cli.js --seed-if-empty   (Docker) carga datos solo si la base está vacía
 */
import { pool } from './pool.js';
import { aplicarMigraciones, cargarSeed } from './migrate.js';

const client = await pool.connect();
try {
  const nuevas = await aplicarMigraciones(client);
  console.log(nuevas.length ? `Migraciones aplicadas: ${nuevas.join(', ')}` : 'Base de datos al día.');
  const forzarSeed = process.argv.includes('--seed');
  const seedSiVacia = process.argv.includes('--seed-if-empty');
  if (forzarSeed || seedSiVacia) {
    const { rows } = await client.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM zona');
    if (forzarSeed || rows[0].total === 0) {
      await cargarSeed(client);
      console.log('Datos ilustrativos cargados (seed.sql).');
    }
  }
} finally {
  client.release();
  await pool.end();
}
