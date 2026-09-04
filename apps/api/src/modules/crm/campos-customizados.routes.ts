import { Router } from 'express';
import type { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import {
  atualizarCampoCustomizadoSchema,
  criarCampoCustomizadoSchema,
  listarCamposCustomizadosSchema,
} from './campos-customizados.schemas';
import { atualizarDefinicao, criarDefinicao, listarDefinicoes, removerDefinicao } from './campos-customizados.service';

/**
 * Definicoes de campo customizado (item 6.4): conta, lead ou oportunidade.
 *
 * Qualquer autenticado le (para montar o formulario e a ficha); so ADMIN
 * cria, edita e remove — mesmo padrao de `Filial` e `Queue`. Os VALORES em si
 * viajam junto com a rota de cada entidade (`POST/PATCH /contas`, `/leads`,
 * `/oportunidades`), e nao aqui: um campo customizado sem o registro dono nao
 * significa nada.
 */
export const camposCustomizadosRoutes = Router();

camposCustomizadosRoutes.use(requireAuth);

camposCustomizadosRoutes.get(
  '/',
  validateQuery(listarCamposCustomizadosSchema),
  asyncHandler(async (_req, res) => {
    const { entidade } = res.locals.query as z.infer<typeof listarCamposCustomizadosSchema>;
    res.json({ campos: await listarDefinicoes(entidade) });
  }),
);

camposCustomizadosRoutes.post(
  '/',
  requireRole('ADMIN'),
  validateBody(criarCampoCustomizadoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ campo: await criarDefinicao(req.body) });
  }),
);

camposCustomizadosRoutes.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(atualizarCampoCustomizadoSchema),
  asyncHandler(async (req, res) => {
    res.json({ campo: await atualizarDefinicao(param(req, 'id'), req.body) });
  }),
);

camposCustomizadosRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await removerDefinicao(param(req, 'id'));
    res.status(204).end();
  }),
);
