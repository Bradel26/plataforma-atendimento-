import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Encaminha rejeicoes de handlers async para o errorHandler do Express 4. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
