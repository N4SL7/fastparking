import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { notificador } from '../../shared/realtime.js';
import { fuenteSimulador } from './event.adapter.js';
import { procesarEvento } from './events.service.js';

export const eventsRouter = Router();

/** D-07: el endpoint del simulador solo acepta peticiones con la clave de SIMULATOR_API_KEY. */
const requerirClaveSimulador: RequestHandler = (req, _res, next) => {
  if (!config.simulatorApiKey) {
    return next(new AppError(503, 'SIMULADOR_DESHABILITADO', 'El simulador no está habilitado en este entorno.'));
  }
  const recibida = Buffer.from(req.header('x-simulator-key') ?? '');
  const esperada = Buffer.from(config.simulatorApiKey);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    return next(new AppError(401, 'CLAVE_SIMULADOR_INVALIDA', 'Clave del simulador inválida.'));
  }
  next();
};

/** POST /api/simulator/events — RF-06, RF-12: inyecta un evento de ocupación simulado. */
eventsRouter.post(
  '/simulator/events',
  requerirClaveSimulador,
  asyncHandler(async (req, res) => {
    const evento = fuenteSimulador.normalizar(req.body);
    const resultado = await procesarEvento(evento);
    res.status(resultado.resultado === 'APLICADO' ? 201 : 200).json(resultado);
  }),
);

const StreamQuery = z.object({ sessionId: z.string().uuid().optional() });

/** GET /api/events/stream — SSE (D-09). EventSource no envía cabeceras, por eso la sesión va en la URL. */
eventsRouter.get('/events/stream', (req, res) => {
  const { sessionId } = StreamQuery.parse(req.query);
  const cancelar = notificador.suscribir(res, sessionId ?? null);
  req.on('close', cancelar);
});
