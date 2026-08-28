import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { inclusaoLead, inclusaoOportunidade, toLead, toOportunidade } from './crm.serializers';

export const accountsRoutes = Router();

accountsRoutes.use(requireAuth);

/** Guarda apenas digitos: mascara nao deve gerar duplicidade de CNPJ. */
const cnpj = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 14, 'CNPJ deve ter 14 digitos');

const criarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(160),
  cnpj: cnpj.nullable().optional(),
  segmento: z.string().trim().max(80).nullable().optional(),
  site: z.string().url('Informe uma URL valida').nullable().optional(),
  telefone: z.string().trim().min(8).max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

const atualizarSchema = criarSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

const listarSchema = z.object({
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

const vincularSchema = z.object({ contatoId: z.string().uuid() });

accountsRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (_req, res) => {
    const { busca, limite } = res.locals.query as z.infer<typeof listarSchema>;
    const contas = await prisma.account.findMany({
      where: busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' } },
              { cnpj: { contains: busca.replace(/\D/g, '') } },
              { segmento: { contains: busca, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { nome: 'asc' },
      take: limite,
      include: { _count: { select: { contatos: true, leads: true, oportunidades: true } } },
    });

    res.json({
      contas: contas.map(({ _count, ...c }) => ({
        ...c,
        totalContatos: _count.contatos,
        totalLeads: _count.leads,
        totalOportunidades: _count.oportunidades,
      })),
    });
  }),
);

/** Ficha 360 da conta: contatos, leads e oportunidades vinculados. */
accountsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const conta = await prisma.account.findUnique({
      where: { id },
      include: { contatos: { orderBy: { nome: 'asc' } } },
    });
    if (!conta) throw notFound('Conta nao encontrada');

    const [leads, oportunidades] = await Promise.all([
      prisma.lead.findMany({ where: { contaId: id }, include: inclusaoLead, orderBy: { atualizadoEm: 'desc' } }),
      prisma.opportunity.findMany({
        where: { contaId: id },
        include: inclusaoOportunidade,
        orderBy: { atualizadoEm: 'desc' },
      }),
    ]);

    res.json({
      conta,
      leads: leads.map(toLead),
      oportunidades: oportunidades.map(toOportunidade),
    });
  }),
);

accountsRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    if (req.body.cnpj) {
      const existente = await prisma.account.findFirst({ where: { cnpj: req.body.cnpj } });
      if (existente) throw conflict('Ja existe uma conta com este CNPJ');
    }
    res.status(201).json({ conta: await prisma.account.create({ data: req.body }) });
  }),
);

accountsRoutes.patch(
  '/:id',
  validateBody(atualizarSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.account.findUnique({ where: { id } });
    if (!atual) throw notFound('Conta nao encontrada');

    if (req.body.cnpj && req.body.cnpj !== atual.cnpj) {
      const existente = await prisma.account.findFirst({ where: { cnpj: req.body.cnpj } });
      if (existente) throw conflict('Ja existe uma conta com este CNPJ');
    }
    res.json({ conta: await prisma.account.update({ where: { id }, data: req.body }) });
  }),
);

accountsRoutes.post(
  '/:id/contatos',
  validateBody(vincularSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const [conta, contato] = await Promise.all([
      prisma.account.findUnique({ where: { id } }),
      prisma.contact.findUnique({ where: { id: req.body.contatoId } }),
    ]);
    if (!conta) throw notFound('Conta nao encontrada');
    if (!contato) throw notFound('Contato nao encontrado');

    res.json({
      contato: await prisma.contact.update({ where: { id: contato.id }, data: { contaId: id } }),
    });
  }),
);

/**
 * Desvincula um contato da conta.
 *
 * Existe porque vincular e um clique e errar tambem: sem desfazer, um contato
 * ligado a empresa errada leva as oportunidades daquela empresa para a ficha
 * dele — e a unica saida seria mexer no banco.
 *
 * Nao apaga o contato. So solta o vinculo.
 */
accountsRoutes.delete(
  '/:id/contatos/:contatoId',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const contatoId = param(req, 'contatoId');

    const contato = await prisma.contact.findUnique({ where: { id: contatoId } });
    if (!contato) throw notFound('Contato nao encontrado');
    // Confere o par: `DELETE /contas/<outra>/contatos/<id>` nao pode soltar um
    // vinculo que nao e daquela conta.
    if (contato.contaId !== id) throw badRequest('Este contato nao esta vinculado a esta conta');

    res.json({ contato: await prisma.contact.update({ where: { id: contatoId }, data: { contaId: null } }) });
  }),
);

accountsRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.account.findUnique({ where: { id } });
    if (!atual) throw notFound('Conta nao encontrada');
    await prisma.account.delete({ where: { id } });
    res.status(204).end();
  }),
);
