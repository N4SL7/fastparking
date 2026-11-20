import { config } from '../../config.js';
import type { Db } from '../../db/pool.js';
import { registrarDecision } from '../agent/agent.repository.js';
import { ordenarCandidatos } from '../agent/agent.rules.js';
import { decidirReasignacion, type MotivoReasignacion } from '../agent/agent.service.js';
import { bloquearZona, listarZonas, marcarZonaActualizada } from '../zones/availability.service.js';
import { puestoEstaLibre, puestosLibres, type PuestoCandidato } from '../zones/puestos.service.js';
import * as repo from './retentions.repository.js';
import type { RetencionVista } from './retentions.repository.js';

export type ResultadoConflicto =
  | {
      tipo: 'REASIGNADA';
      idSesion: string;
      anterior: string;
      nueva: string;
      zonaNueva: string;
      puestoNuevo: number;
      motor: 'LLM' | 'REGLAS';
      mensaje: string;
    }
  | { tipo: 'INVALIDADA'; idSesion: string; anterior: string; motor: 'LLM' | 'REGLAS'; mensaje: string };

/**
 * Motor de reasignación (RF-15, RF-18, RF-19). Se ejecuta DENTRO de la transacción del evento.
 * 1. Reúne los puestos libres del parqueadero (candidatos).
 * 2. El AGENTE LLM elige uno usando sus herramientas; si falla, deciden las reglas (D-21).
 * 3. El backend VALIDA con la zona bloqueada que el puesto siga libre (D-20) antes de aplicar nada.
 * 4. La retención pasa a REASIGNADA y nace una VIGENTE en el nuevo puesto; si no hay ninguno, pasa a INVALIDADA.
 * 5. Se registra la decisión en decision_agente (D-22).
 */
export async function reasignarOInvalidar(
  tx: Db,
  afectada: RetencionVista,
  idEvento: string,
  motivo: MotivoReasignacion = 'CONFLICTO_OCUPACION',
): Promise<ResultadoConflicto> {
  const zonas = await listarZonas(tx);
  const zonaOrigen = zonas.find((z) => z.idZona === afectada.idZona)!;
  const origen = {
    idZona: zonaOrigen.idZona,
    zona: zonaOrigen.codigo,
    piso: zonaOrigen.pisoCodigo,
    pisoOrden: zonaOrigen.pisoOrden,
    ordenCercania: zonaOrigen.ordenCercania,
    puesto: afectada.puesto,
  };

  // Si se llenó la zona, se busca en OTRAS zonas; si solo se ocupó el puesto, también sirve otro puesto de la misma zona.
  const candidatos: PuestoCandidato[] = (await puestosLibres(tx)).filter((c) =>
    motivo === 'CONFLICTO_OCUPACION' ? c.idZona !== afectada.idZona : true,
  );

  const sigueLibre = async (c: PuestoCandidato) => {
    const zona = await bloquearZona(tx, c.idZona); // orden de bloqueo: zona → retención
    // Moverse dentro de la misma zona no cambia su cupo; cambiar de zona exige cupo en la nueva.
    if (c.idZona !== afectada.idZona && zona.cupoLogico <= 0) return false;
    return puestoEstaLibre(tx, c.idZona, c.puesto);
  };

  const decision = await decidirReasignacion({ origen, motivo, candidatos }, sigueLibre);

  // El plan B también se valida: si el primer candidato ya no sirve, se prueba el siguiente más cercano.
  let elegido = decision.elegido;
  if (elegido && decision.motor === 'REGLAS') {
    elegido = null;
    for (const c of ordenarCandidatos(origen, candidatos)) {
      if (await sigueLibre(c)) {
        elegido = c;
        break;
      }
    }
    if (elegido && decision.elegido && (elegido.zona !== decision.elegido.zona || elegido.puesto !== decision.elegido.puesto)) {
      decision.mensaje = decision.mensaje.replace(
        `${decision.elegido.zona}-${String(decision.elegido.puesto).padStart(2, '0')}`,
        `${elegido.zona}-${String(elegido.puesto).padStart(2, '0')}`,
      );
    }
    decision.elegido = elegido;
  }

  const estadoCierre = elegido ? 'REASIGNADA' : 'INVALIDADA';
  const motivoCierre = motivo === 'PUESTO_OCUPADO' ? 'PUESTO_OCUPADO' : elegido ? 'CONFLICTO_OCUPACION' : 'SIN_ALTERNATIVA';
  await repo.cerrar(tx, afectada.idRetencion, estadoCierre, motivoCierre);
  await repo.registrarHistorial(tx, {
    idRetencion: afectada.idRetencion,
    estadoAnterior: 'VIGENTE',
    estadoNuevo: estadoCierre,
    motivo: motivoCierre,
    idEvento,
  });

  if (!elegido) {
    if (!decision.elegido) decision.mensaje = 'Tu puesto ya no está disponible y no hay otro puesto libre en este momento.';
    await registrarDecision(tx, { idRetencion: afectada.idRetencion, idRetencionNueva: null, idEvento, motivo, decision });
    return { tipo: 'INVALIDADA', idSesion: afectada.idSesion, anterior: afectada.idRetencion, motor: decision.motor, mensaje: decision.mensaje };
  }

  const nueva = await repo.insertar(tx, {
    idSesion: afectada.idSesion,
    idZona: elegido.idZona,
    minutos: config.retentionMinutes,
    idRetencionOrigen: afectada.idRetencion,
    puesto: elegido.puesto,
  });
  await repo.registrarHistorial(tx, {
    idRetencion: nueva,
    estadoAnterior: null,
    estadoNuevo: 'VIGENTE',
    motivo: decision.motor === 'LLM' ? 'REASIGNACION_AGENTE_LLM' : 'REASIGNACION_AUTOMATICA',
    idEvento,
  });
  await marcarZonaActualizada(tx, elegido.idZona);
  await registrarDecision(tx, { idRetencion: afectada.idRetencion, idRetencionNueva: nueva, idEvento, motivo, decision });
  return {
    tipo: 'REASIGNADA',
    idSesion: afectada.idSesion,
    anterior: afectada.idRetencion,
    nueva,
    zonaNueva: elegido.zona,
    puestoNuevo: elegido.puesto,
    motor: decision.motor,
    mensaje: decision.mensaje,
  };
}
