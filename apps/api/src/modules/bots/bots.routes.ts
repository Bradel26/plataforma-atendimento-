import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { excluirBot, listarBots, salvarBot } from './bots.service';

export const botsRoutes = Router();

botsRoutes.use(requireAuth);

const passoSchema = z.object({
  gatilhos: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  resposta: z.string().trim().min(1).max(1000),
  acao: z.enum(['RESPONDER', 'TRANSFERIR', 'ENCERRAR']).default('RESPONDER'),
  filaId: z.string().uuid().nullable().optional(),
});

const botSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2).max(80),
  ativo: z.boolean().default(false),
  canal: z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']).nullable().optional(),
  mensagemBoasVindas: z.string().trim().min(3).max(500),
  fallback: z.string().trim().min(3).max(500),
  limiteSemResposta: z.number().int().min(1).max(5).default(2),
  passos: z.array(passoSchema).max(30),
});

botsRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ bots: await listarBots() });
  }),
);

botsRoutes.put(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(botSchema),
  asyncHandler(async (req, res) => {
    res.json({ bot: await salvarBot(req.body) });
  }),
);

botsRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await excluirBot(param(req, 'id'));
    res.status(204).end();
  }),
);
