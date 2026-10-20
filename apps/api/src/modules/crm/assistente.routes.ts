import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { modulosPermitidos, requireModulo } from '../../lib/modulos';
import { perguntarAoAssistenteCrm } from './assistente.service';

export const assistenteCrmRoutes = Router();
assistenteCrmRoutes.use(requireAuth, requireModulo('crm'));

assistenteCrmRoutes.post(
  '/perguntar',
  validateBody(z.object({ pergunta: z.string().trim().min(3).max(1000), contatoId: z.string().uuid().optional() })),
  asyncHandler(async (req, res) => {
    const usuario = req.user!;
    const modulos = await modulosPermitidos(usuario.perfil);
    res.json(await perguntarAoAssistenteCrm(req.body.pergunta, req.body.contatoId, {
      usuarioId: usuario.sub,
      perfil: usuario.perfil,
      podeTelefonia: modulos.has('telefonia'),
    }));
  }),
);
