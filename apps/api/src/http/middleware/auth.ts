import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../../lib/errors';
import { comOrganizacao } from '../../lib/tenant';
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
    const usuario = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.user = usuario;
    // O contexto envolve o `next()`: tudo o que rodar depois — handler, service,
    // consulta — herda a organizacao, incluindo as continuacoes assincronas.
    // E daqui que o isolamento sai de graca para o resto do codigo.
    comOrganizacao(usuario.org, () => next());
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
