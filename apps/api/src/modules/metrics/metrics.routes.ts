import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import {
  assuntos,
  indicadores,
  monitorEquipes,
  monitoramentoAgentes,
  obterConfiguracaoMonitoramento,
  salvarConfiguracaoMonitoramento,
  conversasAguardandoResposta,
} from './metrics.service';

export const metricsRoutes = Router();

metricsRoutes.use(requireAuth);

const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

const configuracaoMonitoramentoSchema = z.object({
  alertaRespostaMinutos: z.number().int().min(1).max(240),
  criticoRespostaMinutos: z.number().int().min(2).max(240),
}).refine((config) => config.criticoRespostaMinutos > config.alertaRespostaMinutos, {
  message: 'O limite crítico precisa ser maior que o limite de alerta',
  path: ['criticoRespostaMinutos'],
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

/** Limites de tempo por organizaÃ§Ã£o para alertas de resposta. */
metricsRoutes.get(
  '/alertas-resposta/config',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json({ config: await obterConfiguracaoMonitoramento() });
  }),
);

metricsRoutes.put(
  '/alertas-resposta/config',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(configuracaoMonitoramentoSchema),
  asyncHandler(async (req, res) => {
    res.json({ config: await salvarConfiguracaoMonitoramento(req.body) });
  }),
);

/** Atendimentos atribuÃ­dos cuja Ãºltima mensagem externa ainda aguarda resposta. */
metricsRoutes.get(
  '/alertas-resposta',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    const [config, conversas] = await Promise.all([
      obterConfiguracaoMonitoramento(),
      conversasAguardandoResposta(),
    ]);
    res.json({ config, conversas });
  }),
);

const equipesSchema = z.object({
  filaId: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
});

/** Monitor de equipes: presença, fila de espera e carga por atendente. */
metricsRoutes.get(
  '/equipes',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(equipesSchema),
  asyncHandler(async (_req, res) => {
    const { filaId } = res.locals.query as z.infer<typeof equipesSchema>;
    res.json({ equipes: await monitorEquipes(filaId) });
  }),
);
