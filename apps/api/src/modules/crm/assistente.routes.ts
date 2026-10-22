import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { modulosPermitidos } from '../../lib/modulos';
import { forbidden } from '../../lib/errors';
import { perguntarAoAssistenteCrm } from './assistente.service';

export const assistenteCrmRoutes = Router();
assistenteCrmRoutes.use(requireAuth);

assistenteCrmRoutes.post(
  '/perguntar',
  validateBody(z.object({ pergunta: z.string().trim().min(3).max(1000), contatoId: z.string().uuid().optional() })),
  asyncHandler(async (req, res) => {
    const usuario = req.user!;
    const modulos = await modulosPermitidos(usuario.perfil);
    const modulosConsultaveis = ['crm', 'dashboards', 'atendimento', 'telefonia', 'esteira', 'monitoramento', 'auditoria', 'gestao', 'campanhas', 'relatorios', 'chamado-ti'];
    if (!modulosConsultaveis.some((modulo) => modulos.has(modulo))) throw forbidden();
    res.json(await perguntarAoAssistenteCrm(req.body.pergunta, req.body.contatoId, {
      usuarioId: usuario.sub,
      perfil: usuario.perfil,
      podeTelefonia: modulos.has('telefonia'),
      modulos,
    }));
  }),
);
