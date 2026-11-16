import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Ultimo ADMIN ativo da organizacao: nenhuma das tres operacoes que reduzem o
 * numero de administradores (`updateUser`, `deactivateUser`,
 * `deleteUserPermanently`) pode deixar a organizacao sem um — nem quando duas
 * chegam ao mesmo tempo.
 *
 * LIMITE DESTE TESTE: o banco e simulado em memoria e o `pg_advisory_xact_lock`
 * e representado por um mutex por organizacao, tomado no `$executeRaw` e solto
 * no fim da transacao. Isso prova a LOGICA do servico (toma o lock antes de
 * contar, recontando sobre o estado ja gravado, e todas as operacoes usam o
 * mesmo bloqueio). NAO prova que o Postgres serializa duas transacoes reais —
 * isso so uma execucao contra um Postgres descartavel mostraria.
 */

type Linha = { id: string; organizacaoId: string; perfil: string; ativo: boolean; nome: string; email: string; status: string };

let usuarios: Linha[] = [];
let organizacaoDoChamador = 'org-a';
let lockTomado = vi.fn();

/** Mutex por chave de lock: quem pede espera quem segura soltar. */
const filas = new Map<string, Promise<void>>();
async function adquirir(chave: string): Promise<() => void> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  let soltar!: () => void;
  const atual = new Promise<void>((r) => (soltar = r));
  filas.set(chave, anterior.then(() => atual));
  await anterior;
  return soltar;
}
// Cede o controle para provocar intercalacao entre as duas operacoes: sem o
// lock, as duas leriam o mesmo estado antes de qualquer uma gravar.
const ceder = () => new Promise<void>((r) => setTimeout(r, 0));

function clienteDaTransacao() {
  let solta: (() => void) | null = null;
  const tx = {
    $executeRaw: async (_partes: TemplateStringsArray, chave: string) => {
      lockTomado(chave);
      solta = await adquirir(chave);
    },
    user: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        await ceder();
        return usuarios.find((u) => u.id === where.id && u.organizacaoId === organizacaoDoChamador) ?? null;
      },
      count: async ({ where }: { where: { id: { not: string } } }) => {
        await ceder();
        return usuarios.filter(
          (u) =>
            u.organizacaoId === organizacaoDoChamador && u.perfil === 'ADMIN' && u.ativo && u.id !== where.id.not,
        ).length;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Linha> }) => {
        await ceder();
        const u = usuarios.find((x) => x.id === where.id && x.organizacaoId === organizacaoDoChamador)!;
        Object.assign(u, data);
        return { ...u };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        await ceder();
        usuarios = usuarios.filter((u) => u.id !== where.id);
      },
    },
  };
  return { tx, liberar: () => solta?.() };
}

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        usuarios.find((u) => u.id === where.id && u.organizacaoId === organizacaoDoChamador) ?? null,
      findFirst: async () => null,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const { tx, liberar } = clienteDaTransacao();
      try {
        return await fn(tx);
      } finally {
        liberar();
      }
    },
  },
}));
vi.mock('../../lib/tenant', () => ({ organizacaoAtual: () => organizacaoDoChamador }));
vi.mock('../../lib/politicas', () => ({ exigirUsuarioDaOrganizacao: vi.fn() }));
vi.mock('../filiais/filiais.service', () => ({ exigirFilialDaOrganizacao: vi.fn() }));
vi.mock('../../lib/password', () => ({ hashPassword: async (s: string) => `hash:${s}` }));
vi.mock('../../realtime/hub', () => ({ notificarStatusAgente: vi.fn(), desconectarUsuario: vi.fn() }));
vi.mock('../../lib/sessao', () => ({ invalidarSessaoLocal: vi.fn() }));
vi.mock('../metrics/metrics.service', () => ({ registrarPresenca: vi.fn() }));

import { deactivateUser, deleteUserPermanently, updateUser } from './users.service';

const usuario = (id: string, perfil: string, org = 'org-a', ativo = true): Linha => ({
  id,
  organizacaoId: org,
  perfil,
  ativo,
  nome: id,
  email: `${id}@x.com`,
  status: 'OFFLINE',
});
const adminsAtivos = (org = 'org-a') =>
  usuarios.filter((u) => u.organizacaoId === org && u.perfil === 'ADMIN' && u.ativo).length;

beforeEach(() => {
  filas.clear();
  lockTomado = vi.fn();
  organizacaoDoChamador = 'org-a';
  usuarios = [usuario('admin-1', 'ADMIN'), usuario('admin-2', 'ADMIN'), usuario('agente-1', 'AGENTE')];
});

describe('ultimo ADMIN — operacao isolada', () => {
  it('PATCH recusa rebaixar o unico ADMIN ativo (409) e nada muda', async () => {
    usuarios = [usuario('admin-1', 'ADMIN'), usuario('agente-1', 'AGENTE')];
    await expect(updateUser('admin-1', { perfil: 'AGENTE' })).rejects.toMatchObject({ status: 409 });
    expect(adminsAtivos()).toBe(1);
  });

  it('PATCH recusa desativar o unico ADMIN ativo (409)', async () => {
    usuarios = [usuario('admin-1', 'ADMIN')];
    await expect(updateUser('admin-1', { ativo: false })).rejects.toMatchObject({ status: 409 });
    expect(usuarios[0]!.ativo).toBe(true);
  });

  it('DELETE (desativar) recusa o unico ADMIN ativo (409)', async () => {
    usuarios = [usuario('admin-1', 'ADMIN')];
    await expect(deactivateUser('admin-1')).rejects.toMatchObject({ status: 409 });
    expect(usuarios[0]!.ativo).toBe(true);
  });

  it('exclusao permanente recusa o unico ADMIN ativo (409)', async () => {
    usuarios = [usuario('admin-1', 'ADMIN')];
    await expect(deleteUserPermanently('admin-1')).rejects.toMatchObject({ status: 409 });
    expect(usuarios).toHaveLength(1);
  });

  it('permite rebaixar, desativar e excluir quando ha outro ADMIN ativo', async () => {
    await expect(updateUser('admin-1', { perfil: 'SUPERVISOR' })).resolves.toMatchObject({ perfil: 'SUPERVISOR' });
    // admin-1 saiu; admin-2 passa a ser o ultimo — agora recusa.
    await expect(deactivateUser('admin-2')).rejects.toMatchObject({ status: 409 });
  });

  it('o outro ADMIN precisa estar ATIVO: um ADMIN inativo nao conta', async () => {
    usuarios = [usuario('admin-1', 'ADMIN'), usuario('admin-2', 'ADMIN', 'org-a', false)];
    await expect(updateUser('admin-1', { perfil: 'AGENTE' })).rejects.toMatchObject({ status: 409 });
  });

  it('mudancas que nao reduzem ADMIN passam sem consultar contagem: nome, senha, promover, reativar', async () => {
    usuarios = [usuario('admin-1', 'ADMIN'), usuario('agente-1', 'AGENTE')];
    await expect(updateUser('admin-1', { nome: 'Novo Nome' })).resolves.toMatchObject({ nome: 'Novo Nome' });
    await expect(updateUser('admin-1', { senha: 'senha-nova-123' })).resolves.toBeTruthy();
    await expect(updateUser('agente-1', { perfil: 'ADMIN' })).resolves.toMatchObject({ perfil: 'ADMIN' });
    expect(adminsAtivos()).toBe(2);
  });

  it('usuario inexistente responde 404', async () => {
    await expect(updateUser('nao-existe', { nome: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(deactivateUser('nao-existe')).rejects.toMatchObject({ status: 404 });
    await expect(deleteUserPermanently('nao-existe')).rejects.toMatchObject({ status: 404 });
  });
});

describe('ultimo ADMIN — concorrencia (lock simulado)', () => {
  it('dois ADMIN rebaixados ao mesmo tempo: exatamente um passa, a organizacao fica com 1', async () => {
    usuarios = [usuario('admin-1', 'ADMIN'), usuario('admin-2', 'ADMIN')];

    const resultados = await Promise.allSettled([
      updateUser('admin-1', { perfil: 'AGENTE' }),
      updateUser('admin-2', { perfil: 'AGENTE' }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const recusada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(recusada.reason).toMatchObject({ status: 409 });
    expect(adminsAtivos()).toBe(1);
  });

  it('as TRES operacoes misturadas (PATCH, desativar, excluir) em concorrencia tambem preservam 1 ADMIN', async () => {
    usuarios = [usuario('admin-1', 'ADMIN'), usuario('admin-2', 'ADMIN'), usuario('admin-3', 'ADMIN')];

    await Promise.allSettled([
      updateUser('admin-1', { ativo: false }),
      deactivateUser('admin-2'),
      deleteUserPermanently('admin-3'),
    ]);

    expect(adminsAtivos()).toBe(1);
  });

  it('todas as operacoes tomam o MESMO lock (mesma chave) da organizacao', async () => {
    await updateUser('agente-1', { nome: 'a' });
    await deactivateUser('agente-1');
    await deleteUserPermanently('agente-1');

    expect(lockTomado).toHaveBeenCalledTimes(3);
    const chaves = new Set(lockTomado.mock.calls.map((c) => c[0]));
    expect(chaves).toEqual(new Set(['admins:org-a']));
  });

  it('organizacoes diferentes usam locks diferentes (uma empresa nao espera a outra)', async () => {
    organizacaoDoChamador = 'org-a';
    await updateUser('agente-1', { nome: 'a' });
    usuarios.push(usuario('agente-b', 'AGENTE', 'org-b'));
    organizacaoDoChamador = 'org-b';
    await updateUser('agente-b', { nome: 'b' });

    expect(new Set(lockTomado.mock.calls.map((c) => c[0]))).toEqual(new Set(['admins:org-a', 'admins:org-b']));
  });

  it('isolamento: o ultimo ADMIN de uma organizacao nao e protegido pelos ADMIN de outra', async () => {
    usuarios = [usuario('admin-a', 'ADMIN', 'org-a'), usuario('admin-b', 'ADMIN', 'org-b')];
    organizacaoDoChamador = 'org-a';

    // admin-b existe, mas e de outra organizacao: nao conta como "outro ADMIN".
    await expect(updateUser('admin-a', { perfil: 'AGENTE' })).rejects.toMatchObject({ status: 409 });
    expect(adminsAtivos('org-a')).toBe(1);
  });
});
