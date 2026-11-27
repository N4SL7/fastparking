import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';
import { notificador } from '../../shared/realtime.js';
import { procesarEvento, type ResultadoEvento } from '../events/events.service.js';
import { limpiarNavegaciones } from '../retentions/navigation.service.js';
import { cerrar as cerrarRetencion, registrarHistorial } from '../retentions/retentions.repository.js';

/**
 * Motor de tráfico simulado (RF-20, D-24). Corre EN EL SERVIDOR para que el iPad (/simulacion) y el celular del
 * conductor vean exactamente la misma ocupación. Genera eventos de puesto con fuente SIMULADOR: carros que
 * entran y se estacionan en un puesto libre, o que salen de un puesto ocupado.
 */
export interface EstadoTrafico {
  activo: boolean;
  intervaloMs: number;
  eventosGenerados: number;
}

const estado: EstadoTrafico = { activo: false, intervaloMs: 8_000, eventosGenerados: 0 };
let temporizador: NodeJS.Timeout | null = null;
let apagadoAutomatico: NodeJS.Timeout | null = null;
const APAGADO_AUTOMATICO_MS = 20 * 60_000; // evita consumir la base de datos gratuita si alguien olvida apagarlo

export function estadoTrafico(): EstadoTrafico {
  return { ...estado };
}

/** Un "tick" del tráfico: decide al azar si entra o sale un carro, con tendencia a una ocupación del 70 %. */
export async function generarMovimiento(azar: () => number = Math.random): Promise<ResultadoEvento | null> {
  const { rows } = await pool.query<{ zona: string; numero: number; ocupado: boolean; ocupacion: number; es_vehiculo_app: boolean }>(
    `SELECT z.codigo AS zona, p.numero, p.ocupado,
            (SELECT AVG(CASE WHEN ocupado THEN 1.0 ELSE 0 END) FROM puesto)::float AS ocupacion,
            EXISTS (SELECT 1 FROM ubicacion_vehiculo u WHERE u.id_zona = p.id_zona AND u.puesto = p.numero) AS es_vehiculo_app
     FROM puesto p JOIN zona z ON z.id_zona = p.id_zona
     WHERE NOT EXISTS (SELECT 1 FROM retencion r WHERE r.id_zona = p.id_zona AND r.puesto = p.numero
                       AND r.estado = 'VIGENTE' AND r.vence_en > now())`,
  );
  if (rows.length === 0) return null;
  const ocupacion = rows[0].ocupacion ?? 0.5;
  const entra = azar() < 0.5 + (0.7 - ocupacion); // por encima del 70 % tienden a salir; por debajo, a entrar
  const opciones = rows.filter((r) => (entra ? !r.ocupado : r.ocupado && !r.es_vehiculo_app));
  if (opciones.length === 0) return null;
  const p = opciones[Math.floor(azar() * opciones.length)];
  estado.eventosGenerados++;
  return procesarEvento({
    idEvento: randomUUID(),
    codigoZona: p.zona,
    tipo: entra ? 'ENTRADA' : 'SALIDA',
    cantidad: 1,
    puesto: p.numero,
    fuente: 'SIMULADOR',
    ocurridoEn: new Date(),
  });
}

export function cambiarTrafico(activo: boolean, intervaloMs?: number): EstadoTrafico {
  if (intervaloMs) estado.intervaloMs = Math.min(10_000, Math.max(600, intervaloMs));
  if (temporizador) clearInterval(temporizador);
  if (apagadoAutomatico) clearTimeout(apagadoAutomatico);
  temporizador = null;
  apagadoAutomatico = null;
  estado.activo = activo;
  if (activo) {
    temporizador = setInterval(() => {
      generarMovimiento().catch((err) => console.error('[trafico]', (err as Error).message));
    }, estado.intervaloMs);
    temporizador.unref();
    apagadoAutomatico = setTimeout(() => cambiarTrafico(false), APAGADO_AUTOMATICO_MS);
    apagadoAutomatico.unref();
  }
  notificador.publicarTrafico(estadoTrafico());
  return estadoTrafico();
}

/**
 * RF-19: "carro intruso". Un vehículo que NO usa FastParking ocupa el puesto retenido por un conductor.
 *
 * v2.1 — flujo pensado para la exposición, en dos tiempos:
 *  1. "Preparar intruso" (iPad): el carro naranja aparece detenido en la puerta trasera y ESPERA.
 *  2. Cuando un conductor retiene un puesto en el celular, el intruso arranca hacia ese puesto,
 *     llega primero, se estaciona y, tras una breve pausa, el servidor registra la ocupación: así
 *     primero se ve la ocupación y después la reasignación del agente.
 * "Lanzar ahora" conserva el comportamiento anterior (va hacia la retención vigente más reciente).
 */
export type ResultadoIntruso = ResultadoEvento | { estado: 'EN_CAMINO'; zona: string; puesto: number; llegaEnMs: number };

export type FaseIntruso = 'INACTIVO' | 'ESPERANDO' | 'EN_CAMINO' | 'ESTACIONADO';
export interface EstadoIntruso {
  fase: FaseIntruso;
  zona?: string;
  puesto?: number;
}

let intruso: EstadoIntruso = { fase: 'INACTIVO' };
const temporizadoresIntruso = new Set<NodeJS.Timeout>();

function cambiarFase(nuevo: EstadoIntruso) {
  intruso = nuevo;
  notificador.publicarIntrusoEstado(intruso);
}

function programar(fn: () => void, ms: number) {
  const t = setTimeout(() => {
    temporizadoresIntruso.delete(t);
    fn();
  }, ms);
  t.unref();
  temporizadoresIntruso.add(t);
}

export function estadoIntruso(): EstadoIntruso {
  return { ...intruso };
}

/** Deja el carro intruso esperando en la puerta trasera hasta que un conductor reserve. */
export function prepararIntruso(): EstadoIntruso {
  if (intruso.fase === 'EN_CAMINO' || intruso.fase === 'ESTACIONADO') {
    throw new AppError(409, 'INTRUSO_EN_CURSO', 'Ya hay un carro intruso en camino. Espera a que termine.');
  }
  cambiarFase({ fase: 'ESPERANDO' });
  return estadoIntruso();
}

/** Retira el intruso que estaba esperando (no afecta a uno que ya va en camino). */
export function cancelarIntruso(): EstadoIntruso {
  if (intruso.fase === 'ESPERANDO') cambiarFase({ fase: 'INACTIVO' });
  return estadoIntruso();
}

function ocuparPuesto(zona: string, puesto: number) {
  return procesarEvento({
    idEvento: randomUUID(),
    codigoZona: zona,
    tipo: 'ENTRADA',
    cantidad: 1,
    puesto,
    fuente: 'SIMULADOR',
    ocurridoEn: new Date(),
  });
}

/** Anima el intruso hacia el puesto (celular e iPad) y, al llegar + pausa, registra la ocupación. */
async function enviarIntruso(zona: string, puesto: number): Promise<void> {
  const { rows } = await pool.query<{ id_zona: number }>('SELECT id_zona FROM zona WHERE codigo = $1', [zona]);
  if (rows.length === 0) return;
  cambiarFase({ fase: 'EN_CAMINO', zona, puesto });
  notificador.publicarIntruso({ idZona: rows[0].id_zona, puesto, duracionMs: config.intrusoMs, transcurridoMs: 0 });
  programar(() => {
    cambiarFase({ fase: 'ESTACIONADO', zona, puesto });
    programar(() => {
      // Si el conductor llegó primero, el puesto ya figura ocupado y el intruso no lo toma.
      ocuparPuesto(zona, puesto)
        .catch((err) => console.error('[intruso]', (err as Error).message))
        .finally(() => programar(() => cambiarFase({ fase: 'INACTIVO' }), 3_000));
    }, config.intrusoPausaMs);
  }, config.intrusoMs);
}

/**
 * Gancho llamado al crear una retención: si hay un intruso preparado, arranca hacia ese mismo puesto
 * después de una espera corta (el conductor alcanza a ver su reserva antes de que el intruso salga).
 */
export function alCrearRetencion(r: { zonaCodigo: string; puesto: number | null }): void {
  if (intruso.fase !== 'ESPERANDO' || r.puesto === null) return;
  const puesto = r.puesto;
  cambiarFase({ fase: 'EN_CAMINO', zona: r.zonaCodigo, puesto });
  programar(() => {
    enviarIntruso(r.zonaCodigo, puesto).catch((err) => console.error('[intruso]', (err as Error).message));
  }, config.intrusoEsperaMs);
}

/** "Lanzar ahora": va hacia la retención vigente más reciente (o la de la sesión indicada). */
export async function lanzarIntruso(idSesion?: string): Promise<ResultadoIntruso> {
  const { rows } = await pool.query<{ zona: string; puesto: number }>(
    `SELECT z.codigo AS zona, r.puesto FROM retencion r JOIN zona z ON z.id_zona = r.id_zona
     WHERE r.estado = 'VIGENTE' AND r.vence_en > now() AND r.puesto IS NOT NULL
       AND ($1::uuid IS NULL OR r.id_sesion = $1::uuid)
     ORDER BY r.creada_en DESC LIMIT 1`,
    [idSesion ?? null],
  );
  if (rows.length === 0) {
    throw new AppError(409, 'SIN_RETENCION_VIGENTE', 'No hay ninguna retención vigente con puesto: primero reserva un puesto en el celular.');
  }
  if (config.intrusoMs === 0) return ocuparPuesto(rows[0].zona, rows[0].puesto);
  await enviarIntruso(rows[0].zona, rows[0].puesto);
  return { estado: 'EN_CAMINO', zona: rows[0].zona, puesto: rows[0].puesto, llegaEnMs: config.intrusoMs };
}

/**
 * v2.1: "Reiniciar demo". Deja el parqueadero listo para una nueva demostración: cancela las retenciones
 * vigentes, saca los carros de conductores de FastParking, olvida las navegaciones y retira el intruso.
 */
export async function reiniciarDemo(): Promise<{ retencionesCanceladas: number; vehiculosRetirados: number }> {
  for (const t of temporizadoresIntruso) clearTimeout(t);
  temporizadoresIntruso.clear();
  cambiarTrafico(false);
  const canceladas = await withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id_retencion: string; id_sesion: string; id_zona: number }>(
      `SELECT id_retencion, id_sesion, id_zona FROM retencion WHERE estado = 'VIGENTE' ORDER BY id_zona FOR UPDATE`,
    );
    for (const r of rows) {
      if (await cerrarRetencion(tx, r.id_retencion, 'CANCELADA', 'REINICIO_DEMO')) {
        await registrarHistorial(tx, { idRetencion: r.id_retencion, estadoAnterior: 'VIGENTE', estadoNuevo: 'CANCELADA', motivo: 'REINICIO_DEMO' });
      }
    }
    return rows;
  });
  for (const r of canceladas) notificador.publicarRetencion(r.id_sesion, { tipo: 'CANCELADA', retencion: null });

  const { rows: vehiculos } = await pool.query<{ zona: string; puesto: number | null }>(
    `SELECT z.codigo AS zona, u.puesto FROM ubicacion_vehiculo u JOIN zona z ON z.id_zona = u.id_zona`,
  );
  for (const v of vehiculos) {
    if (v.puesto === null) continue;
    await procesarEvento({
      idEvento: randomUUID(),
      codigoZona: v.zona,
      tipo: 'SALIDA',
      cantidad: 1,
      puesto: v.puesto,
      fuente: 'SIMULADOR',
      ocurridoEn: new Date(),
    }).catch((err) => console.error('[reinicio]', (err as Error).message));
  }
  await pool.query('DELETE FROM ubicacion_vehiculo');
  limpiarNavegaciones();
  cambiarFase({ fase: 'INACTIVO' });
  notificador.publicarZonasActualizadas();
  return { retencionesCanceladas: canceladas.length, vehiculosRetirados: vehiculos.length };
}
