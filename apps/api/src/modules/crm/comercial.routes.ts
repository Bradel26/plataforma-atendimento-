import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import {
  gravarPoliticaDeDesconto,
  lerPoliticaDeDesconto,
  relatorioFunil,
  relatorioIndicadores,
  relatorioPerdas,
  relatorioRisco,
} from './comercial.service';

/**
 * Leitura comercial do funil (itens 1.2 a 1.5 do plano em ANALISE-CRM.md).
 *
 * Fora do modulo `metrics` de proposito: aquele mede **atendimento** (TME, TMA,
 * CSAT, fila, agente) e este mede **venda**. Juntar os dois num modulo faria a
 * proxima pessoa procurar conversao de funil entre indicadores de fila.
 *
 * Todas as rotas sao de gestao: `AGENTE` e `COMERCIAL` nao entram. A politica de
 * visibilidade ainda se aplica por dentro — GESTOR ve a equipe, nao a
 * organizacao —, entao o perfil diz *se* pode abrir e a politica diz *o que* ve.
 */
export const comercialRoutes = Router();

comercialRoutes.use(requireAuth);

const DIA = 24 * 60 * 60 * 1000;

const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  funilId: z.string().uuid().optional(),
});

/**
 * Janela padrao de 90 dias.
 *
 * Maior que a dos indicadores de atendimento (24h) e que a de assuntos (30 dias)
 * porque ciclo de venda se mede em semanas: o proprio Nectar mostrava "ciclo
 * medio 10 dias", e uma janela de 30 dias daria tres ciclos — pouco para uma
 * media de conversao nao oscilar por acaso.
 */
const janela = (q: z.infer<typeof periodoSchema>, dias = 90) => {
  const ate = q.ate ?? new Date();
  return { desde: q.desde ?? new Date(ate.getTime() - dias * DIA), ate };
};

/** 1.2 — conversao etapa a etapa e tempo medio por etapa. */
comercialRoutes.get(
  '/funil',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(periodoSchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals.query as z.infer<typeof periodoSchema>;
    res.json(await relatorioFunil(janela(q), q.funilId));
  }),
);

/**
 * 1.3 — cartoes de oportunidade em risco.
 *
 * Sem periodo: risco e foto do momento. Uma janela aqui faria o painel dizer
 * "estava atrasada em agosto", que nao e acionavel.
 */
comercialRoutes.get(
  '/risco',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(
    z.object({
      funilId: z.string().uuid().optional(),
      dias: z.coerce.number().int().min(1).max(90).default(7),
    }),
  ),
  asyncHandler(async (_req, res) => {
    const q = res.locals.query as { funilId?: string; dias: number };
    res.json(await relatorioRisco(q.dias, q.funilId));
  }),
);

/** 1.4 — indicadores comerciais, com variacao contra o periodo anterior. */
comercialRoutes.get(
  '/indicadores',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(periodoSchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals.query as z.infer<typeof periodoSchema>;
    res.json(await relatorioIndicadores(janela(q), q.funilId));
  }),
);

/** 1.5 — Win/Loss por motivo de perda. */
comercialRoutes.get(
  '/perdas',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(periodoSchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals.query as z.infer<typeof periodoSchema>;
    res.json(await relatorioPerdas(janela(q), q.funilId));
  }),
);

/**
 * 2.3 — teto de desconto da organizacao.
 *
 * Leitura para quem abre a aba comercial; escrita so para ADMIN e SUPERVISOR.
 * GESTOR aprova desconto mas nao muda a politica: aprovar e decidir um caso,
 * mudar o teto e decidir todos os casos futuros.
 */
comercialRoutes.get(
  '/politica',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  asyncHandler(async (_req, res) => {
    res.json(await lerPoliticaDeDesconto());
  }),
);

comercialRoutes.put(
  '/politica',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(
    z.object({
      /** Cem = sem restricao. Zero = todo desconto passa por aprovacao. */
      descontoMaximoPercentual: z.number().int().min(0).max(100),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { descontoMaximoPercentual } = req.body as { descontoMaximoPercentual: number };
    res.json(await gravarPoliticaDeDesconto(descontoMaximoPercentual));
  }),
);
