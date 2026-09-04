import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { atualizarFilialSchema, criarFilialSchema } from './filiais.schemas';
import { atualizarFilial, criarFilial, listarFiliais, removerFilial } from './filiais.service';

/**
 * Filiais (item 6.5): unidade fisica da organizacao, usada para classificar
 * contas e pessoas. So classificacao — nao ha politica de visibilidade
 * propria, ver o comentario em `Filial` no schema.
 *
 * Qualquer autenticado le (para preencher os seletores de conta/usuario);
 * so ADMIN cria, edita e remove — mesmo padrao de `Queue`.
 */
export const filiaisRoutes = Router();

filiaisRoutes.use(requireAuth);

filiaisRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ filiais: await listarFiliais() });
  }),
);

filiaisRoutes.post(
  '/',
  requireRole('ADMIN'),
  validateBody(criarFilialSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ filial: await criarFilial(req.body) });
  }),
);

filiaisRoutes.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(atualizarFilialSchema),
  asyncHandler(async (req, res) => {
    res.json({ filial: await atualizarFilial(param(req, 'id'), req.body) });
  }),
);

filiaisRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await removerFilial(param(req, 'id'));
    res.status(204).end();
  }),
);
