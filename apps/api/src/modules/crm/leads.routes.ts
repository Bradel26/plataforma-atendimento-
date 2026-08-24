import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { atualizarLeadSchema, criarLeadSchema, listarLeadsSchema } from './leads.schemas';
import {
  atualizarLead,
  criarLead,
  excluirLead,
  leadsPorFase,
  listarLeads,
  obterLead,
  resumoLeads,
} from './leads.service';

export const leadsRoutes = Router();

leadsRoutes.use(requireAuth);

leadsRoutes.get(
  '/',
  validateQuery(listarLeadsSchema),
  asyncHandler(async (_req, res) => {
    res.json({ leads: await listarLeads(res.locals.query) });
  }),
);

/** Visualizacao Kanban: leads agrupados por fase. */
leadsRoutes.get(
  '/kanban',
  validateQuery(listarLeadsSchema),
  asyncHandler(async (_req, res) => {
    res.json({ colunas: await leadsPorFase(res.locals.query) });
  }),
);

leadsRoutes.get(
  '/resumo',
  asyncHandler(async (_req, res) => {
    res.json({ resumo: await resumoLeads() });
  }),
);

leadsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ lead: await obterLead(param(req, 'id')) });
  }),
);

leadsRoutes.post(
  '/',
  validateBody(criarLeadSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ lead: await criarLead(req.body) });
  }),
);

leadsRoutes.patch(
  '/:id',
  validateBody(atualizarLeadSchema),
  asyncHandler(async (req, res) => {
    res.json({ lead: await atualizarLead(param(req, 'id'), req.body) });
  }),
);

leadsRoutes.delete(
  '/:id',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    await excluirLead(param(req, 'id'));
    res.status(204).end();
  }),
);
