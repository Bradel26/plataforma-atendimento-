import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { param } from '../../http/params';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { inclusaoResumo, toConversaResumo } from '../conversations/conversations.serializer';

export const contactsRoutes = Router();

contactsRoutes.use(requireAuth);

const listarSchema = z.object({
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
});

const atualizarSchema = z
  .object({
    nome: z.string().trim().min(2).max(120).optional(),
    email: z.string().email().nullable().optional(),
    telefone: z.string().trim().min(8).max(20).nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

contactsRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (_req, res) => {
    const { busca, limite } = res.locals.query as z.infer<typeof listarSchema>;
    const contatos = await prisma.contact.findMany({
      where: busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' } },
              { email: { contains: busca, mode: 'insensitive' } },
              { telefone: { contains: busca } },
            ],
          }
        : undefined,
      orderBy: { atualizadoEm: 'desc' },
      take: limite,
      include: { _count: { select: { conversas: true } } },
    });

    res.json({
      contatos: contatos.map(({ _count, ...c }) => ({ ...c, totalConversas: _count.conversas })),
    });
  }),
);

/** Ficha do contato com o historico de conversas — CRM basico da Fase 1. */
contactsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const contato = await prisma.contact.findUnique({ where: { id } });
    if (!contato) throw notFound('Contato nao encontrado');

    const conversas = await prisma.conversation.findMany({
      where: { contatoId: id },
      include: inclusaoResumo,
      orderBy: { ultimaMensagemEm: 'desc' },
      take: 50,
    });

    res.json({ contato, conversas: conversas.map(toConversaResumo) });
  }),
);

contactsRoutes.patch(
  '/:id',
  validateBody(atualizarSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.contact.findUnique({ where: { id } });
    if (!existe) throw notFound('Contato nao encontrado');

    res.json({ contato: await prisma.contact.update({ where: { id }, data: req.body }) });
  }),
);
