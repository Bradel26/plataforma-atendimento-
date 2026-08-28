import type { NextFunction, Request, Response } from 'express';
import type { EscopoIntegracao, IntegrationToken } from '@prisma/client';
import { unauthorized } from '../../lib/errors';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { resolverToken } from '../../modules/integrations/tokens.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      integracao?: IntegrationToken;
    }
  }
}

/**
 * Autentica chamada de maquina por token de integracao.
 *
 * Deliberadamente separado do `requireAuth`: um token de integracao nao tem
 * perfil, nao tem usuario e nao deve passar por nenhuma rota de tela. Se os dois
 * caminhos aceitassem o mesmo header, uma rota nova protegida com `requireAuth`
 * passaria a aceitar o token do bot sem ninguem decidir isso — e o `req.user`
 * viria vazio no meio do codigo que conta com ele.
 */
export function requireIntegration(escopo: EscopoIntegracao) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(unauthorized('Informe o header Authorization: Bearer <token de integracao>'));
    }

    try {
      // Irrestrito para achar o token: o hash e global, e e ELE que diz de qual
      // organizacao a chamada e. Perguntar dentro de um contexto exigiria saber
      // a organizacao antes de descobri-la.
      const token = await semOrganizacao(
        'token de integracao: o hash e que revela a organizacao',
        () => resolverToken(header.slice('Bearer '.length).trim(), escopo),
      );
      // Mensagem generica: dizer "token revogado" em vez de "token invalido"
      // confirma para quem tentou que o valor um dia foi bom.
      if (!token) return next(unauthorized('Token de integracao invalido'));
      req.integracao = token;
      // Daqui para frente a maquina esta presa a organizacao do proprio token:
      // nao existe parametro de rota que a faca falar com outra.
      comOrganizacao(token.organizacaoId, () => next());
    } catch (err) {
      next(err);
    }
  };
}
