import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Revogacao de sessao nas operacoes de usuario. Regras:
 *  - perfil, senha ou desativacao SOBEM `sessaoVersao` na MESMA escrita da mudanca;
 *  - qualquer outra mudanca (nome, e-mail, perfil igual) NAO derruba a sessao de ninguem;
 *  - depois do commit: cache local esquecido e sockets do usuario derrubados;
 *  - se a operacao falha (ex.: ultimo ADMIN, 409), NADA e revogado;
 *  - se so o passo dos sockets falha, a operacao continua valida e o erro e registrado.
 *
 * Banco simulado em memoria; o incremento e aplicado como o Postgres faria
 * (`increment` sobre o valor corrente, atomico por escrita).
 */

type Linha = { id: string; organizacaoId: string; perfil: string; ativo: boolean; nome: string; email: string; status: string; sessaoVersao: number };

let usuarios: Linha[] = [];
let organizacao = 'org-a';
const invalidarSessaoLocal = vi.fn();
const desconectarUsuario = vi.fn();
const dados: Array<Record<string, unknown>> = [];

function aplicar(u: Linha, data: Record<string, unknown>) {
  const { sessaoVersao, ...resto } = data as { sessaoVersao?: { increment: number } } & Record<string, unknown>;
  Object.assign(u, resto);
  if (sessaoVersao) u.sessaoVersao += sessaoVersao.increment;
}

const tx = {
  $executeRaw: async () => undefined,
  user: {
    findFirst: async ({ where }: { where: { id: string } }) => usuarios.find((u) => u.id === where.id && u.organizacaoId === organizacao) ?? null,
    count: async ({ where }: { where: { id: { not: string } } }) =>
      usuarios.filter((u) => u.organizacaoId === organizacao && u.perfil === 'ADMIN' && u.ativo && u.id !== where.id.not).length,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      dados.push(data);
      const u = usuarios.find((x) => x.id === where.id && x.organizacaoId === organizacao)!;
      aplicar(u, data);
      return { ...u };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      usuarios = usuarios.filter((u) => u.id !== where.id);
    },
  },
};

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => usuarios.find((u) => u.id === where.id && u.organizacaoId === organizacao) ?? null,
      findFirst: async () => null,
    },
    // Nenhum usuario dos testes tem numero de WhatsApp conectado (ver `numeroConectado.ts`).
    channelConfig: { count: async () => 0 },
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}));
vi.mock('../../lib/tenant', () => ({ organizacaoAtual: () => organizacao }));
vi.mock('../../lib/politicas', () => ({ exigirUsuarioDaOrganizacao: vi.fn() }));
vi.mock('../filiais/filiais.service', () => ({ exigirFilialDaOrganizacao: vi.fn() }));
vi.mock('../../lib/password', () => ({ hashPassword: async (s: string) => `hash:${s}` }));
vi.mock('../../realtime/hub', () => ({
  notificarStatusAgente: vi.fn(),
  desconectarUsuario: (...a: unknown[]) => desconectarUsuario(...a),
}));
vi.mock('../../lib/sessao', () => ({ invalidarSessaoLocal: (...a: unknown[]) => invalidarSessaoLocal(...a) }));
vi.mock('../metrics/metrics.service', () => ({ registrarPresenca: vi.fn() }));

import { deactivateUser, deleteUserPermanently, updateUser } from './users.service';

const usuario = (id: string, perfil: string, extra: Partial<Linha> = {}): Linha => ({
  id,
  organizacaoId: 'org-a',
  perfil,
  ativo: true,
  nome: id,
  email: `${id}@x.com`,
  status: 'OFFLINE',
  sessaoVersao: 0,
  ...extra,
});
const versao = (id: string) => usuarios.find((u) => u.id === id)?.sessaoVersao;

beforeEach(() => {
  organizacao = 'org-a';
  usuarios = [usuario('admin-1', 'ADMIN'), usuario('admin-2', 'ADMIN'), usuario('agente-1', 'SUPORTE')];
  dados.length = 0;
  invalidarSessaoLocal.mockReset();
  desconectarUsuario.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('o que revoga as sessoes', () => {
  it('mudar o PERFIL sobe a versao, na mesma escrita, e derruba cache e sockets', async () => {
    await updateUser('agente-1', { perfil: 'SUPERVISOR' });

    expect(versao('agente-1')).toBe(1);
    expect(dados).toHaveLength(1); // uma unica escrita: perfil e versao juntos
    expect(dados[0]).toMatchObject({ perfil: 'SUPERVISOR', sessaoVersao: { increment: 1 } });
    expect(invalidarSessaoLocal).toHaveBeenCalledWith('org-a', 'agente-1');
    expect(desconectarUsuario).toHaveBeenCalledWith('org-a', 'agente-1');
  });

  it('redefinir a SENHA sobe a versao', async () => {
    await updateUser('agente-1', { senha: 'senha-nova-123' });
    expect(versao('agente-1')).toBe(1);
    expect(dados[0]).toMatchObject({ senhaHash: 'hash:senha-nova-123', sessaoVersao: { increment: 1 } });
  });

  it('DESATIVAR (PATCH ativo:false) sobe a versao', async () => {
    await updateUser('agente-1', { ativo: false });
    expect(versao('agente-1')).toBe(1);
    expect(desconectarUsuario).toHaveBeenCalledTimes(1);
  });

  it('DESATIVAR (DELETE) sobe a versao e derruba cache e sockets', async () => {
    await deactivateUser('agente-1');
    expect(versao('agente-1')).toBe(1);
    expect(invalidarSessaoLocal).toHaveBeenCalledWith('org-a', 'agente-1');
    expect(desconectarUsuario).toHaveBeenCalledWith('org-a', 'agente-1');
  });

  it('EXCLUIR a conta derruba cache e sockets (a linha some; a validacao recusa por 401)', async () => {
    await deleteUserPermanently('agente-1');
    expect(usuarios.find((u) => u.id === 'agente-1')).toBeUndefined();
    expect(invalidarSessaoLocal).toHaveBeenCalledWith('org-a', 'agente-1');
    expect(desconectarUsuario).toHaveBeenCalledWith('org-a', 'agente-1');
  });
});

describe('o que NAO revoga', () => {
  it('nome, e-mail, filial, gestor: sessao intacta, nenhum socket derrubado', async () => {
    await updateUser('agente-1', { nome: 'Novo Nome' });
    await updateUser('agente-1', { email: 'novo@x.com' });
    expect(versao('agente-1')).toBe(0);
    expect(invalidarSessaoLocal).not.toHaveBeenCalled();
    expect(desconectarUsuario).not.toHaveBeenCalled();
    expect(dados.every((d) => !('sessaoVersao' in d))).toBe(true);
  });

  it('"mudar" o perfil para o MESMO valor nao derruba ninguem', async () => {
    await updateUser('agente-1', { perfil: 'SUPORTE' });
    expect(versao('agente-1')).toBe(0);
    expect(desconectarUsuario).not.toHaveBeenCalled();
  });

  it('reativar (ativo:true) nao sobe a versao', async () => {
    usuarios.push(usuario('inativo', 'SUPORTE', { ativo: false }));
    await updateUser('inativo', { ativo: true });
    expect(versao('inativo')).toBe(0);
  });

  it('desativar quem JA esta inativo nao sobe de novo pelo PATCH', async () => {
    usuarios.push(usuario('inativo', 'SUPORTE', { ativo: false }));
    await updateUser('inativo', { ativo: false });
    expect(versao('inativo')).toBe(0);
  });
});

describe('atomicidade e falhas', () => {
  it('operacao recusada (ultimo ADMIN, 409): nada sobe e nada e derrubado', async () => {
    usuarios = [usuario('admin-1', 'ADMIN')];
    await expect(updateUser('admin-1', { perfil: 'SUPORTE' })).rejects.toMatchObject({ status: 409 });
    await expect(deactivateUser('admin-1')).rejects.toMatchObject({ status: 409 });

    expect(versao('admin-1')).toBe(0);
    expect(invalidarSessaoLocal).not.toHaveBeenCalled();
    expect(desconectarUsuario).not.toHaveBeenCalled();
  });

  it('usuario inexistente (404): nada e revogado', async () => {
    await expect(updateUser('nao-existe', { perfil: 'SUPORTE' })).rejects.toMatchObject({ status: 404 });
    expect(desconectarUsuario).not.toHaveBeenCalled();
  });

  it('se derrubar os sockets FALHA, a operacao continua valida e o erro e registrado (risco residual)', async () => {
    desconectarUsuario.mockImplementation(() => {
      throw new Error('socket.io indisponivel');
    });

    await expect(updateUser('agente-1', { perfil: 'SUPERVISOR' })).resolves.toMatchObject({ perfil: 'SUPERVISOR' });

    expect(versao('agente-1')).toBe(1); // a revogacao (a verdade) esta gravada
    expect(invalidarSessaoLocal).toHaveBeenCalled(); // e o cache local foi solto ANTES
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('falhou ao desconectar os sockets'), 'socket.io indisponivel');
  });

  it('o cache local e solto mesmo quando os sockets falham (ordem: cache primeiro)', async () => {
    const ordem: string[] = [];
    invalidarSessaoLocal.mockImplementation(() => ordem.push('cache'));
    desconectarUsuario.mockImplementation(() => {
      ordem.push('sockets');
      throw new Error('x');
    });
    await updateUser('agente-1', { ativo: false });
    expect(ordem).toEqual(['cache', 'sockets']);
  });

  it('duas mudancas simultaneas somam: o incremento e sobre o valor corrente (nao perde uma)', async () => {
    await Promise.all([updateUser('agente-1', { perfil: 'SUPERVISOR' }), updateUser('agente-1', { senha: 'outra-senha-1' })]);
    expect(versao('agente-1')).toBe(2);
  });
});

describe('isolamento entre organizacoes', () => {
  it('revogar na org-a nao toca o usuario de mesmo id em outra organizacao', async () => {
    usuarios.push(usuario('agente-1', 'SUPORTE', { organizacaoId: 'org-b' }));

    await updateUser('agente-1', { perfil: 'SUPERVISOR' }); // contexto: org-a

    expect(usuarios.find((u) => u.organizacaoId === 'org-b')!.sessaoVersao).toBe(0);
    expect(invalidarSessaoLocal).toHaveBeenCalledWith('org-a', 'agente-1');
    expect(desconectarUsuario).toHaveBeenCalledWith('org-a', 'agente-1');
  });
});
