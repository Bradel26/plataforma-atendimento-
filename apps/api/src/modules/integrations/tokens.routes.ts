import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { criarToken, listarTokens, revogarToken } from './tokens.service';

export const integracoesRoutes = Router();

// ADMIN e nao SUPERVISOR: um token de escopo IA responde ao cliente em nome da
// empresa, o que e mais poder do que qualquer tela dada a supervisao.
integracoesRoutes.use(requireAuth, requireRole('ADMIN'));

const criarSchema = z.object({
  nome: z.string().trim().min(3).max(80),
  escopo: z.enum(['IA']).default('IA'),
});

integracoesRoutes.get(
  '/tokens',
  asyncHandler(async (_req, res) => {
    res.json({ tokens: await listarTokens() });
  }),
);

integracoesRoutes.post(
  '/tokens',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    const { token, valor } = await criarToken(req.body, req.user?.sub);
    // 201 com o valor em claro: e a unica resposta que o contem, e o cliente
    // precisa saber que este corpo nao se repete.
    res.status(201).json({
      token,
      valor,
      aviso: 'Copie agora. Este valor nao e mostrado de novo — se perder, revogue e crie outro.',
    });
  }),
);

integracoesRoutes.delete(
  '/tokens/:id',
  asyncHandler(async (req, res) => {
    res.json({ token: await revogarToken(param(req, 'id')) });
  }),
);
