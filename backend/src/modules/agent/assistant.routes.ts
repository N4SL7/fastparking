import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/errors.js';
import { requerirSesion } from '../sessions/sessions.routes.js';
import { responderPregunta } from './assistant.service.js';

export const assistantRouter = Router();
assistantRouter.use(requerirSesion);

const PreguntaSchema = z.object({
  pregunta: z.string().trim().min(1).max(300),
  historial: z
    .array(z.object({ rol: z.enum(['usuario', 'asistente']), texto: z.string().max(600) }))
    .max(10)
    .default([]),
});

/** POST /api/asistente — RF-21: el conductor pregunta y el agente de ayuda responde con datos de SU sesión. */
assistantRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { pregunta, historial } = PreguntaSchema.parse(req.body);
    res.json(await responderPregunta(res.locals.idSesion, pregunta, historial));
  }),
);
