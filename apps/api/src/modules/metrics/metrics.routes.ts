import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { indicadores, monitoramentoAgentes } from './metrics.service';

export const metricsRoutes = Router();

metricsRoutes.use(requireAuth);

const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

/** Indicadores do dashboard. Padrao: ultimas 24 horas. */
metricsRoutes.get(
  '/indicadores',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(periodoSchema),
  asyncHandler(async (_req, res) => {
    const { desde, ate } = res.locals.query as z.infer<typeof periodoSchema>;
    const fim = ate ?? new Date();
    const inicio = desde ?? new Date(fim.getTime() - 24 * 60 * 60 * 1000);
    res.json({ indicadores: await indicadores({ desde: inicio, ate: fim }) });
  }),
);

/** Painel de monitoramento em tempo real. */
metricsRoutes.get(
  '/agentes',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  asyncHandler(async (_req, res) => {
    res.json({ agentes: await monitoramentoAgentes() });
  }),
);
