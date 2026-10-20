import { existsSync } from 'node:fs';

// Carga backend/.env en desarrollo local. En Docker y en pruebas las variables llegan por el entorno.
if (!process.env.VITEST && existsSync('.env')) {
  process.loadEnvFile('.env');
}

function entero(nombre: string, porDefecto: number): number {
  const valor = process.env[nombre];
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Variable de entorno ${nombre} inválida: ${valor}`);
  return n;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Falta la variable de entorno DATABASE_URL (ver .env.example)');
}

export const config = {
  port: entero('PORT', 3000),
  databaseUrl,
  /** Clave que debe enviar el simulador en la cabecera x-simulator-key. Vacía = simulador deshabilitado. */
  simulatorApiKey: process.env.SIMULATOR_API_KEY ?? '',
  /** RN-02 / D-04: vigencia de una retención temporal simulada. */
  retentionMinutes: entero('RETENTION_MINUTES', 10),
  /** D-02: duración de una sesión anónima creada desde el QR. */
  sessionHours: entero('SESSION_HOURS', 12),
  /** RF-05: cada cuánto se ejecuta el planificador de expiraciones. */
  expirationIntervalMs: entero('EXPIRATION_INTERVAL_MS', 15_000),
} as const;
