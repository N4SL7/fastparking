import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/errors.js';
import { requerirSesion } from '../sessions/sessions.routes.js';
import { cotizar, historial, pagar } from './payments.service.js';

export const paymentsRouter = Router();
paymentsRouter.use(requerirSesion);

/** GET /api/payments/quote — RF-11: tiempo y valor a pagar */
paymentsRouter.get(
  '/quote',
  asyncHandler(async (_req, res) => {
    res.json(await cotizar(res.locals.idSesion));
  }),
);

const PagarSchema = z.object({ metodo: z.enum(['TARJETA', 'NEQUI', 'PSE']) });

/** POST /api/payments — RF-11: pago simulado (no se envían ni guardan datos de tarjeta o cuenta) */
paymentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { metodo } = PagarSchema.parse(req.body);
    res.status(201).json(await pagar(res.locals.idSesion, metodo));
  }),
);

/** GET /api/payments — RF-17: historial de pagos */
paymentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ pagos: await historial(res.locals.idSesion) });
  }),
);
