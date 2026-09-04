import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { buscar } from './busca.service';

/**
 * Busca global (item 6.2). Sem `requireRole`: cada dominio filtra pela propria
 * politica de visibilidade, e o que a pessoa alcanca aqui e exatamente o que ela
 * alcanca nas telas — nem mais, nem menos.
 */
export const buscaRoutes = Router();

buscaRoutes.use(requireAuth);

buscaRoutes.get(
  '/',
  validateQuery(z.object({ q: z.string().trim().max(120).default('') })),
  asyncHandler(async (_req, res) => {
    res.json(await buscar(res.locals.query.q));
  }),
);
