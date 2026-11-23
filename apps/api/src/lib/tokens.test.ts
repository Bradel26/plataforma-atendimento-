import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Tokens: o que cada credencial NAO pode fazer. Os testes forjam tokens com os
 * mesmos segredos do ambiente de teste para provar que a verificacao recusa
 * tipo, algoritmo e segredo errados — nao apenas que o caminho feliz funciona.
 */

const armazenamento = new Map<string, string>();
vi.mock('./redis', () => ({
  redis: {
    set: vi.fn(async (k: string, v: string) => { armazenamento.set(k, v); return 'OK'; }),
    get: vi.fn(async (k: string) => armazenamento.get(k) ?? null),
    getdel: vi.fn(async (k: string) => { const v = armazenamento.get(k) ?? null; armazenamento.delete(k); return v; }),
    del: vi.fn(async (k: string) => { armazenamento.delete(k); return 1; }),
  },
}));

import { env } from '../env';
import { AppError } from './errors';
import {
  consumirRefresh,
  issueRefreshToken,
  lerRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  signWebchatToken,
  verifyAccessToken,
  verifyWebchatToken,
} from './tokens';

const base = { sub: 'u1', nome: 'Ana', email: 'ana@x.com', perfil: 'SUPORTE' as const, org: 'org-1' };

beforeEach(() => armazenamento.clear());

/** A composicao que a renovacao faz: ler o cookie (sem gastar) e depois consumir o jti. */
async function lerEConsumir(token: string | undefined) {
  const lido = await lerRefreshToken(token);
  if (!(await consumirRefresh(lido.jti))) throw new AppError(401, 'UNAUTHORIZED', 'Sessão expirada, faca login novamente');
  return { userId: lido.userId, organizacaoId: lido.organizacaoId };
}

describe('access token', () => {
  it('round-trip devolve usuario e organizacao', () => {
    const v = verifyAccessToken(signAccessToken(base));
    expect(v).toMatchObject({ sub: 'u1', perfil: 'SUPORTE', org: 'org-1' });
  });

  it('recusa token sem assinatura (alg none)', () => {
    const semAssinatura = jwt.sign(base, '', { algorithm: 'none' as never });
    expect(() => verifyAccessToken(semAssinatura)).toThrow();
  });

  it('recusa algoritmo diferente do fixado, mesmo com o segredo certo', () => {
    const hs512 = jwt.sign(base, env.JWT_ACCESS_SECRET, { algorithm: 'HS512' });
    expect(() => verifyAccessToken(hs512)).toThrow();
  });

  it('recusa assinatura com outro segredo', () => {
    expect(() => verifyAccessToken(jwt.sign(base, 'outro-segredo-qualquer-123456'))).toThrow();
  });

  it('recusa token expirado', () => {
    const expirado = jwt.sign(base, env.JWT_ACCESS_SECRET, { expiresIn: -10 });
    expect(() => verifyAccessToken(expirado)).toThrow();
  });

  it('recusa token sem organizacao (nao ha contexto de tenant)', () => {
    const { org: _org, ...semOrg } = base;
    expect(() => verifyAccessToken(jwt.sign(semOrg, env.JWT_ACCESS_SECRET))).toThrow();
  });

  it('recusa token sem perfil (nao ha como autorizar)', () => {
    const { perfil: _p, ...semPerfil } = base;
    expect(() => verifyAccessToken(jwt.sign(semPerfil, env.JWT_ACCESS_SECRET))).toThrow();
  });

  it('o perfil vem do token assinado: adulterar o payload invalida a assinatura (sem escalar para ADMIN)', () => {
    const [cab, , assin] = signAccessToken(base).split('.');
    const corpoAdmin = Buffer.from(JSON.stringify({ ...base, perfil: 'ADMIN' })).toString('base64url');
    expect(() => verifyAccessToken(`${cab}.${corpoAdmin}.${assin}`)).toThrow();
  });
});

describe('separacao entre os tipos de token', () => {
  it('token de visitante do webchat NAO vale como credencial de usuario', () => {
    const visitante = signWebchatToken({ conversaId: 'c1', contatoId: 'k1', org: 'org-1' });
    expect(() => verifyAccessToken(visitante)).toThrow();
  });

  it('token de usuario NAO vale como sessao de webchat', () => {
    expect(() => verifyWebchatToken(signAccessToken(base))).toThrow();
  });

  it('refresh token NAO vale como access token (segredos diferentes)', async () => {
    const refresh = await issueRefreshToken('u1', 'org-1', 0);
    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it('access token NAO vale como refresh token', async () => {
    await expect(lerEConsumir(signAccessToken(base))).rejects.toMatchObject({ status: 401 });
  });
});

describe('refresh token — uso unico e revogacao', () => {
  it('rotaciona: o mesmo token usado duas vezes falha na segunda', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 0);
    expect(await lerEConsumir(token)).toEqual({ userId: 'u1', organizacaoId: 'org-1' });
    await expect(lerEConsumir(token)).rejects.toMatchObject({ status: 401 });
  });

  it('duas renovacoes simultaneas: so uma vence', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 0);
    const resultados = await Promise.allSettled([lerEConsumir(token), lerEConsumir(token)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('logout revoga: o token nao renova mais', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 0);
    await revokeRefreshToken(token);
    await expect(lerEConsumir(token)).rejects.toMatchObject({ status: 401 });
  });

  it('sem cookie e distinto de cookie invalido (o cliente decide se tenta de novo)', async () => {
    await expect(lerEConsumir(undefined)).rejects.toMatchObject({ code: 'SEM_SESSAO' });
    await expect(lerEConsumir('lixo')).rejects.not.toMatchObject({ code: 'SEM_SESSAO' });
  });

  it('a organizacao vem do registro no servidor, nao do token: nao da para trocar de organizacao renovando', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 0);
    const [chave] = [...armazenamento.keys()];
    armazenamento.set(chave!, 'org-OUTRA:u2'); // registro de outro usuario
    await expect(lerEConsumir(token)).rejects.toMatchObject({ status: 401 });
  });

  it('registro antigo sem organizacao e recusado', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 0);
    const [chave] = [...armazenamento.keys()];
    armazenamento.set(chave!, 'u1');
    await expect(lerEConsumir(token)).rejects.toMatchObject({ status: 401 });
  });
});

describe('versao de sessao (sv) nos tokens', () => {
  it('o access token carrega o sv informado', () => {
    const v = verifyAccessToken(signAccessToken({ ...base, sv: 3 }));
    expect(v.sv).toBe(3);
  });

  it('token legado, sem sv, ainda e lido (a validacao de versao e feita contra o banco)', () => {
    const v = verifyAccessToken(signAccessToken(base));
    expect(v.sv).toBeUndefined();
  });

  it('o refresh token carrega o sv e a leitura o devolve', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 4);
    expect(await lerRefreshToken(token)).toMatchObject({ userId: 'u1', organizacaoId: 'org-1', sv: 4 });
  });

  it('refresh legado, sem sv no JWT, e lido com sv indefinido', async () => {
    const jti = 'jti-legado';
    armazenamento.set(`refresh:${jti}`, 'org-1:u1');
    const legado = jwt.sign({ sub: 'u1', jti }, env.JWT_REFRESH_SECRET, { algorithm: 'HS256', expiresIn: '1d' });
    expect((await lerRefreshToken(legado)).sv).toBeUndefined();
  });
});

describe('lerRefreshToken / consumirRefresh — ler nao gasta o token', () => {
  it('ler varias vezes nao consome; o consumo e de uso unico', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 0);
    const lido = await lerRefreshToken(token);
    await lerRefreshToken(token);

    expect(await consumirRefresh(lido.jti)).toBe(true);
    expect(await consumirRefresh(lido.jti)).toBe(false);
    await expect(lerRefreshToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it('duas renovacoes simultaneas leem o mesmo token, mas so uma consome', async () => {
    const token = await issueRefreshToken('u1', 'org-1', 0);
    const [a, b] = await Promise.all([lerRefreshToken(token), lerRefreshToken(token)]);

    const resultados = await Promise.all([consumirRefresh(a.jti), consumirRefresh(b.jti)]);
    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it('sem cookie: SEM_SESSAO; cookie invalido: 401 comum', async () => {
    await expect(lerRefreshToken(undefined)).rejects.toMatchObject({ code: 'SEM_SESSAO' });
    await expect(lerRefreshToken('lixo')).rejects.toMatchObject({ status: 401 });
  });

  it('falha do Redis e 503, nunca 401 (nao confunde indisponibilidade com sessao invalida)', async () => {
    const { redis } = await import('./redis');
    const token = await issueRefreshToken('u1', 'org-1', 0);
    vi.mocked(redis.get).mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(lerRefreshToken(token)).rejects.toMatchObject({ status: 503, code: 'SESSAO_INDISPONIVEL' });

    vi.mocked(redis.getdel).mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(consumirRefresh('qualquer')).rejects.toMatchObject({ status: 503 });
  });
});
