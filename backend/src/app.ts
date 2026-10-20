import express from 'express';
import { pool } from './db/pool.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { locationsRouter } from './modules/locations/locations.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { retentionsRouter } from './modules/retentions/retentions.routes.js';
import { sessionsRouter } from './modules/sessions/sessions.routes.js';
import { zonesRouter } from './modules/zones/zones.routes.js';
import { AppError, asyncHandler, errorHandler } from './shared/errors.js';

/** Capa HTTP del monolito modular: valida, enruta a cada módulo y unifica el formato de errores. */
export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      try {
        await pool.query('SELECT 1');
        res.json({ estado: 'ok', baseDatos: 'ok' });
      } catch {
        res.status(503).json({ estado: 'degradado', baseDatos: 'sin conexión' });
      }
    }),
  );

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/zones', zonesRouter);
  app.use('/api/retentions', retentionsRouter);
  app.use('/api/vehicle-location', locationsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api', eventsRouter);

  app.use((_req, _res, next) => next(new AppError(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.')));
  app.use(errorHandler);
  return app;
}
