import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../shared/errors.js';
import { obtenerDisponibilidad } from './availability.service.js';

export const zonesRouter = Router();

/** GET /api/zones — RF-02, RF-03, RF-13 */
zonesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await obtenerDisponibilidad(pool));
  }),
);
