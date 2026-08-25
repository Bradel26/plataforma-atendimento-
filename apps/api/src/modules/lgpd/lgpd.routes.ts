import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { executarExpurgo } from './expurgo.service';
import {
  anonimizarTitular,
  exportarTitular,
  listarRegistros,
  obterPolitica,
  salvarPolitica,
} from './lgpd.service';

/** Tudo aqui e privativo do administrador: apaga ou exporta dado pessoal. */
export const lgpdRoutes = Router();
lgpdRoutes.use(requireAuth, requireRole('ADMIN'));

const politicaSchema = z.object({
  ativa: z.boolean().optional(),
  diasConversas: z.number().int().min(7).max(3650).optional(),
  diasProtocolos: z.number().int().min(7).max(3650).optional(),
  diasPresenca: z.number().int().min(7).max(3650).optional(),
});

const expurgoSchema = z.object({
  /** Padrao true: expurgo de verdade exige pedir explicitamente. */
  simulacao: z.boolean().default(true),
  confirmacao: z.literal('EXPURGAR').optional(),
});

lgpdRoutes.get(
  '/politica',
  asyncHandler(async (_req, res) => {
    res.json({ politica: await obterPolitica() });
  }),
);

lgpdRoutes.put(
  '/politica',
  validateBody(politicaSchema),
  asyncHandler(async (req, res) => {
    res.json({ politica: await salvarPolitica(req.body) });
  }),
);

lgpdRoutes.post(
  '/expurgo',
  validateBody(expurgoSchema),
  asyncHandler(async (req, res) => {
    const { simulacao, confirmacao } = req.body as z.infer<typeof expurgoSchema>;
    // Duas travas para uma operacao irreversivel: pedir simulacao: false e
    // digitar a palavra. Clique errado nao apaga o historico da operacao.
    const executar = simulacao === false && confirmacao === 'EXPURGAR';
    res.json({ resumo: await executarExpurgo({ simulacao: !executar, autorId: req.user!.sub }) });
  }),
);

lgpdRoutes.get(
  '/registros',
  asyncHandler(async (_req, res) => {
    res.json({ registros: await listarRegistros() });
  }),
);

lgpdRoutes.get(
  '/titulares/:id/exportar',
  asyncHandler(async (req, res) => {
    res.json({ dados: await exportarTitular(param(req, 'id'), req.user!.sub) });
  }),
);

lgpdRoutes.post(
  '/titulares/:id/anonimizar',
  validateBody(z.object({ confirmacao: z.literal('ANONIMIZAR') })),
  asyncHandler(async (req, res) => {
    res.json({ resultado: await anonimizarTitular(param(req, 'id'), { autorId: req.user!.sub }) });
  }),
);
