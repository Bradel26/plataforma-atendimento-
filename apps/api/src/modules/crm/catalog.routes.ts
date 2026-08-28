import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

export const productsRoutes = Router();
export const catalogsRoutes = Router();

productsRoutes.use(requireAuth);
catalogsRoutes.use(requireAuth);

const produtoSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()),
  descricao: z.string().trim().max(1000).nullable().optional(),
  ativo: z.boolean().default(true),
});

const listarProdutosSchema = z.object({
  busca: z.string().trim().min(1).optional(),
  ativo: z.enum(['true', 'false']).optional(),
});

const catalogoSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  moeda: z.string().trim().length(3).default('BRL').transform((v) => v.toUpperCase()),
});

const precoSchema = z.object({
  produtoId: z.string().uuid(),
  preco: z.number().nonnegative(),
});

productsRoutes.get(
  '/',
  validateQuery(listarProdutosSchema),
  asyncHandler(async (_req, res) => {
    const { busca, ativo } = res.locals.query as z.infer<typeof listarProdutosSchema>;
    const produtos = await prisma.product.findMany({
      where: {
        ...(ativo ? { ativo: ativo === 'true' } : {}),
        ...(busca
          ? {
              OR: [
                { nome: { contains: busca, mode: 'insensitive' } },
                { sku: { contains: busca.toUpperCase() } },
              ],
            }
          : {}),
      },
      orderBy: { nome: 'asc' },
      include: { itensCatalogo: { include: { catalogo: { select: { id: true, nome: true, moeda: true } } } } },
    });

    res.json({
      produtos: produtos.map(({ itensCatalogo, ...p }) => ({
        ...p,
        precos: itensCatalogo.map((i) => ({
          catalogo: i.catalogo,
          preco: Number(i.preco),
        })),
      })),
    });
  }),
);

productsRoutes.post(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(produtoSchema),
  asyncHandler(async (req, res) => {
    const existente = await prisma.product.findFirst({ where: { sku: req.body.sku } });
    if (existente) throw conflict('Ja existe um produto com este SKU');
    res.status(201).json({ produto: await prisma.product.create({ data: req.body }) });
  }),
);

productsRoutes.patch(
  '/:id',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(produtoSchema.partial().refine((d) => Object.keys(d).length > 0, 'Informe ao menos um campo')),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.product.findUnique({ where: { id } });
    if (!atual) throw notFound('Produto nao encontrado');

    if (req.body.sku && req.body.sku !== atual.sku) {
      const emUso = await prisma.product.findFirst({ where: { sku: req.body.sku } });
      if (emUso) throw conflict('Ja existe um produto com este SKU');
    }
    res.json({ produto: await prisma.product.update({ where: { id }, data: req.body }) });
  }),
);

catalogsRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const catalogos = await prisma.priceCatalog.findMany({
      orderBy: { criadoEm: 'asc' },
      include: { itens: { include: { produto: { select: { id: true, nome: true, sku: true } } } } },
    });

    res.json({
      catalogos: catalogos.map(({ itens, ...c }) => ({
        ...c,
        itens: itens.map((i) => ({ id: i.id, produto: i.produto, preco: Number(i.preco) })),
      })),
    });
  }),
);

catalogsRoutes.post(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(catalogoSchema),
  asyncHandler(async (req, res) => {
    const existente = await prisma.priceCatalog.findFirst({ where: { nome: req.body.nome } });
    if (existente) throw conflict('Ja existe um catalogo com este nome');
    res.status(201).json({ catalogo: await prisma.priceCatalog.create({ data: req.body }) });
  }),
);

/** Define (cria ou atualiza) o preco de um produto no catalogo. */
catalogsRoutes.put(
  '/:id/precos',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(precoSchema),
  asyncHandler(async (req, res) => {
    const catalogoId = param(req, 'id');
    const [catalogo, produto] = await Promise.all([
      prisma.priceCatalog.findUnique({ where: { id: catalogoId } }),
      prisma.product.findUnique({ where: { id: req.body.produtoId } }),
    ]);
    if (!catalogo) throw notFound('Catalogo nao encontrado');
    if (!produto) throw notFound('Produto nao encontrado');

    const item = await prisma.catalogItem.upsert({
      where: { catalogoId_produtoId: { catalogoId, produtoId: produto.id } },
      update: { preco: req.body.preco },
      create: { catalogoId, produtoId: produto.id, preco: req.body.preco },
      include: { produto: { select: { id: true, nome: true, sku: true } } },
    });

    res.json({ item: { id: item.id, produto: item.produto, preco: Number(item.preco) } });
  }),
);
