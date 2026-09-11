import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import {
  atualizarOportunidadeSchema,
  criarFunilSchema,
  criarOportunidadeSchema,
  fecharOportunidadeSchema,
  itensSchema,
  listarOportunidadesSchema,
  tarefaDaEtapaSchema,
} from './opportunities.schemas';
import { getBranding } from '../branding/branding.service';
import { gerarPropostaPdf } from './proposta.pdf';
import {
  atualizarOportunidade,
  auditoriaDaOportunidade,
  dadosDaProposta,
  criarFunil,
  criarOportunidade,
  decidirDesconto,
  definirItens,
  definirTarefaDaEtapa,
  fecharOportunidade,
  funilKanban,
  listarFunis,
  listarOportunidades,
  obterOportunidade,
  registrarPropostaGerada,
} from './opportunities.service';

export const opportunitiesRoutes = Router();
export const funnelsRoutes = Router();

opportunitiesRoutes.use(requireAuth);
funnelsRoutes.use(requireAuth);

/**
 * Oportunidade e funil sao processo comercial: AGENTE fora.
 *
 * Ele continua vendo informacao comercial **resumida** dentro da ficha do
 * cliente, que e outra rota (`/contas/:id`) e outra porta de entrada — o que
 * fica barrado aqui e lista, kanban e detalhe operacional.
 */
const COMERCIAIS = requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL');
opportunitiesRoutes.use(COMERCIAIS);
funnelsRoutes.use(COMERCIAIS);

funnelsRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ funis: await listarFunis() });
  }),
);

funnelsRoutes.post(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(criarFunilSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ funil: await criarFunil(req.body) });
  }),
);

/**
 * Exigencia da etapa (item 3.1). Escrita de ADMIN/SUPERVISOR, como criar funil.
 *
 * Definir o processo e decidir por todo mundo que usa o funil, e por isso nao
 * acompanha a alcada de aprovar caso a caso — o mesmo corte da politica de
 * desconto (decisao 58).
 */
funnelsRoutes.patch(
  '/:funilId/estagios/:estagioId',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(tarefaDaEtapaSchema),
  asyncHandler(async (req, res) => {
    const estagio = await definirTarefaDaEtapa(
      param(req, 'funilId'),
      param(req, 'estagioId'),
      req.body.tarefaObrigatoria,
    );
    res.json({ estagio });
  }),
);

opportunitiesRoutes.get(
  '/',
  validateQuery(listarOportunidadesSchema),
  asyncHandler(async (_req, res) => {
    res.json({ oportunidades: await listarOportunidades(res.locals.query) });
  }),
);

/** Kanban por estagio do funil, com valor total e previsao ponderada. */
opportunitiesRoutes.get(
  '/kanban',
  validateQuery(z.object({ funilId: z.string().uuid().optional() })),
  asyncHandler(async (_req, res) => {
    res.json(await funilKanban(res.locals.query.funilId));
  }),
);

opportunitiesRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ oportunidade: await obterOportunidade(param(req, 'id')) });
  }),
);

/**
 * Trilha de auditoria da oportunidade (item 3.2).
 *
 * Sem perfil extra: quem ve a oportunidade ve o historico dela. Restringir a
 * gestao faria o vendedor perguntar "quem mudou meu valor?" por mensagem, que e
 * pior para todos — e o proprio dono do registro e quem mais precisa da resposta.
 */
opportunitiesRoutes.get(
  '/:id/auditoria',
  asyncHandler(async (req, res) => {
    res.json({ eventos: await auditoriaDaOportunidade(param(req, 'id')) });
  }),
);

/**
 * A proposta comercial em PDF (item 2.2).
 *
 * A marca vem de `getBranding()`, como nos relatorios: o documento sai com o
 * nome e a cor da organizacao, e nao com a marca da plataforma — quem manda a
 * proposta e a empresa.
 */
opportunitiesRoutes.get(
  '/:id/proposta.pdf',
  asyncHandler(async (req, res) => {
    const branding = await getBranding();
    const proposta = await dadosDaProposta(param(req, 'id'), branding.appName);
    const pdf = await gerarPropostaPdf(proposta, branding.corPrimaria);
    await registrarPropostaGerada(param(req, 'id'), req.user?.sub);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposta-${proposta.numero}.pdf"`);
    res.send(pdf);
  }),
);

opportunitiesRoutes.post(
  '/',
  validateBody(criarOportunidadeSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ oportunidade: await criarOportunidade(req.body, req.user?.sub) });
  }),
);

opportunitiesRoutes.patch(
  '/:id',
  validateBody(atualizarOportunidadeSchema),
  asyncHandler(async (req, res) => {
    res.json({ oportunidade: await atualizarOportunidade(param(req, 'id'), req.body, req.user?.sub) });
  }),
);

opportunitiesRoutes.post(
  '/:id/fechar',
  validateBody(fecharOportunidadeSchema),
  asyncHandler(async (req, res) => {
    res.json({ oportunidade: await fecharOportunidade(param(req, 'id'), req.body) });
  }),
);

/**
 * Alcada de desconto (item 2.3).
 *
 * `requireRole` sem COMERCIAL: quem concede o desconto nao aprova o proprio
 * desconto. A politica de visibilidade continua valendo por dentro, entao um
 * GESTOR so decide sobre proposta da equipe dele — perfil diz *se* pode aprovar,
 * politica diz *sobre o que*.
 *
 * Dois verbos e nao um com corpo `{aprovado: boolean}`: aprovar e reprovar sao
 * acoes diferentes com consequencias diferentes, e um booleano no corpo esconde
 * qual foi no log de acesso.
 */
opportunitiesRoutes.post(
  '/:id/desconto/aprovar',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  asyncHandler(async (req, res) => {
    res.json({ oportunidade: await decidirDesconto(param(req, 'id'), true) });
  }),
);

opportunitiesRoutes.post(
  '/:id/desconto/reprovar',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  asyncHandler(async (req, res) => {
    res.json({ oportunidade: await decidirDesconto(param(req, 'id'), false) });
  }),
);

opportunitiesRoutes.put(
  '/:id/itens',
  validateBody(itensSchema),
  asyncHandler(async (req, res) => {
    res.json({ oportunidade: await definirItens(param(req, 'id'), req.body) });
  }),
);
