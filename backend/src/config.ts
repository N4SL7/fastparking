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

/**
 * Limpia la clave pegada en un panel: quita espacios, saltos de línea y comillas, y si se pegó la línea completa
 * ("LLM_API_KEY=AIza..."), extrae solo la clave. Las claves de Google AI Studio empiezan por "AIza".
 */
export function limpiarClave(valor: string): string {
  const google = valor.match(/AIza[0-9A-Za-z_-]{30,}/);
  if (google) return google[0];
  return valor.trim().replace(/^[A-Z_]+=/, '').replace(/^["']|["']$/g, '').trim();
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
  /** RN-02 / D-04: vigencia de una retención temporal simulada (flujo de 7 minutos). */
  retentionMinutes: entero('RETENTION_MINUTES', 7),
  /** RF-11: tarifa ILUSTRATIVA por minuto en pesos colombianos (no es la tarifa oficial del centro comercial). */
  tarifaPorMinuto: entero('TARIFA_POR_MINUTO', 130),
  /** RF-11: minutos para salir después de pagar. */
  minutosParaSalir: entero('MINUTOS_PARA_SALIR', 15),
  /** D-02: duración de una sesión anónima creada desde el QR. */
  sessionHours: entero('SESSION_HOURS', 12),
  /** RF-05: cada cuánto se ejecuta el planificador de expiraciones. */
  expirationIntervalMs: entero('EXPIRATION_INTERVAL_MS', 15_000),
  /** D-19: proveedor LLM compatible con la API de OpenAI (Gemini, Groq, OpenAI...). Sin clave = plan B por reglas. */
  llm: {
    baseUrl: (process.env.LLM_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, ''),
    // Se limpian espacios, saltos de línea y comillas que suelen colarse al pegar la clave en un panel.
    apiKey: limpiarClave(process.env.LLM_API_KEY ?? ''),
    model: (process.env.LLM_MODEL ?? 'gemini-3.8-flash').trim(),
    timeoutMs: entero('LLM_TIMEOUT_MS', 8_000),
  },
  /** D-24: PIN de los controles de la demostración (/simulacion). Vacío = controles deshabilitados. */
  demoPin: process.env.DEMO_PIN ?? '',
} as const;
