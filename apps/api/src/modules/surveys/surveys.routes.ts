import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { obterPorToken, responder, resultados } from './surveys.service';

/** Rotas publicas: o cliente responde por link, sem conta na plataforma. */
export const pesquisasPublicasRoutes = Router();
/** Rotas internas: resultados para a gestao. */
export const pesquisasRoutes = Router();

const responderSchema = z.object({
  nota: z.number().int(),
  comentario: z.string().trim().max(1000).optional(),
});

const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

pesquisasPublicasRoutes.get(
  '/:token',
  asyncHandler(async (req, res) => {
    res.json({ pesquisa: await obterPorToken(param(req, 'token')) });
  }),
);

pesquisasPublicasRoutes.post(
  '/:token',
  validateBody(responderSchema),
  asyncHandler(async (req, res) => {
    res.json(await responder(param(req, 'token'), req.body.nota, req.body.comentario));
  }),
);

pesquisasRoutes.get(
  '/resultados',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  validateQuery(periodoSchema),
  asyncHandler(async (_req, res) => {
    const { desde, ate } = res.locals.query as z.infer<typeof periodoSchema>;
    const fim = ate ?? new Date();
    const inicio = desde ?? new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);
    res.json({ resultados: await resultados(inicio, fim) });
  }),
);
