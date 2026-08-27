import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { param } from '../../http/params';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { notFound } from '../../lib/errors';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { apos, decodificarCursor, fatiar } from '../../lib/paginacao';
import { inclusaoResumo, toConversaResumo } from '../conversations/conversations.serializer';

export const contactsRoutes = Router();

contactsRoutes.use(requireAuth);

const listarSchema = z.object({
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Cadastro manual de contato.
 *
 * Ate aqui o contato so nascia de uma conversa (webhook de canal ou webchat), o
 * que faz sentido para atendimento e nao faz nenhum para CRM: o vendedor que
 * volta de uma feira com trinta cartoes nao tem por onde comecar. Nenhum dos
 * CRMs avaliados deixa de ter um "Novo cliente".
 */
const criarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120),
  email: z.string().email().nullable().optional(),
  telefone: z.string().trim().min(8).max(20).nullable().optional(),
  canalOrigem: z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']).default('WEBCHAT'),
  observacoes: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  contaId: z.string().uuid().nullable().optional(),
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
    const { busca, limite, cursor } = res.locals.query as z.infer<typeof listarSchema>;
    const filtros: Prisma.ContactWhereInput[] = [];

    if (busca) {
      filtros.push({
        OR: [
          { nome: { contains: busca, mode: 'insensitive' } },
          { email: { contains: busca, mode: 'insensitive' } },
          { telefone: { contains: busca } },
        ],
      });
    }
    const depois = apos('atualizadoEm', decodificarCursor(cursor));
    if (depois) filtros.push(depois);

    const registros = await prisma.contact.findMany({
      where: filtros.length > 0 ? { AND: filtros } : undefined,
      orderBy: [{ atualizadoEm: 'desc' }, { id: 'desc' }],
      take: limite + 1,
      include: { _count: { select: { conversas: true } } },
    });

    const { itens, proximoCursor } = fatiar(registros, limite, (c) => c.atualizadoEm);
    res.json({
      contatos: itens.map(({ _count, ...c }) => ({ ...c, totalConversas: _count.conversas })),
      proximoCursor,
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

contactsRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    const dados = req.body as z.infer<typeof criarSchema>;

    if (dados.contaId) {
      const conta = await prisma.account.findUnique({
        where: { id: dados.contaId },
        select: { id: true },
      });
      if (!conta) throw notFound('Conta nao encontrada');
    }

    // Nao ha unique em email nem telefone (o mesmo numero pode aparecer em
    // canais diferentes durante a importacao), entao a duplicidade e avisada e
    // nao bloqueada — bloquear aqui travaria o cadastro legitimo de dois
    // contatos da mesma empresa que compartilham o telefone do escritorio.
    const duplicado = await prisma.contact.findFirst({
      where: {
        OR: [
          dados.email ? { email: dados.email } : undefined,
          dados.telefone ? { telefone: dados.telefone } : undefined,
        ].filter(Boolean) as Prisma.ContactWhereInput[],
      },
      select: { id: true, nome: true },
    });

    const contato = await prisma.contact.create({ data: dados });
    res.status(201).json({ contato, possivelDuplicado: duplicado });
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
