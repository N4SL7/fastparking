import { config } from './config.js';
import { crearApp } from './app.js';
import { pool } from './db/pool.js';
import { verificarLLM } from './modules/agent/llm.provider.js';
import { iniciarPlanificadorExpiraciones } from './modules/retentions/expiration.scheduler.js';

const app = crearApp();
const server = app.listen(config.port, () => {
  console.log(`FastParking API escuchando en http://localhost:${config.port}`);
  if (!config.simulatorApiKey) console.warn('SIMULATOR_API_KEY vacía: el simulador está deshabilitado.');
  void verificarLLM(); // D-21: deja constancia de si el agente usará el LLM o el plan B
});
const detenerExpiraciones = iniciarPlanificadorExpiraciones(config.expirationIntervalMs);

function apagar() {
  detenerExpiraciones();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5_000).unref(); // las conexiones SSE abiertas no deben bloquear el apagado
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
