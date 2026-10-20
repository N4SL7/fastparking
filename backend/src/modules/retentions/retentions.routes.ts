import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/errors.js';
import { requerirSesion } from '../sessions/sessions.routes.js';
import {
  cancelarRetencion,
  confirmarLlegada,
  obtenerRetencion,
  obtenerRetencionActual,
  solicitarRetencion,
} from './retentions.service.js';

export const retentionsRouter = Router();
retentionsRouter.use(requerirSesion);

const SolicitarSchema = z.object({ idZona: z.number().int().positive() });
const IdSchema = z.string().uuid();

/** POST /api/retentions — RF-04 */
retentionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { idZona } = SolicitarSchema.parse(req.body);
    res.status(201).json(await solicitarRetencion(res.locals.idSesion, idZona));
  }),
);

/** GET /api/retentions/current — retención vigente de la sesión o null */
retentionsRouter.get(
  '/current',
  asyncHandler(async (_req, res) => {
    res.json({ retencion: await obtenerRetencionActual(res.locals.idSesion) });
  }),
);

/** GET /api/retentions/:id — estado y vencimiento */
retentionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await obtenerRetencion(res.locals.idSesion, IdSchema.parse(req.params.id)));
  }),
);

/** POST /api/retentions/:id/cancel — RF-08 (no se usa DELETE: la retención se conserva en el historial) */
retentionsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    res.json(await cancelarRetencion(res.locals.idSesion, IdSchema.parse(req.params.id)));
  }),
);

const LlegadaSchema = z.object({ puesto: z.number().int().min(1).max(99).optional() });

/** POST /api/retentions/:id/arrive — RF-16: llegada confirmada tras la navegación simulada */
retentionsRouter.post(
  '/:id/arrive',
  asyncHandler(async (req, res) => {
    const { puesto } = LlegadaSchema.parse(req.body ?? {});
    res.json(await confirmarLlegada(res.locals.idSesion, IdSchema.parse(req.params.id), puesto));
  }),
);
