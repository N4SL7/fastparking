import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { pool } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';
import { notificador } from '../../shared/realtime.js';
import { procesarEvento, type ResultadoEvento } from '../events/events.service.js';

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
 * Si se indica la sesión, se usa su retención; si no, la retención vigente más reciente.
 */
export type ResultadoIntruso = ResultadoEvento | { estado: 'EN_CAMINO'; zona: string; puesto: number; llegaEnMs: number };

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
  const ocupar = () =>
    procesarEvento({
      idEvento: randomUUID(),
      codigoZona: rows[0].zona,
      tipo: 'ENTRADA',
      cantidad: 1,
      puesto: rows[0].puesto,
      fuente: 'SIMULADOR',
      ocurridoEn: new Date(),
    });
  if (config.intrusoMs === 0) return ocupar();

  // El intruso entra por la otra puerta y tarda unos segundos: si llega antes que el conductor, ocupa el puesto
  // y el agente reasigna; si el conductor llega primero, el puesto ya está ocupado y el intruso no lo toma.
  const { rows: z } = await pool.query<{ id_zona: number }>('SELECT id_zona FROM zona WHERE codigo = $1', [rows[0].zona]);
  notificador.publicarIntruso({ idZona: z[0].id_zona, puesto: rows[0].puesto, duracionMs: config.intrusoMs, transcurridoMs: 0 });
  setTimeout(() => {
    ocupar().catch((err) => console.error('[intruso]', (err as Error).message));
  }, config.intrusoMs).unref();
  return { estado: 'EN_CAMINO', zona: rows[0].zona, puesto: rows[0].puesto, llegaEnMs: config.intrusoMs };
}
