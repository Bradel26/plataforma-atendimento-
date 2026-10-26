import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { requireModulo } from '../../lib/modulos';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import {
  atualizarCredenciamentoSchema,
  criarCredenciamentoSchema,
  desempenhoSchema,
  filtrosEsteiraSchema,
  gestaoSchema,
  listarCredenciamentosSchema,
  painelSchema,
} from './credenciamentos.schemas';
import {
  atualizarCredenciamento,
  criarCredenciamento,
  esteiraKanban,
  exigirFunilPermitido,
  funisPermitidos,
  importarContatosClassificados,
  listarCredenciamentos,
  obterCredenciamento,
} from './credenciamentos.service';
import { acompanhamentos, desempenhoOperacional, gestaoOperacao, painelOperacoes } from './credenciamentos.indicadores';
import { z } from 'zod';

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

/** @deprecated Substituida por /api/esteiras/:operacao (Task 21 remove apos o front migrar). */
credenciamentosRoutes.get(
  '/',
  validateQuery(listarCredenciamentosSchema),
  asyncHandler(async (_req, res) => {
    res.json({ credenciamentos: await listarCredenciamentos(res.locals.query) });
  }),
);

/** @deprecated Substituida por /api/esteiras/:operacao (Task 21 remove apos o front migrar). */
credenciamentosRoutes.get(
  '/kanban',
  validateQuery(filtrosEsteiraSchema),
  asyncHandler(async (_req, res) => {
    res.json(await esteiraKanban(res.locals.query));
  }),
);

credenciamentosRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ credenciamento: await obterCredenciamento(param(req, 'id')) });
  }),
);

/** @deprecated Substituida pela importacao da esteira (Task 21 remove apos o front migrar). */
credenciamentosRoutes.post(
  '/importar-contatos-classificados',
  validateBody(z.object({ previa: z.boolean() })),
  asyncHandler(async (req, res) => {
    res.json(await importarContatosClassificados(req.body.previa));
  }),
);

/** @deprecated Substituida por POST /api/esteiras/:operacao (Task 21 remove apos o front migrar). */
credenciamentosRoutes.post(
  '/',
  validateBody(criarCredenciamentoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ credenciamento: await criarCredenciamento(req.body) });
  }),
);

/** @deprecated Substituida pelos movimentos de /api/esteiras/:operacao (Task 21 remove apos o front migrar). */
credenciamentosRoutes.patch(
  '/:id',
  validateBody(atualizarCredenciamentoSchema),
  asyncHandler(async (req, res) => {
    res.json({ credenciamento: await atualizarCredenciamento(param(req, 'id'), req.body) });
  }),
);
