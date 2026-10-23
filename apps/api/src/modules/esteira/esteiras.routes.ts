import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { requireModulo } from '../../lib/modulos';
import { exigirOperacao } from './acesso';
import type { ChaveEtapa } from './catalogo';
import { criarVinculoSchema, moverVinculoSchema, type MoverVinculoInput } from './esteiras.schemas';
import { criarVinculo, moverVinculo, obterVinculo } from './vinculos.service';

/**
 * Esteiras TIM e Starlink: `/api/esteiras/:operacao/...`. `exigirOperacao`
 * responde 404 para operação inválida ou sem acesso e 403 para quem só lê e
 * tenta escrever; grava `res.locals.operacao`.
 */
export const esteirasRoutes = Router();

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
