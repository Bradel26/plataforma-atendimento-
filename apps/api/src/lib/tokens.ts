import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../env';
import { redis } from './redis';
import { unauthorized } from './errors';

export type AccessPayload = {
  sub: string;
  nome: string;
  email: string;
  perfil: Role;
};

type RefreshPayload = { sub: string; jti: string };

const refreshKey = (jti: string) => `refresh:${jti}`;
const REFRESH_TTL_SECONDS = env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60;

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  let payload: AccessPayload & { tipo?: string };
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload & { tipo?: string };
  } catch {
    throw unauthorized('Token de acesso invalido ou expirado');
  }
  // Token de visitante do webchat nao vale como credencial de usuario interno.
  if (payload.tipo === WEBCHAT_TIPO || !payload.perfil) {
    throw unauthorized('Token de acesso invalido ou expirado');
  }
  return payload;
}

const WEBCHAT_TIPO = 'webchat';

export type WebchatPayload = {
  tipo: typeof WEBCHAT_TIPO;
  conversaId: string;
  contatoId: string;
};

/**
 * Credencial do visitante do webchat: nao ha usuario, so a conversa que ele abriu.
 * Assinada com o mesmo segredo, mas marcada com `tipo` para nunca ser aceita
 * como token de usuario interno (ver verifyAccessToken).
 */
export function signWebchatToken(dados: Omit<WebchatPayload, 'tipo'>): string {
  return jwt.sign({ ...dados, tipo: WEBCHAT_TIPO }, env.JWT_ACCESS_SECRET, { expiresIn: '12h' });
}

export function verifyWebchatToken(token: string): WebchatPayload {
  let payload: WebchatPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as WebchatPayload;
  } catch {
    throw unauthorized('Sessao do webchat invalida ou expirada');
  }
  if (payload.tipo !== WEBCHAT_TIPO) throw unauthorized('Sessao do webchat invalida');
  return payload;
}

/**
 * Emite um refresh token e registra o jti no Redis.
 * O jti no Redis e a fonte de verdade: permite revogar (logout) e rotacionar.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const jti = randomUUID();
  await redis.set(refreshKey(jti), userId, 'EX', REFRESH_TTL_SECONDS);
  return jwt.sign({ sub: userId, jti } satisfies RefreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  });
}

/** Consome o refresh token (rotacao de uso unico) e devolve o userId. */
export async function consumeRefreshToken(token: string): Promise<string> {
  let payload: RefreshPayload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  } catch {
    throw unauthorized('Sessao expirada, faca login novamente');
  }

  const removed = await redis.del(refreshKey(payload.jti));
  if (removed === 0) throw unauthorized('Sessao expirada, faca login novamente');

  return payload.sub;
}

/** Revoga o refresh token sem erro caso ja esteja invalido (logout idempotente). */
export async function revokeRefreshToken(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
    await redis.del(refreshKey(payload.jti));
  } catch {
    // token ja invalido — nada a revogar
  }
}

export const REFRESH_COOKIE = 'refresh_token';
export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
  maxAge: REFRESH_TTL_SECONDS * 1000,
};
