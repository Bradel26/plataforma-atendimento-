import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { requireAuth } from '../../http/middleware/auth';
import { limitar } from '../../http/middleware/rate-limit';
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

/**
 * Limite por IP no login e no refresh. O numero e generoso para nao atrapalhar
 * um call center inteiro atras do mesmo IP de saida, e o bloqueio por conta
 * (tentativas.ts) e que segura forca bruta contra um usuario especifico.
 */
authRoutes.post(
  '/login',
  limitar({ nome: 'login', janelaSegundos: 300, maximo: 30 }),
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    // Irrestrito de proposito: e o e-mail que descobre a organizacao.
    const { accessToken, refreshToken, usuario } = await semOrganizacao(
      'login: resolve o usuario pelo e-mail antes de saber a organizacao',
      () => login(req.body),
    );
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    res.json({ accessToken, usuario });
  }),
);

authRoutes.post(
  '/refresh',
  /*
   * Teto alto de proposito, e diferente do de login.
   *
   * Renovar exige um cookie de **uso unico** que o servidor confere e rotaciona:
   * quem nao o tem falha na verificacao, e nao no contador. Ou seja, o limite
   * aqui nao protege contra forca bruta — protege contra alguem com um cookie
   * valido girando renovacoes, e para isso 600 protege igual a 120.
   *
   * O que 120 fazia, na pratica, era derrubar usuario legitimo. O token de
   * acesso vive em memoria e expira em 15 min, entao cada carregamento de
   * pagina (primeiro acesso, F5, aba nova) dispara uma renovacao — e a equipe
   * inteira fica atras do mesmo IP do escritorio. Trinta agentes num pico de
   * troca de turno passam de 120 por janela, e o sintoma para quem usa e ser
   * jogado para a tela de login sem motivo aparente: o defeito que vira "esse
   * sistema desloga sozinho" e ninguem consegue reproduzir.
   *
   * Encontrado pela suite de navegador, que estourou o limite ao passar de 50
   * casos — o mesmo efeito que uma equipe de verdade produz.
   */
  limitar({ nome: 'refresh', janelaSegundos: 300, maximo: 600 }),
  asyncHandler(async (req, res) => {
    const { userId, organizacaoId } = await consumeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    // A organizacao vem do refresh guardado no Redis, nao do corpo nem de header:
    // renovar sessao nao pode ser um jeito de trocar de organizacao.
    const { accessToken, refreshToken, usuario } = await comOrganizacao(organizacaoId, () =>
      sessionForUserId(userId),
    );
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
