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
  /**
   * Versao da sessao (`User.sessaoVersao`) no momento da emissao. Opcional so
   * para LER token legado; todo token emitido aqui leva o valor. Ver `lib/sessao.ts`.
   */
  sv?: number;
};

type RefreshPayload = { sub: string; jti: string; sv?: number };

// Prefixo por organizacao em toda chave de sessao. O jti ja e unico; o prefixo
// existe para que apagar as sessoes de uma organizacao seja uma varredura de
// prefixo, e para que nada de uma empresa se pareça com chave de outra.
const refreshKey = (jti: string) => `refresh:${jti}`;
const REFRESH_TTL_SECONDS = env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60;

/**
 * Algoritmo fixo nos dois lados. A biblioteca ja recusa `none` e so aceita
 * familia HMAC com segredo simetrico, mas depender de um padrao implicito e deixar
 * a seguranca na mao de uma atualizacao de versao: aqui fica escrito.
 */
const ALGORITMO = 'HS256' as const;
const VERIFICACAO = { algorithms: [ALGORITMO] } satisfies jwt.VerifyOptions;

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITMO,
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  let payload: AccessPayload & { tipo?: string };
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, VERIFICACAO) as AccessPayload & { tipo?: string };
  } catch {
    throw unauthorized('Token de acesso inválido ou expirado');
  }
  // Token de visitante do webchat nao vale como credencial de usuario interno.
  if (payload.tipo === WEBCHAT_TIPO || !payload.perfil) {
    throw unauthorized('Token de acesso inválido ou expirado');
  }
  // Token sem organizacao e de antes do isolamento: nao ha como abrir contexto,
  // e aceitar sem contexto e exatamente o que nao pode acontecer.
  if (!payload.org) throw unauthorized('Token de acesso inválido ou expirado');
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
  return jwt.sign({ ...dados, tipo: WEBCHAT_TIPO }, env.JWT_ACCESS_SECRET, { algorithm: ALGORITMO, expiresIn: '12h' });
}

export function verifyWebchatToken(token: string): WebchatPayload {
  let payload: WebchatPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, VERIFICACAO) as WebchatPayload;
  } catch {
    throw unauthorized('Sessão do webchat inválida ou expirada');
  }
  if (payload.tipo !== WEBCHAT_TIPO) throw unauthorized('Sessão do webchat inválida');
  if (!payload.org) throw unauthorized('Sessão do webchat inválida');
  return payload;
}

/**
 * Emite um refresh token e registra o jti no Redis.
 * O jti no Redis e a fonte de verdade: permite revogar (logout) e rotacionar.
 */
export async function issueRefreshToken(userId: string, organizacaoId: string, sv: number): Promise<string> {
  const jti = randomUUID();
  // `<organizacao>:<usuario>` no valor: a renovacao devolve os dois, e assim ela
  // nao pode mudar de organizacao no caminho.
  // Redis fora do ar nao pode derrubar o login inteiro — so a renovacao futura
  // fica impossivel (o jti nunca foi registrado), um problema muito menor.
  try {
    await redis.set(refreshKey(jti), `${organizacaoId}:${userId}`, 'EX', REFRESH_TTL_SECONDS);
  } catch {
    console.warn(`[auth] issueRefreshToken: Redis indisponível, sessão criada sem registro — renovação futura desta sessão não será possível`);
  }
  return jwt.sign({ sub: userId, jti, sv } satisfies RefreshPayload, env.JWT_REFRESH_SECRET, {
    algorithm: ALGORITMO,
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  });
}

/** Valor guardado no Redis: `<organizacao>:<usuario>`. Recusa sessao sem organizacao ou de outro usuario. */
function lerValorDaSessao(valor: string | null, payload: RefreshPayload) {
  if (!valor) throw unauthorized('Sessão expirada, faca login novamente');
  const [organizacaoId, userId] = valor.split(':');
  if (!organizacaoId || !userId || userId !== payload.sub) {
    throw unauthorized('Sessão expirada, faca login novamente');
  }
  return { organizacaoId, userId };
}

/** Falha do Redis nao e "sessao invalida": 503, para o cliente nao concluir que a credencial morreu. */
const redisIndisponivel = (erro: unknown) => {
  console.error('[auth] Redis indisponível ao ler a sessão:', erro instanceof Error ? erro.message : erro);
  return new AppError(503, 'SESSAO_INDISPONIVEL', 'Não foi possível validar a sessão agora. Tente novamente em instantes.');
};

export type RefreshLido = { userId: string; organizacaoId: string; jti: string; sv: number | undefined };

/**
 * Le o refresh token SEM consumi-lo: confere assinatura e o registro no Redis.
 *
 * A renovacao precisa validar no banco (conta ativa, versao de sessao) antes de
 * gastar o token. Se consumisse primeiro e o banco falhasse, o cliente — que
 * trata qualquer falha de renovacao como sessao expirada — perderia a sessao por
 * uma falha transitoria. O consumo (uso unico) acontece em `consumirRefresh`.
 */
export async function lerRefreshToken(token: string | undefined): Promise<RefreshLido> {
  if (!token) throw new AppError(401, 'SEM_SESSAO', 'Nenhuma sessão para renovar');

  let payload: RefreshPayload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET, VERIFICACAO) as RefreshPayload;
  } catch {
    throw unauthorized('Sessão expirada, faca login novamente');
  }

  let valor: string | null;
  try {
    valor = await redis.get(refreshKey(payload.jti));
  } catch (erro) {
    throw redisIndisponivel(erro);
  }
  const { organizacaoId, userId } = lerValorDaSessao(valor, payload);
  return { userId, organizacaoId, jti: payload.jti, sv: payload.sv };
}

/**
 * Consome o jti (uso unico). `false` se outra renovacao chegou antes. O GETDEL e
 * o arbitro: duas renovacoes simultaneas leem o mesmo registro em `lerRefreshToken`,
 * mas so uma recebe o valor aqui.
 */
export async function consumirRefresh(jti: string): Promise<boolean> {
  try {
    return (await redis.getdel(refreshKey(jti))) !== null;
  } catch (erro) {
    throw redisIndisponivel(erro);
  }
}

/** Revoga o refresh token sem erro caso ja esteja invalido (logout idempotente). */
export async function revokeRefreshToken(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, VERIFICACAO) as RefreshPayload;
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
