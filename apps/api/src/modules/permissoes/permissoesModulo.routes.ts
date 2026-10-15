import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { listarMatriz, substituirModulosDoPerfil } from './permissoesModulo.service';

export const permissoesModuloRoutes = Router();
permissoesModuloRoutes.use(requireAuth, requireRole('ADMIN'));
permissoesModuloRoutes.get('/', asyncHandler(async (_req, res) => {
  res.json({ permissoes: await listarMatriz() });
}));
permissoesModuloRoutes.put('/:perfil', validateBody(z.object({ modulos: z.array(z.string()) })), asyncHandler(async (req, res) => {
  await substituirModulosDoPerfil(param(req, 'perfil') as never, req.body.modulos);
  res.json({ permissoes: await listarMatriz() });
}));
