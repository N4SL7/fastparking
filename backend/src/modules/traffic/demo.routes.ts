import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { pool } from '../../db/pool.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { ultimasDecisiones } from '../agent/agent.repository.js';
import { obtenerProveedorLLM, ultimoErrorLLM, verificacionLLM } from '../agent/llm.provider.js';
import { cambiarTrafico, estadoTrafico, lanzarIntruso } from './traffic.service.js';
import { navegacionesActivas } from '../retentions/navigation.service.js';

export const demoRouter = Router();

/** D-24: los controles de la demostración exigen el PIN de DEMO_PIN (nunca va en el código del navegador). */
const requerirPin: RequestHandler = (req, _res, next) => {
  if (!config.demoPin) return next(new AppError(503, 'DEMO_DESHABILITADA', 'Los controles de demostración no están habilitados.'));
  const recibido = Buffer.from(req.header('x-demo-pin') ?? '');
  const esperado = Buffer.from(config.demoPin);
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return next(new AppError(401, 'PIN_INVALIDO', 'PIN de demostración incorrecto.'));
  }
  next();
};

/** GET /api/demo/estado — público y de solo lectura: estado del tráfico, del agente y últimas decisiones. */
demoRouter.get(
  '/estado',
  asyncHandler(async (_req, res) => {
    const llm = obtenerProveedorLLM();
    res.json({
      trafico: estadoTrafico(),
      agente: { motor: llm ? 'LLM' : 'REGLAS', modelo: llm?.modelo ?? null, ultimoError: ultimoErrorLLM, verificacion: verificacionLLM },
      controlesHabilitados: Boolean(config.demoPin),
      decisiones: await ultimasDecisiones(pool),
      navegaciones: navegacionesActivas(),
    });
  }),
);

/** POST /api/demo/pin — permite al iPad comprobar el PIN antes de mostrar los controles. */
demoRouter.post('/pin', requerirPin, (_req, res) => {
  res.json({ ok: true });
});

const TraficoBody = z.object({ activo: z.boolean(), intervaloMs: z.number().int().min(600).max(10_000).optional() });

/** POST /api/demo/trafico — enciende o apaga el tráfico aleatorio (RF-20). */
demoRouter.post('/trafico', requerirPin, (req, res) => {
  const { activo, intervaloMs } = TraficoBody.parse(req.body);
  res.json(cambiarTrafico(activo, intervaloMs));
});

const IntrusoBody = z.object({ idSesion: z.string().uuid().optional() });

/** POST /api/demo/intruso — un carro sin FastParking ocupa el puesto retenido (RF-19). */
demoRouter.post(
  '/intruso',
  requerirPin,
  asyncHandler(async (req, res) => {
    const { idSesion } = IntrusoBody.parse(req.body ?? {});
    res.status(201).json(await lanzarIntruso(idSesion));
  }),
);
