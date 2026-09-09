import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import {
  atualizarCredenciamentoSchema,
  criarCredenciamentoSchema,
  listarCredenciamentosSchema,
} from './credenciamentos.schemas';
import {
  atualizarCredenciamento,
  criarCredenciamento,
  esteiraKanban,
  listarCredenciamentos,
  obterCredenciamento,
} from './credenciamentos.service';
import { z } from 'zod';

export const credenciamentosRoutes = Router();

credenciamentosRoutes.use(requireAuth);
/** Processo operacional de credenciamento: AGENTE fora, mesmo corte de Oportunidades. */
credenciamentosRoutes.use(requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'));

credenciamentosRoutes.get(
  '/',
  validateQuery(listarCredenciamentosSchema),
  asyncHandler(async (_req, res) => {
    res.json({ credenciamentos: await listarCredenciamentos(res.locals.query) });
  }),
);

credenciamentosRoutes.get(
  '/kanban',
  validateQuery(z.object({ funilId: z.string().uuid().optional() })),
  asyncHandler(async (_req, res) => {
    res.json(await esteiraKanban(res.locals.query.funilId));
  }),
);

credenciamentosRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ credenciamento: await obterCredenciamento(param(req, 'id')) });
  }),
);

credenciamentosRoutes.post(
  '/',
  validateBody(criarCredenciamentoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ credenciamento: await criarCredenciamento(req.body) });
  }),
);

credenciamentosRoutes.patch(
  '/:id',
  validateBody(atualizarCredenciamentoSchema),
  asyncHandler(async (req, res) => {
    res.json({ credenciamento: await atualizarCredenciamento(param(req, 'id'), req.body) });
  }),
);
