import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { param } from '../../http/params';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import {
  enviarMensagemSchema,
  listarConversasSchema,
  transferirSchema,
} from './conversations.schemas';
import {
  assumirConversa,
  contarPorStatus,
  enviarMensagem,
  finalizarConversa,
  listarConversas,
  marcarComoLida,
  obterConversa,
  transferirConversa,
  type Solicitante,
} from './conversations.service';

export const conversationsRoutes = Router();

conversationsRoutes.use(requireAuth);

/** O service decide o escopo (agente ve o dele; gestao ve tudo). */
const quem = (req: { user?: { sub: string; perfil: Solicitante['perfil']; nome: string } }): Solicitante => ({
  sub: req.user!.sub,
  perfil: req.user!.perfil,
  nome: req.user!.nome,
});

conversationsRoutes.get(
  '/',
  validateQuery(listarConversasSchema),
  asyncHandler(async (req, res) => {
    res.json({ conversas: await listarConversas(quem(req), res.locals.query) });
  }),
);

conversationsRoutes.get(
  '/contadores',
  asyncHandler(async (req, res) => {
    res.json({ contadores: await contarPorStatus(quem(req)) });
  }),
);

conversationsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ conversa: await obterConversa(quem(req), param(req, 'id')) });
  }),
);

conversationsRoutes.post(
  '/:id/assumir',
  asyncHandler(async (req, res) => {
    res.json({ conversa: await assumirConversa(quem(req), param(req, 'id')) });
  }),
);

conversationsRoutes.post(
  '/:id/mensagens',
  validateBody(enviarMensagemSchema),
  asyncHandler(async (req, res) => {
    const resultado = await enviarMensagem(quem(req), param(req, 'id'), req.body.conteudo);
    res.status(201).json(resultado);
  }),
);

conversationsRoutes.post(
  '/:id/transferir',
  validateBody(transferirSchema),
  asyncHandler(async (req, res) => {
    res.json({ conversa: await transferirConversa(quem(req), param(req, 'id'), req.body) });
  }),
);

conversationsRoutes.post(
  '/:id/finalizar',
  asyncHandler(async (req, res) => {
    res.json({ conversa: await finalizarConversa(quem(req), param(req, 'id')) });
  }),
);

conversationsRoutes.post(
  '/:id/ler',
  asyncHandler(async (req, res) => {
    res.json({ conversa: await marcarComoLida(quem(req), param(req, 'id')) });
  }),
);
