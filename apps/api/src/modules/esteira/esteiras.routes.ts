import type { Operacao } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { requireModulo } from '../../lib/modulos';
import { exigirOperacao } from './acesso';
import { operacaoDaUrl, type ChaveEtapa } from './catalogo';
import {
  criarVinculoSchema,
  editarVinculoSchemas,
  moverVinculoSchema,
  notaSchema,
  vendedorSchema,
  type MoverVinculoInput,
  type NotaInput,
  type VendedorInput,
} from './esteiras.schemas';
import {
  adicionarNota,
  criarVinculo,
  editarCampos,
  inativarVendedor,
  moverVinculo,
  obterVinculo,
  salvarVendedor,
} from './vinculos.service';

/**
 * Esteiras TIM e Starlink: `/api/esteiras/:operacao/...`. `exigirOperacao`
 * responde 404 para operação inválida ou sem acesso e 403 para quem só lê e
 * tenta escrever; grava `res.locals.operacao`.
 */
export const esteirasRoutes = Router();

/** Valida o corpo com o schema da operação da URL (depois de `exigirOperacao`). */
const validarPorOperacao =
  (schemas: Record<Operacao, Parameters<typeof validateBody>[0]>): RequestHandler =>
  (req, res, next) =>
    validateBody(schemas[res.locals.operacao as Operacao])(req, res, next);

/**
 * Vendedores do PDV só existem na TIM: na Starlink a rota "não existe" (404).
 * Vem antes de `exigirOperacao`, senão quem só lê a Starlink receberia 403.
 */
const somenteTim: RequestHandler = (req, _res, next) =>
  next(operacaoDaUrl(String(req.params.operacao ?? '')) === 'TIM' ? undefined : notFound('Recurso não encontrado'));

esteirasRoutes.use(requireAuth);
esteirasRoutes.use(requireModulo('esteira'));

esteirasRoutes.post(
  '/:operacao/vinculos',
  exigirOperacao('EDICAO'),
  validateBody(criarVinculoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ vinculo: await criarVinculo(res.locals.operacao, req.body) });
  }),
);

esteirasRoutes.get(
  '/:operacao/vinculos/:id',
  exigirOperacao('LEITURA'),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await obterVinculo(res.locals.operacao, param(req, 'id')) });
  }),
);

esteirasRoutes.post(
  '/:operacao/vinculos/:id/mover',
  exigirOperacao('EDICAO'),
  validateBody(moverVinculoSchema),
  asyncHandler(async (req, res) => {
    const corpo = req.body as MoverVinculoInput;
    res.json({
      vinculo: await moverVinculo(res.locals.operacao, param(req, 'id'), {
        ...corpo,
        // O serviço confere se a chave é do catálogo da operação da rota.
        paraChave: corpo.paraChave as ChaveEtapa,
      }),
    });
  }),
);

esteirasRoutes.patch(
  '/:operacao/vinculos/:id',
  exigirOperacao('EDICAO'),
  validarPorOperacao(editarVinculoSchemas),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await editarCampos(res.locals.operacao, param(req, 'id'), req.body) });
  }),
);

esteirasRoutes.post(
  '/:operacao/vinculos/:id/notas',
  exigirOperacao('EDICAO'),
  validateBody(notaSchema),
  asyncHandler(async (req, res) => {
    const { texto } = req.body as NotaInput;
    res.status(201).json({ vinculo: await adicionarNota(res.locals.operacao, param(req, 'id'), texto) });
  }),
);

esteirasRoutes.put(
  '/:operacao/vinculos/:id/vendedores',
  somenteTim,
  exigirOperacao('EDICAO'),
  validateBody(vendedorSchema),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await salvarVendedor('TIM', param(req, 'id'), req.body as VendedorInput) });
  }),
);

esteirasRoutes.delete(
  '/:operacao/vinculos/:id/vendedores/:vendedorId',
  somenteTim,
  exigirOperacao('EDICAO'),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await inativarVendedor('TIM', param(req, 'id'), param(req, 'vendedorId')) });
  }),
);
