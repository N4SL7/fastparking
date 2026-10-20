import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

/** Error de negocio con código estable para el cliente (RF-14). */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Express 4 no captura errores de funciones async: este envoltorio los pasa al manejador central. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Formato uniforme de error: { error: { code, message, details? } } */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDACION',
        message: 'Los datos enviados no son válidos.',
        details: err.issues.map((i) => ({ campo: i.path.join('.'), problema: i.message })),
      },
    });
    return;
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'JSON_INVALIDO', message: 'El cuerpo de la petición no es JSON válido.' } });
    return;
  }
  console.error('[api] error no controlado', err);
  res.status(500).json({ error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado. Intenta de nuevo.' } });
};
