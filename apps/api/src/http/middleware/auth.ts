import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../../lib/errors';
import { comOrganizacao } from '../../lib/tenant';
import { verifyAccessToken, type AccessPayload } from '../../lib/tokens';
import { validarSessao } from '../../lib/sessao';

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
  let usuario: AccessPayload;
  try {
    usuario = verifyAccessToken(header.slice('Bearer '.length).trim());
  } catch (err) {
    return next(err);
  }

  /*
   * A assinatura prova que o token foi emitido por nos, nao que a sessao AINDA
   * vale: perfil, senha e desativacao mudam depois. `validarSessao` compara a
   * versao do token com a do banco (com cache curto) — 401 se nao bate, 503 se o
   * banco nao respondeu. `req.user` so e preenchido depois, para que nenhum
   * handler enxergue um usuario cuja sessao foi recusada.
   */
  validarSessao(usuario).then(
    () => {
      try {
        req.user = usuario;
        /*
         * O contexto envolve o `next()`: tudo o que rodar depois — handler, service,
         * consulta — herda a organizacao, incluindo as continuacoes assincronas.
         * E daqui que o isolamento sai de graca para o resto do codigo.
         *
         * O **usuario** entra junto, e nao apenas no `asyncHandler`. Motivo achado
         * na primeira execucao do `smoke:visibilidade`: como este middleware abre o
         * contexto antes, o `asyncHandler` encontrava contexto ja ativo, pulava a
         * abertura — corretamente, para nao aninhar — e com isso o usuario nunca
         * chegava. Toda listagem respondia 500 com `SEM_USUARIO_NO_CONTEXTO`.
         *
         * Vale registrar que o modo de falha foi barulhento: "ausencia lanca"
         * transformou um contexto incompleto em erro imediato, e nao numa consulta
         * sem filtro devolvendo a organizacao inteira.
         */
        comOrganizacao(usuario.org, () => next(), { id: usuario.sub, perfil: usuario.perfil });
      } catch (err) {
        next(err);
      }
    },
    (err) => next(err),
  );
}

/** Restringe a rota aos perfis informados. Use sempre depois de requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.perfil)) return next(forbidden());
    next();
  };
}
