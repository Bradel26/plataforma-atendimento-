import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { updateBrandingSchema } from './branding.schemas';
import { getBranding, updateBranding } from './branding.service';

export const brandingRoutes = Router();

/** Publico de proposito: a tela de login precisa do tema antes de autenticar. */
brandingRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ branding: await getBranding() });
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
