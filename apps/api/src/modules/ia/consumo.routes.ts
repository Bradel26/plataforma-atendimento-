import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { consumoDoMes, definirTetoIa } from './consumo.service';

/**
 * Medidor de consumo de IA (item 6.8).
 *
 * Leitura de ADMIN/SUPERVISOR: e informacao de custo da instalacao, nao de
 * operacao. O mesmo corte da area de gestao.
 */
export const consumoIaRoutes = Router();

consumoIaRoutes.use(requireAuth);
consumoIaRoutes.use(requireRole('ADMIN', 'SUPERVISOR'));

/** `AAAA-MM`, pelo mesmo motivo das metas: data completa abre erro de fuso. */
const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mes no formato AAAA-MM')
  .transform((v) => new Date(`${v}-01T00:00:00Z`));

consumoIaRoutes.get(
  '/consumo',
  validateQuery(z.object({ mes: mesSchema.optional() })),
  asyncHandler(async (_req, res) => {
    res.json(await consumoDoMes(res.locals.query.mes ?? new Date()));
  }),
);

consumoIaRoutes.put(
  '/teto',
  requireRole('ADMIN'),
  validateBody(
    z.object({
      // Nulo remove o teto. Zero e recusado: "nao pode gastar nada" nao e o
      // mesmo que "sem teto", e gravar zero faria toda projecao estourar.
      teto: z.number().positive('O teto tem de ser maior que zero — use nulo para remover').max(1_000_000).nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(await definirTetoIa(req.body.teto));
  }),
);
