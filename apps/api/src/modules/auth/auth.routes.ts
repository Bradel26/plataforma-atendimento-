import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import {
  REFRESH_COOKIE,
  consumeRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
} from '../../lib/tokens';
import { toPublicUser } from '../users/users.serializer';
import { loginSchema } from './auth.schemas';
import { login, marcarOffline, sessionForUserId } from './auth.service';

export const authRoutes = Router();

authRoutes.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, usuario } = await login(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    res.json({ accessToken, usuario });
  }),
);

authRoutes.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const userId = await consumeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    const { accessToken, refreshToken, usuario } = await sessionForUserId(userId);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    res.json({ accessToken, usuario });
  }),
);

authRoutes.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    res.status(204).end();
  }),
);

authRoutes.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw notFound('Usuario nao encontrado');
    res.json({ usuario: toPublicUser(user) });
  }),
);

/** Encerra o expediente: revoga a sessao e marca o agente como OFFLINE. */
authRoutes.post(
  '/sair',
  requireAuth,
  asyncHandler(async (req, res) => {
    await Promise.all([revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]), marcarOffline(req.user!.sub)]);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    res.status(204).end();
  }),
);
