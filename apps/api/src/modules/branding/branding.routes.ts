import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { organizacaoPorSlug, slugDaQuery } from '../../lib/organizacao';
import { comOrganizacao } from '../../lib/tenant';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { updateBrandingSchema } from './branding.schemas';
import { getBranding, updateBranding } from './branding.service';

export const brandingRoutes = Router();

/**
 * Publico de proposito: a tela de login precisa do tema antes de autenticar.
 *
 * Sem sessao nao ha organizacao no contexto, entao ela vem do `?org=<slug>`; sem
 * o parametro, a organizacao inicial — que e o que mantem a tela de login de
 * hoje identica.
 */
brandingRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const organizacaoId = await organizacaoPorSlug(slugDaQuery(req.query.org));
    res.json({ branding: await comOrganizacao(organizacaoId, () => getBranding()) });
  }),
);

brandingRoutes.put(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(updateBrandingSchema),
  asyncHandler(async (req, res) => {
    res.json({ branding: await updateBranding(req.body) });
  }),
);
