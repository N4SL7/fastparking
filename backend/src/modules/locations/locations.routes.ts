import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../shared/errors.js';
import { requerirSesion } from '../sessions/sessions.routes.js';
import { guardarUbicacion, obtenerUbicacion } from './locations.service.js';

export const locationsRouter = Router();
locationsRouter.use(requerirSesion);

const GuardarSchema = z.object({
  idZona: z.number().int().positive(),
  referencia: z.string().trim().max(80).optional(),
  puesto: z.number().int().min(1).max(99).optional(),
});

/** PUT /api/vehicle-location — RF-09 */
locationsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { idZona, referencia, puesto } = GuardarSchema.parse(req.body);
    res.json({ ubicacion: await guardarUbicacion(pool, res.locals.idSesion, idZona, referencia, puesto) });
  }),
);

/** GET /api/vehicle-location — RF-09 */
locationsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ ubicacion: await obtenerUbicacion(pool, res.locals.idSesion) });
  }),
);
