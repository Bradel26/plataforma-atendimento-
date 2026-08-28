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
} from './opportunities.schemas';
import {
  atualizarOportunidade,
  criarFunil,
  criarOportunidade,
  definirItens,
  fecharOportunidade,
  funilKanban,
  listarFunis,
  listarOportunidades,
  obterOportunidade,
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

opportunitiesRoutes.put(
  '/:id/itens',
  validateBody(itensSchema),
  asyncHandler(async (req, res) => {
    res.json({ oportunidade: await definirItens(param(req, 'id'), req.body) });
  }),
);
