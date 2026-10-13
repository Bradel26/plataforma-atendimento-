import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { prisma } from '../../lib/prisma';

export const quickRepliesRoutes = Router();
quickRepliesRoutes.use(requireAuth);

const schema = z.object({
  titulo: z.string().trim().min(2).max(80),
  atalho: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,30}$/).nullable().optional(),
  conteudo: z.string().trim().min(1).max(2000),
  categoria: z.string().trim().min(1).max(40).default('Geral'),
  ativo: z.boolean().default(true),
});

quickRepliesRoutes.get('/', asyncHandler(async (_req, res) => {
  const mensagens = await prisma.mensagemRapida.findMany({
    where: { ativo: true }, orderBy: [{ categoria: 'asc' }, { titulo: 'asc' }],
  });
  res.json({ mensagens });
}));

quickRepliesRoutes.post('/', requireRole('ADMIN', 'SUPERVISOR'), validateBody(schema), asyncHandler(async (req, res) => {
  const mensagem = await prisma.mensagemRapida.create({
    data: { ...req.body, criadoPorId: req.user!.sub },
  });
  res.status(201).json({ mensagem });
}));

quickRepliesRoutes.put('/:id', requireRole('ADMIN', 'SUPERVISOR'), validateBody(schema), asyncHandler(async (req, res) => {
  const mensagem = await prisma.mensagemRapida.update({ where: { id: param(req, 'id') }, data: req.body });
  res.json({ mensagem });
}));

// Desativar preserva a mensagem compartilhada e permite reativá-la depois.
quickRepliesRoutes.patch('/:id/desativar', requireRole('ADMIN', 'SUPERVISOR'), asyncHandler(async (req, res) => {
  await prisma.mensagemRapida.update({ where: { id: param(req, 'id') }, data: { ativo: false } });
  res.status(204).end();
}));
