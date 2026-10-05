import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
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
  funisDaEsteira,
  importarContatosClassificados,
  listarCredenciamentos,
  obterCredenciamento,
} from './credenciamentos.service';
import { acompanhamentos, desempenhoOperacional, gestaoOperacao, painelOperacoes } from './credenciamentos.indicadores';
import { z } from 'zod';

export const credenciamentosRoutes = Router();

credenciamentosRoutes.use(requireAuth);
/** Processo operacional de credenciamento: AGENTE fora, mesmo corte de Oportunidades. */
credenciamentosRoutes.use(requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'));

/** Periodo padrao: ultimos 30 dias. */
function periodoDe(q: { desde?: Date; ate?: Date }) {
  const ate = q.ate ?? new Date();
  const desde = q.desde ?? new Date(ate.getTime() - 30 * 86_400_000);
  return { desde, ate };
}

/** Operacoes (funis ESTEIRA) com seus estagios — alimenta seletores e o menu. */
credenciamentosRoutes.get(
  '/funis',
  asyncHandler(async (_req, res) => {
    const funis = await funisDaEsteira();
    res.json({
      funis: funis.map((f) => ({
        id: f.id,
        nome: f.nome,
        estagios: f.estagios.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem })),
      })),
    });
  }),
);

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

credenciamentosRoutes.get(
  '/',
  validateQuery(listarCredenciamentosSchema),
  asyncHandler(async (_req, res) => {
    res.json({ credenciamentos: await listarCredenciamentos(res.locals.query) });
  }),
);

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

credenciamentosRoutes.post(
  '/importar-contatos-classificados',
  validateBody(z.object({ previa: z.boolean() })),
  asyncHandler(async (req, res) => {
    res.json(await importarContatosClassificados(req.body.previa));
  }),
);

credenciamentosRoutes.post(
  '/',
  validateBody(criarCredenciamentoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ credenciamento: await criarCredenciamento(req.body) });
  }),
);

credenciamentosRoutes.patch(
  '/:id',
  validateBody(atualizarCredenciamentoSchema),
  asyncHandler(async (req, res) => {
    res.json({ credenciamento: await atualizarCredenciamento(param(req, 'id'), req.body) });
  }),
);
