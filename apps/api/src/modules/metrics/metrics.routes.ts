import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { assuntos, indicadores, monitoramentoAgentes } from './metrics.service';

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

/**
 * Atendimentos por assunto (etiqueta da conversa). Padrao: ultimos 30 dias.
 *
 * A janela padrao e maior que a dos indicadores (24h) de proposito: assunto e
 * uma leitura de tendencia, e um dia de volume nao distingue "assunto
 * recorrente" de "aconteceu ontem".
 */
metricsRoutes.get(
  '/assuntos',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(periodoSchema.extend({ limite: z.coerce.number().int().min(1).max(100).default(20) })),
  asyncHandler(async (_req, res) => {
    const { desde, ate, limite } = res.locals.query as z.infer<typeof periodoSchema> & { limite: number };
    const fim = ate ?? new Date();
    const inicio = desde ?? new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);
    res.json(await assuntos({ desde: inicio, ate: fim }, limite));
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
