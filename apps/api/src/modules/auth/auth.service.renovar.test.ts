import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Renovacao de sessao e emissao de tokens com a versao de sessao (`sv`).
 *
 * Ordem que a renovacao precisa respeitar: LER o cookie -> VALIDAR no banco ->
 * CONSUMIR -> EMITIR. Se o banco falhar, o cookie nao pode ser gasto (o cliente
 * trata falha de renovacao como sessao expirada e perderia a sessao de verdade).
 *
 * Prisma, Redis e tokens sao simulados; o que se prova e a logica e a ordem.
 */

type Usuario = Record<string, unknown> & { id: string; organizacaoId: string; sessaoVersao: number };

const usuarios: Usuario[] = [];
let organizacaoDoContexto = 'org-1';
let bancoFalha: Error | null = null;
const jtis = new Set<string>();

const consumirRefresh = vi.fn(async (jti: string) => jtis.delete(jti));
const lerRefreshToken = vi.fn();
const issueRefreshToken = vi.fn(async () => 'refresh-novo');
const signAccessToken = vi.fn(() => 'access-novo');
const modulosPermitidos = vi.fn(async () => new Set<string>(['atendimento']));
const invalidarSessaoLocal = vi.fn();
const update = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
  const u = usuarios.find((x) => x.id === where.id)!;
  const { sessaoVersao, ...resto } = data as { sessaoVersao?: { increment: number } };
  Object.assign(u, resto);
  if (sessaoVersao) u.sessaoVersao += sessaoVersao.increment;
  return { ...u };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      // Mesmo efeito da extensao: usuario de outra organizacao volta como nulo.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (bancoFalha) throw bancoFalha;
        return usuarios.find((u) => u.id === where.id && u.organizacaoId === organizacaoDoContexto) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { email: string } }) =>
        usuarios.filter((u) => u.email === where.email).slice(0, 2),
      ),
      update: (...a: [never]) => update(...a),
    },
  },
}));
vi.mock('../../lib/tokens', () => ({
  lerRefreshToken: (...a: unknown[]) => lerRefreshToken(...a),
  consumirRefresh: (...a: [string]) => consumirRefresh(...a),
  issueRefreshToken: (...a: unknown[]) => (issueRefreshToken as (...x: unknown[]) => unknown)(...a),
  signAccessToken: (...a: unknown[]) => (signAccessToken as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('../../lib/sessao', async (original) => ({
  ...(await original<typeof import('../../lib/sessao')>()),
  invalidarSessaoLocal: (...a: unknown[]) => invalidarSessaoLocal(...a),
}));
vi.mock('../../lib/tenant', () => ({
  comOrganizacao: async (org: string, fn: () => unknown) => {
    organizacaoDoContexto = org;
    return fn();
  },
}));
vi.mock('../../lib/modulos', () => ({ modulosPermitidos: (...a: unknown[]) => (modulosPermitidos as (...x: unknown[]) => unknown)(...a) }));
vi.mock('./tentativas', () => ({
  garantirNaoBloqueado: vi.fn(),
  registrarFalha: vi.fn(),
  limparFalhas: vi.fn(),
}));
vi.mock('../metrics/metrics.service', () => ({ registrarPresenca: vi.fn() }));
vi.mock('../esteira/acesso', () => ({ acessoDoUsuario: async () => ({ TIM: 'EDICAO', STARLINK: 'EDICAO' }) }));
vi.mock('../users/users.serializer', () => ({ toPublicUser: (u: { id: string; perfil: string }) => ({ id: u.id, perfil: u.perfil }) }));

import { alterarSenhaInicial, login, renovarSessao } from './auth.service';

const usuario = (extra: Partial<Usuario> = {}): Usuario => ({
  id: 'u1',
  organizacaoId: 'org-1',
  email: 'ana@bradel.com.br',
  nome: 'Ana',
  perfil: 'SUPORTE',
  status: 'OFFLINE',
  ativo: true,
  senhaPendente: false,
  senhaHash: bcrypt.hashSync('SenhaCorreta#1', 4),
  sessaoVersao: 0,
  ...extra,
});

/** Simula o que `lerRefreshToken` devolve para um cookie valido. */
const cookie = (sv: number | undefined, extra: object = {}) => {
  const lido = { userId: 'u1', organizacaoId: 'org-1', jti: 'jti-1', sv, ...extra };
  jtis.add(lido.jti);
  lerRefreshToken.mockResolvedValue(lido);
  return lido;
};

beforeEach(() => {
  usuarios.length = 0;
  jtis.clear();
  bancoFalha = null;
  organizacaoDoContexto = 'org-1';
  for (const m of [consumirRefresh, lerRefreshToken, issueRefreshToken, signAccessToken, modulosPermitidos, invalidarSessaoLocal, update]) {
    m.mockClear();
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('renovarSessao — versao e privilegios', () => {
  it('versao igual: renova, e os tokens novos nascem com a versao E o perfil ATUAIS', async () => {
    usuarios.push(usuario({ sessaoVersao: 3, perfil: 'SUPERVISOR' }));
    cookie(3);

    const r = await renovarSessao('cookie');

    expect(signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', perfil: 'SUPERVISOR', org: 'org-1', sv: 3 }));
    expect(issueRefreshToken).toHaveBeenCalledWith('u1', 'org-1', 3);
    expect(r).toMatchObject({ accessToken: 'access-novo', refreshToken: 'refresh-novo', usuario: { perfil: 'SUPERVISOR' } });
  });

  it('a renovacao mantem o contrato da producao: devolve `operacoes` (menu da Esteira)', async () => {
    usuarios.push(usuario({ sessaoVersao: 0 }));
    cookie(0);
    const r = await renovarSessao('cookie');
    expect(r.usuario).toHaveProperty('operacoes', { TIM: 'EDICAO', STARLINK: 'EDICAO' });
  });

  it('PRIVILEGIO ANTIGO: perfil foi rebaixado (versao subiu) — o refresh antigo nao renova', async () => {
    // Era ADMIN com sv=0; o admin o rebaixou, a versao virou 1 e o perfil, SUPORTE.
    usuarios.push(usuario({ perfil: 'SUPORTE', sessaoVersao: 1 }));
    cookie(0);

    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 401 });
    expect(signAccessToken).not.toHaveBeenCalled();
    expect(issueRefreshToken).not.toHaveBeenCalled();
  });

  it('senha trocada (versao subiu): o refresh antigo nao renova', async () => {
    usuarios.push(usuario({ sessaoVersao: 2 }));
    cookie(1);
    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 401 });
  });

  it('conta desativada: 401 e o cookie NAO e gasto', async () => {
    usuarios.push(usuario({ ativo: false }));
    cookie(0);
    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 401 });
    expect(consumirRefresh).not.toHaveBeenCalled();
  });

  it('usuario de OUTRA organizacao (ou removido): 401', async () => {
    usuarios.push(usuario({ organizacaoId: 'org-2' }));
    cookie(0, { organizacaoId: 'org-1' });
    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 401 });
  });
});

describe('renovarSessao — refresh legado, sem sv', () => {
  it('vale como versao 0: renova enquanto a versao do banco e 0, e o token novo ja leva sv=0', async () => {
    usuarios.push(usuario({ sessaoVersao: 0 }));
    cookie(undefined);

    await renovarSessao('cookie');

    expect(issueRefreshToken).toHaveBeenCalledWith('u1', 'org-1', 0);
  });

  it('NAO renova depois da primeira revogacao (versao >= 1) — nao e coringa', async () => {
    usuarios.push(usuario({ sessaoVersao: 1 }));
    cookie(undefined);
    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 401 });
  });
});

describe('renovarSessao — falha do banco nao vira credencial invalida', () => {
  it('consulta do usuario falha: 503, cookie NAO consumido, nenhum token emitido', async () => {
    usuarios.push(usuario());
    const lido = cookie(0);
    bancoFalha = new Error('connection terminated');

    const erro = await renovarSessao('cookie').catch((e) => e);

    expect(erro).toMatchObject({ status: 503, code: 'SESSAO_INDISPONIVEL' });
    expect(erro.status).not.toBe(401);
    expect(consumirRefresh).not.toHaveBeenCalled();
    expect(jtis.has(lido.jti)).toBe(true); // o cookie continua utilizavel
    expect(signAccessToken).not.toHaveBeenCalled();
  });

  it('consulta dos modulos falha: 503 e cookie NAO consumido', async () => {
    usuarios.push(usuario());
    cookie(0);
    modulosPermitidos.mockImplementationOnce(async () => { throw new Error('timeout'); });

    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 503 });
    expect(consumirRefresh).not.toHaveBeenCalled();
  });

  it('depois da falha, uma nova tentativa com o MESMO cookie funciona', async () => {
    usuarios.push(usuario());
    cookie(0);
    bancoFalha = new Error('connection terminated');
    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 503 });

    bancoFalha = null;
    await expect(renovarSessao('cookie')).resolves.toMatchObject({ accessToken: 'access-novo' });
  });

  it('falha do Redis na leitura (ja convertida em 503 por lerRefreshToken) segue como 503', async () => {
    const { AppError } = await import('../../lib/errors');
    lerRefreshToken.mockImplementation(async () => { throw new AppError(503, 'SESSAO_INDISPONIVEL', 'x'); });
    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 503 });
  });
});

describe('renovarSessao — uso unico e concorrencia', () => {
  it('cookie ja consumido por outra renovacao: 401 e nenhum token e emitido', async () => {
    usuarios.push(usuario());
    cookie(0);
    consumirRefresh.mockResolvedValueOnce(false);

    await expect(renovarSessao('cookie')).rejects.toMatchObject({ status: 401 });
    expect(issueRefreshToken).not.toHaveBeenCalled();
  });

  it('duas renovacoes simultaneas com o mesmo cookie: exatamente uma passa', async () => {
    usuarios.push(usuario());
    cookie(0);

    const r = await Promise.allSettled([renovarSessao('cookie'), renovarSessao('cookie')]);

    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(issueRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('o cookie so e consumido DEPOIS da validacao no banco', async () => {
    usuarios.push(usuario());
    cookie(0);
    const ordem: string[] = [];
    modulosPermitidos.mockImplementationOnce(async () => {
      ordem.push('banco');
      return new Set(['atendimento']);
    });
    consumirRefresh.mockImplementationOnce(async (jti: string) => {
      ordem.push('consumir');
      return jtis.delete(jti);
    });

    await renovarSessao('cookie');
    expect(ordem).toEqual(['banco', 'consumir']);
  });
});

describe('login e troca de senha inicial', () => {
  it('login emite os tokens com a versao ATUAL da pessoa', async () => {
    usuarios.push(usuario({ sessaoVersao: 5 }));

    await login({ email: 'ana@bradel.com.br', senha: 'SenhaCorreta#1' });

    expect(signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ sv: 5 }));
    expect(issueRefreshToken).toHaveBeenCalledWith('u1', 'org-1', 5);
  });

  it('CORRIDA: reset de senha/perfil entre a conferencia da senha e o update — o token sai com a versao do SNAPSHOT, nao a da linha devolvida', async () => {
    // Senha conferida com o usuario em sv=0/ADMIN. Antes de o update rodar, um admin
    // redefine a senha: a linha devolvida pelo update ja esta em sv=1 e SUPORTE.
    usuarios.push(usuario({ sessaoVersao: 0, perfil: 'ADMIN' }));
    update.mockImplementationOnce(async ({ where }) => ({
      ...usuarios.find((x) => x.id === where.id)!,
      sessaoVersao: 1,
      perfil: 'SUPORTE',
    }));

    await login({ email: 'ana@bradel.com.br', senha: 'SenhaCorreta#1' });

    // sv=0 (< 1 do banco): o token nasce velho e a primeira validacao o recusa.
    expect(signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ sv: 0, perfil: 'ADMIN' }));
    expect(issueRefreshToken).toHaveBeenCalledWith('u1', 'org-1', 0);
  });

  it('troca de senha inicial sobe a versao na mesma escrita e solta o cache local', async () => {
    usuarios.push(usuario({ senhaPendente: true, sessaoVersao: 0 }));

    await alterarSenhaInicial({ email: 'ana@bradel.com.br', senhaAtual: 'SenhaCorreta#1', novaSenha: 'NovaSenha#12345' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sessaoVersao: { increment: 1 }, senhaPendente: false }) }),
    );
    expect(usuarios[0]!.sessaoVersao).toBe(1);
    expect(invalidarSessaoLocal).toHaveBeenCalledWith('org-1', 'u1');
  });
});
