import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { AppError, badRequest } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { usuarioAtual } from '../../lib/tenant';
import { LIMITE_CHAVES_POR_USUARIO, validarPreferencia } from './preferencias';

/**
 * Preferências do usuário autenticado: `/api/preferencias`. Qualquer usuário
 * autenticado, só as próprias (o id vem da sessão, nunca da URL).
 */
export const preferenciasRoutes = Router();
preferenciasRoutes.use(requireAuth);

const listarQuerySchema = z.object({ prefixo: z.string().trim().min(1, 'Informe o prefixo').max(80) });

preferenciasRoutes.get(
  '/',
  validateQuery(listarQuerySchema),
  asyncHandler(async (_req, res) => {
    const { prefixo } = res.locals.query as z.infer<typeof listarQuerySchema>;
    const linhas = await prisma.preferenciaUsuario.findMany({
      where: { usuarioId: usuarioAtual().id, chave: { startsWith: prefixo, mode: 'insensitive' } },
      select: { chave: true, valor: true },
      orderBy: { chave: 'asc' },
      take: LIMITE_CHAVES_POR_USUARIO,
    });
    res.json({ preferencias: Object.fromEntries(linhas.map((l) => [l.chave, l.valor])) });
  }),
);

preferenciasRoutes.put(
  '/:chave',
  asyncHandler(async (req, res) => {
    const chave = param(req, 'chave');
    const valor = (req.body as { valor?: unknown } | undefined)?.valor;
    const problema = validarPreferencia(chave, valor);
    if (problema) {
      throw problema.status === 413
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', problema.mensagem)
        : badRequest(problema.mensagem);
    }
    const usuarioId = usuarioAtual().id;
    const existe = await prisma.preferenciaUsuario.findUnique({
      where: { usuarioId_chave: { usuarioId, chave } },
      select: { id: true },
    });
    if (!existe && (await prisma.preferenciaUsuario.count({ where: { usuarioId } })) >= LIMITE_CHAVES_POR_USUARIO) {
      throw badRequest(`Limite de ${LIMITE_CHAVES_POR_USUARIO} preferências por usuário atingido`);
    }
    await prisma.preferenciaUsuario.upsert({
      where: { usuarioId_chave: { usuarioId, chave } },
      create: { usuarioId, chave, valor: valor as never },
      update: { valor: valor as never },
    });
    res.status(204).end();
  }),
);

preferenciasRoutes.delete(
  '/:chave',
  asyncHandler(async (req, res) => {
    await prisma.preferenciaUsuario.deleteMany({ where: { usuarioId: usuarioAtual().id, chave: param(req, 'chave') } });
    res.status(204).end();
  }),
);
