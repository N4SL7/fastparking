import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';
import { notificador } from '../../shared/realtime.js';
import { reasignarOInvalidar, type ResultadoConflicto } from '../retentions/reassignment.service.js';
import { seleccionarAfectadas } from '../retentions/retention.rules.js';
import { bloquearVigentesDeZona, buscarPorId } from '../retentions/retentions.repository.js';
import { aplicarOcupacion, type EventoNormalizado } from './event.adapter.js';

export interface ResultadoEvento {
  idEvento: string;
  resultado: 'APLICADO' | 'DESCARTADO_TARDIO' | 'DUPLICADO';
  zona: string;
  ocupados?: number;
  conflictos: ResultadoConflicto[];
}

// Los eventos se procesan de uno en uno (bloqueo consultivo de PostgreSQL) para conservar su orden.
const LLAVE_BLOQUEO_EVENTOS = 4242;

/**
 * RF-06 / RN-04: procesa un evento de ocupación normalizado.
 * 1. Idempotencia: un id_evento repetido no vuelve a aplicarse.
 * 2. Orden: un evento más antiguo que el último aplicado se descarta (DESCARTADO_TARDIO).
 * 3. Actualiza la ocupación física de la zona.
 * 4. Si ocupados + retenciones vigentes > capacidad, las retenciones más recientes se reasignan o invalidan.
 */
export async function procesarEvento(evento: EventoNormalizado): Promise<ResultadoEvento> {
  const resultado = await withTransaction(async (tx): Promise<ResultadoEvento> => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [LLAVE_BLOQUEO_EVENTOS]);

    const previo = await tx.query<{ resultado: string }>('SELECT resultado FROM evento_ocupacion WHERE id_evento = $1', [
      evento.idEvento,
    ]);
    if (previo.rows.length > 0) {
      return { idEvento: evento.idEvento, resultado: 'DUPLICADO', zona: evento.codigoZona, conflictos: [] };
    }

    const { rows } = await tx.query<{
      id_zona: number;
      capacidad_total: number;
      ocupados: number;
      ultimo_evento_en: Date | null;
    }>('SELECT id_zona, capacidad_total, ocupados, ultimo_evento_en FROM zona WHERE codigo = $1 FOR UPDATE', [
      evento.codigoZona,
    ]);
    if (rows.length === 0) throw new AppError(404, 'ZONA_NO_EXISTE', `No existe la zona ${evento.codigoZona}.`);
    const zona = rows[0];

    const registrar = (estado: 'APLICADO' | 'DESCARTADO_TARDIO') =>
      tx.query(
        `INSERT INTO evento_ocupacion (id_evento, id_zona, tipo, cantidad, fuente, ocurrido_en, resultado)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [evento.idEvento, zona.id_zona, evento.tipo, evento.cantidad, evento.fuente, evento.ocurridoEn, estado],
      );

    if (zona.ultimo_evento_en && evento.ocurridoEn < zona.ultimo_evento_en) {
      await registrar('DESCARTADO_TARDIO');
      return { idEvento: evento.idEvento, resultado: 'DESCARTADO_TARDIO', zona: evento.codigoZona, conflictos: [] };
    }

    const ocupados = aplicarOcupacion(zona.ocupados, zona.capacidad_total, evento.tipo, evento.cantidad);
    await tx.query('UPDATE zona SET ocupados = $2, ultimo_evento_en = $3, actualizado_en = now() WHERE id_zona = $1', [
      zona.id_zona,
      ocupados,
      evento.ocurridoEn,
    ]);
    await registrar('APLICADO');

    const vigentes = await bloquearVigentesDeZona(tx, zona.id_zona);
    const exceso = ocupados + vigentes.length - zona.capacidad_total;
    const conflictos: ResultadoConflicto[] = [];
    for (const afectada of seleccionarAfectadas(vigentes, exceso)) {
      conflictos.push(await reasignarOInvalidar(tx, afectada, evento.idEvento));
    }
    return { idEvento: evento.idEvento, resultado: 'APLICADO', zona: evento.codigoZona, ocupados, conflictos };
  });

  if (resultado.resultado === 'APLICADO') {
    notificador.publicarZonasActualizadas();
    for (const c of resultado.conflictos) {
      notificador.publicarRetencion(c.idSesion, {
        tipo: c.tipo,
        anterior: await buscarPorId(pool, c.anterior),
        retencion: c.tipo === 'REASIGNADA' ? await buscarPorId(pool, c.nueva) : null,
      });
    }
  }
  return resultado;
}
