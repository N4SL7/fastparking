import { pool } from '../../db/pool.js';
import { notificador } from '../../shared/realtime.js';
import { buscarPorId, expirarVencidas } from './retentions.repository.js';

/** Expira las retenciones vencidas y avisa a las PWA afectadas. Devuelve cuántas expiró. */
export async function ejecutarExpiracion(): Promise<number> {
  const expiradas = await expirarVencidas(pool);
  if (expiradas.length > 0) {
    notificador.publicarZonasActualizadas();
    for (const e of expiradas) {
      notificador.publicarRetencion(e.idSesion, { tipo: 'EXPIRADA', retencion: await buscarPorId(pool, e.idRetencion) });
    }
  }
  return expiradas.length;
}

/** Planificador de expiraciones (RF-05). Las consultas también expiran por su cuenta, así que un reinicio no deja datos falsos. */
export function iniciarPlanificadorExpiraciones(intervaloMs: number): () => void {
  const timer = setInterval(() => {
    ejecutarExpiracion().catch((err) => console.error('[expiracion] error', err));
  }, intervaloMs);
  timer.unref();
  return () => clearInterval(timer);
}
