import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { param } from '../../http/params';
import { badRequest } from '../../lib/errors';
import { limiteBytes } from '../../lib/storage';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import {
  enviarMensagemSchema,
  listarConversasSchema,
  transferirSchema,
} from './conversations.schemas';
import {
  assumirConversa,
  contarPorStatus,
  enviarArquivo,
  enviarMensagem,
  finalizarConversa,
  listarConversas,
  marcarComoLida,
  obterConversa,
  transferirConversa,
  type Solicitante,
} from './conversations.service';

export const conversationsRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: limiteBytes, files: 1 } });

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

/** Anexo do agente: imagem, audio, video ou documento no campo `arquivo`. */
conversationsRoutes.post(
  '/:id/anexos',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Envie o arquivo no campo "arquivo"');
    const legenda = typeof req.body?.legenda === 'string' ? req.body.legenda : undefined;
    const resultado = await enviarArquivo(
      quem(req),
      param(req, 'id'),
      { buffer: req.file.buffer, nome: req.file.originalname, tipo: req.file.mimetype },
      legenda,
    );
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
