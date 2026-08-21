import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../../lib/errors';
import { verifyAccessToken, type AccessPayload } from '../../lib/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Informe o header Authorization: Bearer <token>'));
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length).trim());
    next();
  } catch (err) {
    next(err);
  }
}

/** Restringe a rota aos perfis informados. Use sempre depois de requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.perfil)) return next(forbidden());
    next();
  };
}
