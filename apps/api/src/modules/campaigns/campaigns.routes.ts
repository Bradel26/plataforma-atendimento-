import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import {
  adicionarContatos,
  alterarStatus,
  criarCampanha,
  dispararCampanha,
  listarCampanhas,
  obterCampanha,
  reprocessarFalhas,
} from './campaigns.service';

export const campanhasRoutes = Router();

campanhasRoutes.use(requireAuth, requireRole('ADMIN', 'SUPERVISOR'));

const criarSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  canal: z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']).default('WHATSAPP'),
  mensagem: z.string().trim().min(3).max(1000),
  filaId: z.string().uuid().nullable().optional(),
  agendadaPara: z.coerce.date().nullable().optional(),
});

const contatosSchema = z.object({ contatoIds: z.array(z.string().uuid()).min(1).max(2000) });
const statusSchema = z.object({ status: z.enum(['RASCUNHO', 'ATIVA', 'PAUSADA', 'CONCLUIDA']) });
const dispararSchema = z.object({ limite: z.number().int().min(1).max(500).default(100) });

campanhasRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ campanhas: await listarCampanhas() });
  }),
);

campanhasRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await obterCampanha(param(req, 'id')));
  }),
);

campanhasRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ campanha: await criarCampanha(req.body, req.user!.sub) });
  }),
);

campanhasRoutes.post(
  '/:id/contatos',
  validateBody(contatosSchema),
  asyncHandler(async (req, res) => {
    res.json({ campanha: await adicionarContatos(param(req, 'id'), req.body.contatoIds) });
  }),
);

campanhasRoutes.patch(
  '/:id/status',
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    res.json({ campanha: await alterarStatus(param(req, 'id'), req.body.status) });
  }),
);

campanhasRoutes.post(
  '/:id/disparar',
  validateBody(dispararSchema),
  asyncHandler(async (req, res) => {
    res.json({ resultado: await dispararCampanha(param(req, 'id'), req.body.limite) });
  }),
);

campanhasRoutes.post(
  '/:id/reprocessar',
  asyncHandler(async (req, res) => {
    res.json({ resultado: await reprocessarFalhas(param(req, 'id')) });
  }),
);
