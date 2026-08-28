import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { comOrganizacao, contextoAtual } from '../lib/tenant';

/**
 * Encaminha rejeicoes de handlers async para o errorHandler do Express 4, e
 * garante o contexto de organizacao no handler.
 *
 * A garantia do contexto vive aqui, e nao apenas no `requireAuth`, por causa de
 * um detalhe do `AsyncLocalStorage` que custou um defeito real: **evento de
 * stream perde o contexto**. O listener roda no escopo assincrono de quem
 * *emite* — o socket, criado no aceite da conexao, fora de qualquer `run()` — e
 * nao no de quem registrou o listener. Qualquer middleware que chame `next()` de
 * dentro de um evento de stream entrega o handler sem contexto.
 *
 * Foi exatamente o que aconteceu com o `multer`: o upload de anexo respondia 500
 * com "operacao sem organizacao ativa", enquanto a mesma rota sem arquivo
 * funcionava.
 *
 * Reabrir aqui resolve para todas as rotas de uma vez, porque toda rota da API
 * passa por este invólucro. E reabrir e barato: se o contexto ja esta ativo — o
 * caso normal —, nao faz nada.
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    const organizacaoId = req.user?.org ?? req.integracao?.organizacaoId;

    // Sem credencial na requisicao (rota publica) nao ha o que reabrir: essas
    // rotas resolvem a organizacao por conta propria — pelo slug do widget, pelo
    // token do convite de pesquisa, pelo id externo do webhook.
    if (!organizacaoId || contextoAtual()) {
      fn(req, res, next).catch(next);
      return;
    }

    // O usuario entra junto: e o que permite as politicas de visibilidade
    // (`lib/visibilidade.ts`) decidirem escopo sem que todo servico do CRM
    // precise receber o solicitante por parametro. Token de integracao nao tem
    // usuario, e nesse caso fica ausente de proposito — politica de
    // visibilidade nao se aplica a ponte de IA.
    const usuario = req.user ? { id: req.user.sub, perfil: req.user.perfil } : undefined;

    comOrganizacao(
      organizacaoId,
      () => {
        fn(req, res, next).catch(next);
      },
      usuario,
    );
  };
}
