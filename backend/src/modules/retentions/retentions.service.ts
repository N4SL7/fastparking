import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { pool, withTransaction } from '../../db/pool.js';
import { AppError } from '../../shared/errors.js';
import { notificador } from '../../shared/realtime.js';
import { bloquearZona, listarZonas, marcarZonaActualizada } from '../zones/availability.service.js';
import { ordenarAlternativas } from '../zones/availability.rules.js';
import { guardarUbicacion } from '../locations/locations.service.js';
import * as repo from './retentions.repository.js';
import type { RetencionVista } from './retentions.repository.js';

/** Alternativas cercanas con cupo (RF-07), usadas cuando la zona elegida ya no tiene cupo. */
async function sugerirAlternativas(idZonaOrigen: number, limite = 3) {
  const zonas = await listarZonas(pool);
  const origen = zonas.find((z) => z.idZona === idZonaOrigen);
  if (!origen) return [];
  return ordenarAlternativas(origen, zonas)
    .slice(0, limite)
    .map((z) => ({ idZona: z.idZona, codigo: z.codigo, nombre: z.nombre, pisoNombre: z.pisoNombre, cupoLogico: z.cupoLogico }));
}

/**
 * RF-04: solicita una retención temporal simulada sobre una zona.
 * Toda la validación ocurre en una transacción con la zona bloqueada (RN-07, RNF-03):
 * dos solicitudes simultáneas por el último cupo nunca quedan ambas VIGENTES.
 */
export async function solicitarRetencion(idSesion: string, idZona: number, puesto?: number): Promise<RetencionVista> {
  let idCreada: string;
  try {
    idCreada = await withTransaction(async (tx) => {
      // Orden de bloqueo fijo en todo el sistema: primero la zona, luego las retenciones (evita deadlocks).
      const zona = await bloquearZona(tx, idZona);
      await repo.expirarVencidas(tx, idSesion);

      const actual = await repo.buscarVigenteDeSesion(tx, idSesion);
      if (actual) {
        throw new AppError(409, 'RETENCION_VIGENTE_EXISTE', 'Ya tienes una retención vigente. Cancélala antes de pedir otra.', {
          idRetencion: actual.idRetencion,
        });
      }
      if (zona.cupoLogico <= 0) {
        throw new AppError(409, 'ZONA_SIN_CUPO', `La zona ${zona.codigo} ya no tiene cupo disponible.`);
      }
      if (puesto !== undefined && puesto > zona.capacidadTotal) {
        throw new AppError(400, 'PUESTO_INVALIDO', `La zona ${zona.codigo} solo tiene ${zona.capacidadTotal} puestos.`);
      }

      const id = await repo.insertar(tx, { idSesion, idZona, minutos: config.retentionMinutes, puesto });
      await repo.registrarHistorial(tx, { idRetencion: id, estadoAnterior: null, estadoNuevo: 'VIGENTE', motivo: 'SOLICITUD_CONDUCTOR' });
      await marcarZonaActualizada(tx, idZona);
      return id;
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'ZONA_SIN_CUPO') {
      throw new AppError(err.status, err.code, err.message, { alternativas: await sugerirAlternativas(idZona) });
    }
    // Doble clic de la misma sesión: el índice único parcial de la BD rechaza la segunda retención vigente.
    if ((err as { constraint?: string }).constraint === 'uq_retencion_vigente_por_sesion') {
      throw new AppError(409, 'RETENCION_VIGENTE_EXISTE', 'Ya tienes una retención vigente.');
    }
    throw err;
  }

  const creada = (await repo.buscarPorId(pool, idCreada))!;
  notificador.publicarZonasActualizadas();
  notificador.publicarRetencion(idSesion, { tipo: 'CREADA', retencion: creada });
  return creada;
}

/** RF-08: el conductor cancela su retención vigente; el cupo lógico se libera. */
export async function cancelarRetencion(idSesion: string, idRetencion: string): Promise<RetencionVista> {
  const resultado = await withTransaction(async (tx) => {
    const previa = await repo.buscarPorId(tx, idRetencion);
    if (!previa || previa.idSesion !== idSesion) {
      throw new AppError(404, 'RETENCION_NO_EXISTE', 'La retención no existe para esta sesión.');
    }
    // Orden de bloqueo fijo (zona → retención), igual que en el procesamiento de eventos, para evitar deadlocks.
    await bloquearZona(tx, previa.idZona);
    await repo.expirarVencidas(tx, idSesion);
    if (!(await repo.cerrar(tx, idRetencion, 'CANCELADA', 'CANCELADA_POR_CONDUCTOR'))) {
      const actual = await repo.buscarPorId(tx, idRetencion);
      return { cancelada: false as const, estado: actual!.estado };
    }
    await repo.registrarHistorial(tx, {
      idRetencion,
      estadoAnterior: 'VIGENTE',
      estadoNuevo: 'CANCELADA',
      motivo: 'CANCELADA_POR_CONDUCTOR',
    });
    await marcarZonaActualizada(tx, previa.idZona);
    return { cancelada: true as const };
  });

  if (!resultado.cancelada) {
    throw new AppError(409, 'RETENCION_NO_VIGENTE', `La retención ya no está vigente (estado: ${resultado.estado}).`);
  }
  const cancelada = (await repo.buscarPorId(pool, idRetencion))!;
  notificador.publicarZonasActualizadas();
  notificador.publicarRetencion(idSesion, { tipo: 'CANCELADA', retencion: cancelada });
  return cancelada;
}

/**
 * RF-16: el conductor llegó (navegación simulada) y confirma que estacionó.
 * En una sola transacción: la retención pasa a UTILIZADA, la zona suma un vehículo físico mediante un
 * evento de ocupación con fuente CONDUCTOR y se guarda la ubicación del vehículo (RF-09).
 * El cupo lógico no cambia: deja de contar la retención y empieza a contar el vehículo.
 */
export async function confirmarLlegada(idSesion: string, idRetencion: string, puesto?: number): Promise<RetencionVista> {
  const resultado = await withTransaction(async (tx) => {
    const previa = await repo.buscarPorId(tx, idRetencion);
    if (!previa || previa.idSesion !== idSesion) {
      throw new AppError(404, 'RETENCION_NO_EXISTE', 'La retención no existe para esta sesión.');
    }
    await bloquearZona(tx, previa.idZona);
    await repo.expirarVencidas(tx, idSesion);
    if (!(await repo.cerrar(tx, idRetencion, 'UTILIZADA', 'LLEGADA_CONFIRMADA'))) {
      const actual = await repo.buscarPorId(tx, idRetencion);
      return { ok: false as const, estado: actual!.estado };
    }
    const idEvento = randomUUID();
    await tx.query(
      `INSERT INTO evento_ocupacion (id_evento, id_zona, tipo, cantidad, fuente, ocurrido_en, resultado)
       VALUES ($1, $2, 'ENTRADA', 1, 'CONDUCTOR', now(), 'APLICADO')`,
      [idEvento, previa.idZona],
    );
    await tx.query(
      `UPDATE zona SET ocupados = LEAST(capacidad_total, ocupados + 1),
              ultimo_evento_en = GREATEST(COALESCE(ultimo_evento_en, now()), now()), actualizado_en = now()
       WHERE id_zona = $1`,
      [previa.idZona],
    );
    await repo.registrarHistorial(tx, {
      idRetencion,
      estadoAnterior: 'VIGENTE',
      estadoNuevo: 'UTILIZADA',
      motivo: 'LLEGADA_CONFIRMADA',
      idEvento,
    });
    const puestoFinal = puesto ?? previa.puesto ?? undefined;
    await guardarUbicacion(
      tx,
      idSesion,
      previa.idZona,
      puestoFinal ? `Puesto ${String(puestoFinal).padStart(2, '0')}` : undefined,
      puestoFinal,
    );
    return { ok: true as const };
  });

  if (!resultado.ok) {
    throw new AppError(409, 'RETENCION_NO_VIGENTE', `La retención ya no está vigente (estado: ${resultado.estado}).`);
  }
  const utilizada = (await repo.buscarPorId(pool, idRetencion))!;
  notificador.publicarZonasActualizadas();
  notificador.publicarRetencion(idSesion, { tipo: 'UTILIZADA', retencion: utilizada });
  return utilizada;
}

/** Retención vigente de la sesión (o null). Antes expira las vencidas para no mostrar datos falsos (RF-05). */
export async function obtenerRetencionActual(idSesion: string): Promise<RetencionVista | null> {
  await repo.expirarVencidas(pool, idSesion);
  return repo.buscarVigenteDeSesion(pool, idSesion);
}

export async function obtenerRetencion(idSesion: string, idRetencion: string): Promise<RetencionVista> {
  await repo.expirarVencidas(pool, idSesion);
  const r = await repo.buscarPorId(pool, idRetencion);
  if (!r || r.idSesion !== idSesion) throw new AppError(404, 'RETENCION_NO_EXISTE', 'La retención no existe para esta sesión.');
  return r;
}
