import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { requireModulo } from '../../lib/modulos';
import { validateQuery } from '../../http/middleware/validate';
import { desempenhoSchema, gestaoSchema, painelSchema } from './credenciamentos.schemas';
import { exigirFunilPermitido, funisPermitidos } from './credenciamentos.service';
import { acompanhamentos, desempenhoOperacional, gestaoOperacao, painelOperacoes } from './credenciamentos.indicadores';
import { z } from 'zod';

/**
 * Indicadores da operacao de credenciamento (Dashboard, Gestao, Desempenho,
 * Acompanhamentos) e a lista de operacoes. O cadastro, o Kanban, a Lista e os
 * movimentos dos vinculos moram em `/api/esteiras/:operacao` (modules/esteira);
 * as rotas antigas de CRUD daqui sairam com a Task 21.
 */
export const credenciamentosRoutes = Router();

credenciamentosRoutes.use(requireAuth);
/** Processo operacional de credenciamento: AGENTE fora, mesmo corte de Oportunidades. */
credenciamentosRoutes.use(requireModulo('esteira'));

/** Periodo padrao: ultimos 30 dias. */
function periodoDe(q: { desde?: Date; ate?: Date }) {
  const ate = q.ate ?? new Date();
  const desde = q.desde ?? new Date(ate.getTime() - 30 * 86_400_000);
  return { desde, ate };
}

/**
 * Operacoes (funis ESTEIRA) com seus estagios — alimenta seletores e o menu.
 * So as operacoes que o usuario enxerga (spec 4.9), com o codigo da operacao e
 * a chave de cada etapa.
 */
credenciamentosRoutes.get(
  '/funis',
  asyncHandler(async (_req, res) => {
    const funis = await funisPermitidos();
    res.json({
      funis: funis.map((f) => ({
        id: f.id,
        nome: f.nome,
        operacao: f.operacao,
        estagios: f.estagios.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem, chave: e.chave, tipo: e.tipoEtapa })),
      })),
    });
  }),
);

/**
 * Painel, Gestao, Desempenho e Acompanhamentos filtram pelas operacoes
 * permitidas dentro dos proprios indicadores (`whereCredenciamentos`).
 */

/** Dashboard: uma coluna por operacao. */
credenciamentosRoutes.get(
  '/painel',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(painelSchema),
  asyncHandler(async (_req, res) => {
    res.json({ operacoes: await painelOperacoes(periodoDe(res.locals.query)) });
  }),
);

/** Area da Gestao: tempo, gargalos e parceiros parados. */
credenciamentosRoutes.get(
  '/gestao',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateQuery(gestaoSchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals.query;
    await exigirFunilPermitido(q.funilId);
    res.json({
      gestao: await gestaoOperacao(periodoDe(q), {
        limiteDias: q.limiteDias,
        horasSemInteracao: q.horasSemInteracao,
        funilId: q.funilId,
      }),
    });
  }),
);

/** Desempenho Operacional: eficiencia por consultor. */
credenciamentosRoutes.get(
  '/desempenho',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(desempenhoSchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals.query;
    await exigirFunilPermitido(q.funilId);
    res.json({
      desempenho: await desempenhoOperacional(periodoDe(q), {
        consultorId: q.consultorId,
        uf: q.uf,
        funilId: q.funilId,
        estagioId: q.estagioId,
      }),
    });
  }),
);

/** CRM > Acompanhamentos: parceiros que precisam de acao ou retorno. */
credenciamentosRoutes.get(
  '/acompanhamentos',
  validateQuery(z.object({ dias: z.coerce.number().int().min(1).max(180).default(7) })),
  asyncHandler(async (_req, res) => {
    res.json({ acompanhamentos: await acompanhamentos(res.locals.query.dias) });
  }),
);
