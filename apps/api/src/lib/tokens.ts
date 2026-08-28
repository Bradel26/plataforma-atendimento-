import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../env';
import { redis } from './redis';
import { AppError, unauthorized } from './errors';

export type AccessPayload = {
  sub: string;
  nome: string;
  email: string;
  perfil: Role;
  /**
   * Organizacao do usuario. Sem ela o token nao serve: a extensao do Prisma le
   * o contexto que este campo abre, e sem contexto nenhuma consulta sai.
   *
   * Token emitido antes desta versao nao tem o campo e e recusado — o efeito e
   * um login a mais, uma vez, para quem estava com sessao aberta no deploy.
   */
  org: string;
};

type RefreshPayload = { sub: string; jti: string };

// Prefixo por organizacao em toda chave de sessao. O jti ja e unico; o prefixo
// existe para que apagar as sessoes de uma organizacao seja uma varredura de
// prefixo, e para que nada de uma empresa se pareça com chave de outra.
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
  // Token sem organizacao e de antes do isolamento: nao ha como abrir contexto,
  // e aceitar sem contexto e exatamente o que nao pode acontecer.
  if (!payload.org) throw unauthorized('Token de acesso invalido ou expirado');
  return payload;
}

const WEBCHAT_TIPO = 'webchat';

export type WebchatPayload = {
  tipo: typeof WEBCHAT_TIPO;
  conversaId: string;
  contatoId: string;
  /** Organizacao dona do widget que abriu esta conversa. */
  org: string;
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
  if (!payload.org) throw unauthorized('Sessao do webchat invalida');
  return payload;
}

/**
 * Emite um refresh token e registra o jti no Redis.
 * O jti no Redis e a fonte de verdade: permite revogar (logout) e rotacionar.
 */
export async function issueRefreshToken(userId: string, organizacaoId: string): Promise<string> {
  const jti = randomUUID();
  // `<organizacao>:<usuario>` no valor: a renovacao devolve os dois, e assim ela
  // nao pode mudar de organizacao no caminho.
  await redis.set(refreshKey(jti), `${organizacaoId}:${userId}`, 'EX', REFRESH_TTL_SECONDS);
  return jwt.sign({ sub: userId, jti } satisfies RefreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  });
}

/**
 * Consome o refresh token (rotacao de uso unico) e devolve o userId.
 *
 * Distingue 'nao ha cookie' de 'cookie invalido' de proposito: o cliente usa o
 * codigo para decidir se vale tentar de novo. Sem sessao nao ha corrida a
 * recuperar; com cookie invalido pode ser outra aba que acabou de rotacionar.
 */
export async function consumeRefreshToken(
  token: string | undefined,
): Promise<{ userId: string; organizacaoId: string }> {
  if (!token) throw new AppError(401, 'SEM_SESSAO', 'Nenhuma sessao para renovar');

  let payload: RefreshPayload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  } catch {
    throw unauthorized('Sessao expirada, faca login novamente');
  }

  // GETDEL: le e apaga num passo. Ler e depois apagar abriria uma janela em que
  // duas renovacoes simultaneas leriam o mesmo jti — token de uso unico usado
  // duas vezes.
  const valor = await redis.getdel(refreshKey(payload.jti));
  if (!valor) throw unauthorized('Sessao expirada, faca login novamente');

  // Valor no formato `<organizacao>:<usuario>`. Sessao gravada antes do
  // isolamento nao tem organizacao e e recusada: um login a mais, uma vez.
  const [organizacaoId, userId] = valor.split(':');
  if (!organizacaoId || !userId || userId !== payload.sub) {
    throw unauthorized('Sessao expirada, faca login novamente');
  }

  return { userId, organizacaoId };
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
