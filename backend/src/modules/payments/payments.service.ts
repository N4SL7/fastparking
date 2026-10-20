import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { pool, withTransaction, type Db } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';

export type MetodoPago = 'TARJETA' | 'NEQUI' | 'PSE';

/** RN-08: el pago es una DEMOSTRACIÓN; ningún comprobante representa una transacción real. */
export const AVISO_PAGO = 'Pago simulado: no se procesó dinero real ni se almacenaron datos financieros.';

export interface Comprobante {
  idPago: string;
  codigo: string;
  minutos: number;
  tarifaMinuto: number;
  valor: number;
  metodo: MetodoPago;
  estado: 'APROBADO_SIMULADO';
  pagadoEn: Date;
  salidaHasta: Date;
  ingreso: Date;
  aviso: string;
}

interface FilaPago {
  id_pago: string;
  codigo: string;
  minutos: number;
  tarifa_minuto: number;
  valor: number;
  metodo: MetodoPago;
  estado: 'APROBADO_SIMULADO';
  pagado_en: Date;
  salida_hasta: Date;
  ingreso: Date;
}

const SQL_PAGO = `
  SELECT p.id_pago, p.codigo, p.minutos, p.tarifa_minuto, p.valor, p.metodo, p.estado, p.pagado_en, p.salida_hasta,
         s.creada_en AS ingreso
  FROM pago p JOIN sesion_visita s ON s.id_sesion = p.id_sesion`;

const aComprobante = (f: FilaPago): Comprobante => ({
  idPago: f.id_pago,
  codigo: f.codigo,
  minutos: f.minutos,
  tarifaMinuto: f.tarifa_minuto,
  valor: f.valor,
  metodo: f.metodo,
  estado: f.estado,
  pagadoEn: f.pagado_en,
  salidaHasta: f.salida_hasta,
  ingreso: f.ingreso,
  aviso: AVISO_PAGO,
});

/** Regla de cobro (RN-16): minutos completos o fracción desde la entrada, mínimo 1, por la tarifa ilustrativa. */
export function calcularValor(minutos: number, tarifaMinuto: number): number {
  return Math.max(1, minutos) * tarifaMinuto;
}

async function pagoDeSesion(db: Db, idSesion: string): Promise<Comprobante | null> {
  const { rows } = await db.query<FilaPago>(`${SQL_PAGO} WHERE p.id_sesion = $1`, [idSesion]);
  return rows[0] ? aComprobante(rows[0]) : null;
}

/** RF-11: liquidación del tiempo de parqueo de la sesión (o el comprobante si ya pagó). */
export async function cotizar(idSesion: string) {
  const pago = await pagoDeSesion(pool, idSesion);
  const { rows } = await pool.query<{ ingreso: Date; minutos: number }>(
    `SELECT creada_en AS ingreso,
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (now() - creada_en)) / 60))::int AS minutos
     FROM sesion_visita WHERE id_sesion = $1`,
    [idSesion],
  );
  const { ingreso, minutos } = rows[0];
  return {
    ingreso,
    minutos: pago?.minutos ?? minutos,
    tarifaMinuto: pago?.tarifaMinuto ?? config.tarifaPorMinuto,
    valor: pago?.valor ?? calcularValor(minutos, config.tarifaPorMinuto),
    moneda: 'COP' as const,
    tarifaIlustrativa: true,
    pago,
  };
}

/** RF-11: registra el pago SIMULADO (un pago por tiquete) y habilita la salida durante unos minutos. */
export async function pagar(idSesion: string, metodo: MetodoPago): Promise<Comprobante> {
  return withTransaction(async (tx) => {
    // Bloquea la sesión para que dos toques seguidos en "Pagar" no generen dos pagos.
    const { rows } = await tx.query<{ minutos: number }>(
      `SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (now() - creada_en)) / 60))::int AS minutos
       FROM sesion_visita WHERE id_sesion = $1 FOR UPDATE`,
      [idSesion],
    );
    if (await pagoDeSesion(tx, idSesion)) {
      throw new AppError(409, 'PAGO_YA_REALIZADO', 'Este tiquete ya fue pagado.');
    }
    const minutos = rows[0].minutos;
    const codigo = `FP${randomBytes(4).toString('hex').toUpperCase()}`;
    await tx.query(
      `INSERT INTO pago (id_pago, id_sesion, codigo, minutos, tarifa_minuto, valor, metodo, salida_hasta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(mins => $8::int))`,
      [randomUUID(), idSesion, codigo, minutos, config.tarifaPorMinuto, calcularValor(minutos, config.tarifaPorMinuto), metodo, config.minutosParaSalir],
    );
    return (await pagoDeSesion(tx, idSesion))!;
  });
}

/** RF-17: historial de pagos de la sesión. */
export async function historial(idSesion: string): Promise<Comprobante[]> {
  const { rows } = await pool.query<FilaPago>(`${SQL_PAGO} WHERE p.id_sesion = $1 ORDER BY p.pagado_en DESC`, [idSesion]);
  return rows.map(aComprobante);
}
