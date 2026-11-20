import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';
import { notificador } from '../../shared/realtime.js';
import { reasignarOInvalidar, type ResultadoConflicto } from '../retentions/reassignment.service.js';
import { seleccionarAfectadas } from '../retentions/retention.rules.js';
import { bloquearVigentesDeZona, buscarPorId } from '../retentions/retentions.repository.js';
import { ajustarPuestos, marcarPuesto } from '../zones/puestos.service.js';
import { aplicarOcupacion, type EventoNormalizado } from './event.adapter.js';

export interface ResultadoEvento {
  idEvento: string;
  resultado: 'APLICADO' | 'DESCARTADO_TARDIO' | 'DUPLICADO' | 'SIN_CAMBIO';
  zona: string;
  puesto?: number;
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
        `INSERT INTO evento_ocupacion (id_evento, id_zona, tipo, cantidad, fuente, ocurrido_en, resultado, numero_puesto)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [evento.idEvento, zona.id_zona, evento.tipo, evento.cantidad, evento.fuente, evento.ocurridoEn, estado, evento.puesto ?? null],
      );

    if (zona.ultimo_evento_en && evento.ocurridoEn < zona.ultimo_evento_en) {
      await registrar('DESCARTADO_TARDIO');
      return { idEvento: evento.idEvento, resultado: 'DESCARTADO_TARDIO', zona: evento.codigoZona, conflictos: [] };
    }

    const conflictos: ResultadoConflicto[] = [];
    let ocupados: number;

    if (evento.puesto !== undefined) {
      // RF-19: evento sobre un puesto concreto (carro intruso, tráfico simulado).
      if (evento.puesto > zona.capacidad_total) {
        throw new AppError(400, 'PUESTO_INVALIDO', `La zona ${evento.codigoZona} solo tiene ${zona.capacidad_total} puestos.`);
      }
      const ocupar = evento.tipo === 'ENTRADA';
      if (!(await marcarPuesto(tx, zona.id_zona, evento.puesto, ocupar))) {
        return { idEvento: evento.idEvento, resultado: 'SIN_CAMBIO', zona: evento.codigoZona, puesto: evento.puesto, conflictos: [] };
      }
      await tx.query('UPDATE zona SET ultimo_evento_en = $2 WHERE id_zona = $1', [zona.id_zona, evento.ocurridoEn]);
      await registrar('APLICADO');
      ocupados = zona.ocupados + (ocupar ? 1 : -1);

      if (ocupar) {
        // ¿Ese puesto lo tenía retenido un conductor de FastParking? → el agente lo reasigna.
        const vigentes = await bloquearVigentesDeZona(tx, zona.id_zona);
        const duena = vigentes.find((r) => r.puesto === evento.puesto);
        if (duena) conflictos.push(await reasignarOInvalidar(tx, duena, evento.idEvento, 'PUESTO_OCUPADO'));
      }
    } else {
      ocupados = aplicarOcupacion(zona.ocupados, zona.capacidad_total, evento.tipo, evento.cantidad);
      await tx.query('UPDATE zona SET ocupados = $2, ultimo_evento_en = $3, actualizado_en = now() WHERE id_zona = $1', [
        zona.id_zona,
        ocupados,
        evento.ocurridoEn,
      ]);
      await registrar('APLICADO');
    }

    // RN-04 / RN-13: si ocupados + retenciones vigentes superan la capacidad, ceden las retenciones más recientes.
    const vigentes = await bloquearVigentesDeZona(tx, zona.id_zona);
    const exceso = ocupados + vigentes.length - zona.capacidad_total;
    for (const afectada of seleccionarAfectadas(vigentes, exceso)) {
      conflictos.push(await reasignarOInvalidar(tx, afectada, evento.idEvento));
    }
    // Los eventos por zona no dicen qué puesto: se recalculan los puestos ocupados (D-23).
    if (evento.puesto === undefined) await ajustarPuestos(tx, zona.id_zona);
    return { idEvento: evento.idEvento, resultado: 'APLICADO', zona: evento.codigoZona, puesto: evento.puesto, ocupados, conflictos };
  });

  if (resultado.resultado === 'APLICADO') {
    notificador.publicarZonasActualizadas();
    for (const c of resultado.conflictos) {
      notificador.publicarRetencion(c.idSesion, {
        tipo: c.tipo,
        anterior: await buscarPorId(pool, c.anterior),
        retencion: c.tipo === 'REASIGNADA' ? await buscarPorId(pool, c.nueva) : null,
        mensaje: c.mensaje,
        motor: c.motor,
      });
    }
    if (resultado.conflictos.length > 0) notificador.publicarDecisionAgente();
  }
  return resultado;
}
