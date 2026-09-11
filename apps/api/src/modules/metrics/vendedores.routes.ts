import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { forbidden } from '../../lib/errors';
import { listarVendedoresVisiveis, podeVerVendedor, resumoDoVendedor } from './vendedores.service';

/**
 * Painel individual do vendedor (item §16 do modelo de CRM auditado).
 *
 * Sem `requireRole`: a visibilidade e por ESCOPO (equipe do gestor, ou so a propria
 * pessoa), nao por perfil — um AGENTE de atendimento tambem pode ver o proprio resumo,
 * ainda que ele nao tenha oportunidade nenhuma (os numeros aparecem como zero, o que e
 * verdade, e nao um erro).
 */
export const vendedoresRoutes = Router();

vendedoresRoutes.use(requireAuth);

vendedoresRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ vendedores: await listarVendedoresVisiveis() });
  }),
);

const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mes no formato AAAA-MM')
  .transform((v) => new Date(`${v}-01T00:00:00Z`))
  .optional();

vendedoresRoutes.get(
  '/:id/resumo',
  validateQuery(z.object({ mes: mesSchema })),
  asyncHandler(async (req, res) => {
    const vendedorId = param(req, 'id');
    if (!(await podeVerVendedor(vendedorId))) throw forbidden();
    res.json(await resumoDoVendedor(vendedorId, res.locals.query.mes ?? new Date()));
  }),
);
