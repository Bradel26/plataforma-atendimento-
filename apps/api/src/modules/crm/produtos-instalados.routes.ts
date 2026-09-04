import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { filtroDe, politicaContas, politicaProdutosDoCliente } from '../../lib/politicas';
import { prisma } from '../../lib/prisma';
import { apenasVisivel } from '../../lib/visibilidade';
import { inclusaoProdutoDoCliente, toProdutoDoCliente } from './crm.serializers';
import {
  atualizarComponenteSchema,
  atualizarProdutoSchema,
  criarComponenteSchema,
  criarProdutoSchema,
  listarProdutosSchema,
} from './produtos-instalados.schemas';
import { validateBody, validateQuery } from '../../http/middleware/validate';

/**
 * Base instalada (item 5.1): o equipamento entregue ao cliente e as garantias
 * por componente que vencem em datas diferentes (regra Philco).
 */
export const produtosInstaladosRoutes = Router();

produtosInstaladosRoutes.use(requireAuth);

produtosInstaladosRoutes.get(
  '/',
  validateQuery(listarProdutosSchema),
  asyncHandler(async (_req, res) => {
    const { contaId, limite } = res.locals.query as z.infer<typeof listarProdutosSchema>;
    const escopo = await filtroDe(politicaProdutosDoCliente);
    const produtos = await prisma.produtoDoCliente.findMany({
      where: { AND: [escopo, ...(contaId ? [{ contaId }] : [])] },
      include: inclusaoProdutoDoCliente,
      orderBy: { criadoEm: 'desc' },
      take: limite,
    });
    res.json({ produtos: produtos.map(toProdutoDoCliente) });
  }),
);

produtosInstaladosRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const produto = await prisma.produtoDoCliente.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaProdutosDoCliente)),
      include: inclusaoProdutoDoCliente,
    });
    if (!produto) throw notFound('Produto nao encontrado');
    res.json({ produto: toProdutoDoCliente(produto) });
  }),
);

produtosInstaladosRoutes.post(
  '/',
  validateBody(criarProdutoSchema),
  asyncHandler(async (req, res) => {
    const { contaId, componentes, ...dados } = req.body as z.infer<typeof criarProdutoSchema>;
    // A conta tem de estar no escopo de quem cria o produto. `exigirVinculosVisiveis`
    // nao serve aqui: ela pula a consulta para quem ve tudo (ADMIN/SUPERVISOR), e um
    // contaId inexistente so apareceria como violacao de FK no banco (500).
    const conta = await prisma.account.findFirst({ where: apenasVisivel(contaId, await filtroDe(politicaContas)) });
    if (!conta) throw notFound('Conta nao encontrada');

    const produto = await prisma.produtoDoCliente.create({
      data: {
        ...dados,
        contaId,
        componentes: {
          createMany: {
            data: componentes.map((c) => ({
              tipo: c.tipo,
              nome: c.nome ?? null,
              prazoDias: c.prazoDias,
              // Sem data propria, herda a de instalacao do produto que acabou de ser criado.
              dataInicio: c.dataInicio ?? dados.dataInstalacao ?? null,
              observacao: c.observacao ?? null,
            })),
          },
        },
      },
      include: inclusaoProdutoDoCliente,
    });
    res.status(201).json({ produto: toProdutoDoCliente(produto) });
  }),
);

produtosInstaladosRoutes.patch(
  '/:id',
  validateBody(atualizarProdutoSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.produtoDoCliente.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaProdutosDoCliente)),
    });
    if (!atual) throw notFound('Produto nao encontrado');

    const produto = await prisma.produtoDoCliente.update({
      where: { id },
      data: req.body,
      include: inclusaoProdutoDoCliente,
    });
    res.json({ produto: toProdutoDoCliente(produto) });
  }),
);

produtosInstaladosRoutes.delete(
  '/:id',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.produtoDoCliente.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaProdutosDoCliente)),
    });
    if (!atual) throw notFound('Produto nao encontrado');
    await prisma.produtoDoCliente.delete({ where: { id } });
    res.status(204).end();
  }),
);

produtosInstaladosRoutes.post(
  '/:id/componentes',
  validateBody(criarComponenteSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const produtoAtual = await prisma.produtoDoCliente.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaProdutosDoCliente)),
    });
    if (!produtoAtual) throw notFound('Produto nao encontrado');

    const { dataInicio, ...dados } = req.body as z.infer<typeof criarComponenteSchema>;
    const produto = await prisma.produtoDoCliente.update({
      where: { id },
      data: {
        componentes: {
          create: { ...dados, dataInicio: dataInicio ?? produtoAtual.dataInstalacao ?? null },
        },
      },
      include: inclusaoProdutoDoCliente,
    });
    res.status(201).json({ produto: toProdutoDoCliente(produto) });
  }),
);

produtosInstaladosRoutes.patch(
  '/:id/componentes/:componenteId',
  validateBody(atualizarComponenteSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const componenteId = param(req, 'componenteId');
    const produtoAtual = await prisma.produtoDoCliente.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaProdutosDoCliente)),
    });
    if (!produtoAtual) throw notFound('Produto nao encontrado');

    const componente = await prisma.componenteGarantia.findFirst({ where: { id: componenteId, produtoDoClienteId: id } });
    if (!componente) throw notFound('Componente de garantia nao encontrado');

    await prisma.componenteGarantia.update({ where: { id: componenteId }, data: req.body });
    const produto = await prisma.produtoDoCliente.findFirst({
      where: { id },
      include: inclusaoProdutoDoCliente,
    });
    res.json({ produto: toProdutoDoCliente(produto!) });
  }),
);

produtosInstaladosRoutes.delete(
  '/:id/componentes/:componenteId',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const componenteId = param(req, 'componenteId');
    const produtoAtual = await prisma.produtoDoCliente.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaProdutosDoCliente)),
    });
    if (!produtoAtual) throw notFound('Produto nao encontrado');

    const componente = await prisma.componenteGarantia.findFirst({ where: { id: componenteId, produtoDoClienteId: id } });
    if (!componente) throw notFound('Componente de garantia nao encontrado');

    await prisma.componenteGarantia.delete({ where: { id: componenteId } });
    const produto = await prisma.produtoDoCliente.findFirst({
      where: { id },
      include: inclusaoProdutoDoCliente,
    });
    res.json({ produto: toProdutoDoCliente(produto!) });
  }),
);
