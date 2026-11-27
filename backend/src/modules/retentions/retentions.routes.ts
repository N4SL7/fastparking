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
import { iniciarNavegacion } from './navigation.service.js';
import { AppError } from '../../shared/errors.js';

export const retentionsRouter = Router();
retentionsRouter.use(requerirSesion);

const SolicitarSchema = z.object({ idZona: z.number().int().positive(), puesto: z.number().int().min(1).max(99).optional() });
const IdSchema = z.string().uuid();
const NavegacionSchema = z.object({
  duracionMs: z.number().int().min(1_000).max(10 * 60_000),
  // v2.1: punto del plano desde donde sale la flecha (al reasignar, la ruta continúa desde ahí).
  desde: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
});

/** POST /api/retentions/:id/navigation — el conductor empezó a seguir la flecha (sincroniza /simulacion). */
retentionsRouter.post(
  '/:id/navigation',
  asyncHandler(async (req, res) => {
    const { duracionMs, desde } = NavegacionSchema.parse(req.body);
    const r = await obtenerRetencion(res.locals.idSesion, IdSchema.parse(req.params.id));
    if (r.estado !== 'VIGENTE' || !r.puesto) throw new AppError(409, 'RETENCION_NO_VIGENTE', 'La retención ya no está vigente.');
    iniciarNavegacion(r.idZona, r.puesto, duracionMs, desde);
    res.status(204).end();
  }),
);

/** POST /api/retentions — RF-04 */
retentionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { idZona, puesto } = SolicitarSchema.parse(req.body);
    res.status(201).json(await solicitarRetencion(res.locals.idSesion, idZona, puesto));
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
