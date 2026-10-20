import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { crearOReanudarSesion, validarSesion } from './sessions.service.js';

export const sessionsRouter = Router();

const CrearSesionSchema = z.object({
  qrToken: z.string().trim().min(8).max(128).optional(),
});

/** POST /api/sessions — RF-01 / D-02 */
sessionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { qrToken } = CrearSesionSchema.parse(req.body ?? {});
    const sesion = await crearOReanudarSesion(pool, qrToken);
    res.status(201).json(sesion);
  }),
);

const UuidSchema = z.string().uuid();

/** Middleware: exige la cabecera X-Session-Id con una sesión vigente. Deja el id en res.locals.idSesion. */
export const requerirSesion: RequestHandler = asyncHandler(async (req, res, next) => {
  const parsed = UuidSchema.safeParse(req.header('x-session-id'));
  if (!parsed.success) {
    throw new AppError(401, 'SESION_REQUERIDA', 'Falta la cabecera X-Session-Id. Escanea el QR para iniciar.');
  }
  await validarSesion(pool, parsed.data);
  res.locals.idSesion = parsed.data;
  next();
});
