import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/** Valida req.body contra um schema Zod e substitui pelo valor parseado. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

/** Valida req.query contra um schema Zod, expondo o resultado em res.locals.query. */
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    res.locals.query = result.data;
    next();
  };
}
