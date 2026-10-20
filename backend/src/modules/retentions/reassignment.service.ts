import { config } from '../../config.js';
import type { Db } from '../../db/pool.js';
import { bloquearZona, listarZonas, marcarZonaActualizada } from '../zones/availability.service.js';
import { ordenarAlternativas } from '../zones/availability.rules.js';
import * as repo from './retentions.repository.js';
import type { RetencionVista } from './retentions.repository.js';

export type ResultadoConflicto =
  | { tipo: 'REASIGNADA'; idSesion: string; anterior: string; nueva: string; zonaNueva: string }
  | { tipo: 'INVALIDADA'; idSesion: string; anterior: string };

/**
 * Motor de reasignación (RF-15, D-05).
 * Se ejecuta DENTRO de la transacción del evento: busca la zona alternativa más cercana con cupo
 * (mismo piso primero, luego pisos vecinos). Si existe, la retención pasa a REASIGNADA y nace una nueva
 * VIGENTE en la zona alternativa; si no, pasa a INVALIDADA (RF-06, RF-07).
 */
export async function reasignarOInvalidar(tx: Db, afectada: RetencionVista, idEvento: string): Promise<ResultadoConflicto> {
  const zonas = await listarZonas(tx);
  const origen = zonas.find((z) => z.idZona === afectada.idZona)!;

  for (const candidata of ordenarAlternativas(origen, zonas)) {
    // Se confirma el cupo con la zona bloqueada: otra solicitud pudo tomarlo mientras tanto.
    const zona = await bloquearZona(tx, candidata.idZona);
    if (zona.cupoLogico <= 0) continue;

    await repo.cerrar(tx, afectada.idRetencion, 'REASIGNADA', 'CONFLICTO_OCUPACION');
    await repo.registrarHistorial(tx, {
      idRetencion: afectada.idRetencion,
      estadoAnterior: 'VIGENTE',
      estadoNuevo: 'REASIGNADA',
      motivo: 'CONFLICTO_OCUPACION',
      idEvento,
    });
    const nueva = await repo.insertar(tx, {
      idSesion: afectada.idSesion,
      idZona: zona.idZona,
      minutos: config.retentionMinutes,
      idRetencionOrigen: afectada.idRetencion,
    });
    await repo.registrarHistorial(tx, {
      idRetencion: nueva,
      estadoAnterior: null,
      estadoNuevo: 'VIGENTE',
      motivo: 'REASIGNACION_AUTOMATICA',
      idEvento,
    });
    await marcarZonaActualizada(tx, zona.idZona);
    return { tipo: 'REASIGNADA', idSesion: afectada.idSesion, anterior: afectada.idRetencion, nueva, zonaNueva: zona.codigo };
  }

  await repo.cerrar(tx, afectada.idRetencion, 'INVALIDADA', 'SIN_ALTERNATIVA');
  await repo.registrarHistorial(tx, {
    idRetencion: afectada.idRetencion,
    estadoAnterior: 'VIGENTE',
    estadoNuevo: 'INVALIDADA',
    motivo: 'SIN_ALTERNATIVA',
    idEvento,
  });
  return { tipo: 'INVALIDADA', idSesion: afectada.idSesion, anterior: afectada.idRetencion };
}
