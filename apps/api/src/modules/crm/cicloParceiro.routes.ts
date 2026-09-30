import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { CHAVES_ETAPAS, STATUS_CICLO } from './cicloParceiro';
import { listarCiclos, marcarEtapa, mudarStatusManual, obterCiclo, recalcularTodos } from './cicloParceiro.service';

export const cicloParceiroRoutes = Router();

cicloParceiroRoutes.use(requireAuth);
/** Mesmo corte da esteira: AGENTE nao participa do processo de credenciamento. */
cicloParceiroRoutes.use(requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'));

const listarSchema = z.object({
  status: z.enum(STATUS_CICLO).optional(),
  busca: z.string().trim().min(1).max(120).optional(),
  responsavelId: z.string().uuid().optional(),
});

const etapaSchema = z.object({ concluida: z.boolean() });

const statusSchema = z.object({
  status: z.enum(STATUS_CICLO),
  motivo: z.string().trim().max(300).optional(),
  observacao: z.string().trim().max(1000).optional(),
});

/** Lista, resumo por status e a fila de atencao do consultor. */
cicloParceiroRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (_req, res) => {
    res.json(await listarCiclos(res.locals.query));
  }),
);

/** Recalculo sob demanda (o mesmo que o agendador diario faz). */
cicloParceiroRoutes.post(
  '/recalcular',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json(await recalcularTodos());
  }),
);

/** Ciclo de um credenciamento: card, etapas de implantacao e historico. `ciclo` e nulo antes do estagio Ativo. */
cicloParceiroRoutes.get(
  '/credenciamento/:id',
  asyncHandler(async (req, res) => {
    res.json({ ciclo: await obterCiclo(param(req, 'id')) });
  }),
);

cicloParceiroRoutes.put(
  '/credenciamento/:id/etapas/:chave',
  validateBody(etapaSchema),
  asyncHandler(async (req, res) => {
    const chave = param(req, 'chave');
    if (!CHAVES_ETAPAS.includes(chave)) {
      res.status(400).json({ error: 'Etapa de implantação desconhecida' });
      return;
    }
    res.json({ ciclo: await marcarEtapa(param(req, 'id'), chave, (req.body as z.infer<typeof etapaSchema>).concluida) });
  }),
);

/** Mudanca manual: EM_RISCO e INATIVO (motivo obrigatorio) e REATIVADO. */
cicloParceiroRoutes.post(
  '/credenciamento/:id/status',
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    res.json({ ciclo: await mudarStatusManual(param(req, 'id'), req.body as z.infer<typeof statusSchema>) });
  }),
);
