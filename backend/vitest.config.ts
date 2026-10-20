import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las pruebas usan una base de datos PostgreSQL real y compartida: se ejecutan en serie.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://fastparking:fastparking_local@localhost:5433/fastparking_test',
      SIMULATOR_API_KEY: 'clave-de-pruebas',
      RETENTION_MINUTES: '7',
    },
  },
});
