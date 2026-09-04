import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  atualizarVisaoSchema,
  criarVisaoSchema,
  listarVisoesSchema,
  validarFiltroDaEntidade,
} from './visoes.schemas';

/**
 * Visoes salvas (item 6.1): um filtro nomeado, com cor, para reabrir depois em
 * contas, leads e oportunidades.
 *
 * Compartilhada pela organizacao inteira — nao ha politica de visibilidade
 * propria, so o isolamento estrutural de organizacao que a extensao do Prisma
 * ja aplica. Qualquer autenticado le e cria; so quem criou (ou ADMIN/SUPERVISOR)
 * edita ou apaga a de outra pessoa — sem essa trava, uma visao compartilhada
 * seria livre para qualquer um apagar por engano.
 */
export const visoesRoutes = Router();

visoesRoutes.use(requireAuth);

const podeEditar = (req: Request, criadoPorId: string | null) =>
  req.user!.sub === criadoPorId || req.user!.perfil === 'ADMIN' || req.user!.perfil === 'SUPERVISOR';

visoesRoutes.get(
  '/',
  validateQuery(listarVisoesSchema),
  asyncHandler(async (_req, res) => {
    const { entidade } = res.locals.query as z.infer<typeof listarVisoesSchema>;
    const visoes = await prisma.visaoSalva.findMany({
      where: entidade ? { entidade } : {},
      include: { criadoPor: { select: { id: true, nome: true } } },
      orderBy: [{ entidade: 'asc' }, { nome: 'asc' }],
    });
    res.json({ visoes });
  }),
);

visoesRoutes.post(
  '/',
  validateBody(criarVisaoSchema),
  asyncHandler(async (req, res) => {
    const dados = req.body as z.infer<typeof criarVisaoSchema>;
    const existente = await prisma.visaoSalva.findFirst({
      where: { entidade: dados.entidade, nome: dados.nome },
    });
    if (existente) throw conflict('Ja existe uma visao com este nome para esta entidade');

    const visao = await prisma.visaoSalva.create({
      data: {
        entidade: dados.entidade,
        nome: dados.nome,
        cor: dados.cor,
        filtro: dados.filtro,
        criadoPorId: req.user!.sub,
      },
      include: { criadoPor: { select: { id: true, nome: true } } },
    });
    res.status(201).json({ visao });
  }),
);

visoesRoutes.patch(
  '/:id',
  validateBody(atualizarVisaoSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.visaoSalva.findFirst({ where: { id } });
    if (!atual) throw notFound('Visao nao encontrada');
    if (!podeEditar(req, atual.criadoPorId)) {
      throw forbidden('So quem criou a visao, ou ADMIN/SUPERVISOR, pode edita-la');
    }

    const dados = req.body as z.infer<typeof atualizarVisaoSchema>;
    // O filtro validado contra o schema da entidade JA GRAVADA — entidade nao
    // muda por PATCH, entao nao ha ambiguidade sobre qual vocabulario vale.
    const filtro = dados.filtro ? validarFiltroDaEntidade(atual.entidade, dados.filtro) : undefined;

    if (dados.nome && dados.nome !== atual.nome) {
      const duplicada = await prisma.visaoSalva.findFirst({
        where: { entidade: atual.entidade, nome: dados.nome, id: { not: id } },
      });
      if (duplicada) throw conflict('Ja existe uma visao com este nome para esta entidade');
    }

    const visao = await prisma.visaoSalva.update({
      where: { id },
      data: { nome: dados.nome, cor: dados.cor, filtro },
      include: { criadoPor: { select: { id: true, nome: true } } },
    });
    res.json({ visao });
  }),
);

visoesRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.visaoSalva.findFirst({ where: { id } });
    if (!atual) throw notFound('Visao nao encontrada');
    if (!podeEditar(req, atual.criadoPorId)) {
      throw forbidden('So quem criou a visao, ou ADMIN/SUPERVISOR, pode remove-la');
    }

    await prisma.visaoSalva.delete({ where: { id } });
    res.status(204).end();
  }),
);
