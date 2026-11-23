import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/*
 * INTEGRACAO COM POSTGRESQL REAL — roda so com `npm run test:integracao`, contra um
 * banco local e descartavel (ver `lib/banco-teste.ts` e
 * docs/seguranca/testes-integracao-postgres.md). Fora de `npm test`.
 *
 * O que estes testes provam e que os testes de unidade (Prisma simulado) NAO provam:
 *  - `pg_advisory_xact_lock` serializa de verdade duas transacoes da mesma organizacao
 *    e nao bloqueia outra organizacao;
 *  - a corrida entre administradores acaba com exatamente um passando e a organizacao
 *    com pelo menos um ADMIN ativo;
 *  - `sessaoVersao: { increment: 1 }` e atomico no SQL (nenhuma escrita se perde);
 *  - o isolamento por organizacao vale no filtro REAL da extensao do Prisma, inclusive
 *    na consulta de `validarSessao`;
 *  - a migration deixou a coluna NOT NULL com default 0.
 */

vi.mock('../lib/redis', () => ({ redis: {} }));

import { prisma, prismaSemIsolamento } from '../lib/prisma';
import { comOrganizacao } from '../lib/tenant';
import { invalidarSessaoLocal, validarSessao } from '../lib/sessao';
import { deactivateUser, deleteUserPermanently, updateUser } from '../modules/users/users.service';

type Perfil = 'ADMIN' | 'SUPERVISOR' | 'SUPORTE';

const EXECUCAO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const orgsCriadas: string[] = [];
let contador = 0;

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

async function criarOrg(rotulo: string) {
  const org = await prismaSemIsolamento.organizacao.create({
    data: { nome: `Integracao ${rotulo}`, slug: `integ-${rotulo}-${EXECUCAO}-${contador++}` },
  });
  orgsCriadas.push(org.id);
  return org.id;
}

async function criarUsuario(organizacaoId: string, perfil: Perfil, nome: string, email?: string) {
  return prismaSemIsolamento.user.create({
    data: {
      organizacaoId,
      nome,
      email: email ?? `${nome}-${contador++}@${EXECUCAO}.teste`,
      senhaHash: 'hash-de-teste',
      perfil,
      ativo: true,
    },
  });
}

/** Executa o servico como o app faria: dentro do contexto da organizacao, com um ator. */
const como = <T>(organizacaoId: string, fn: () => Promise<T>) =>
  comOrganizacao(organizacaoId, fn, { id: 'ator-de-teste', perfil: 'ADMIN' });

const adminsAtivos = (organizacaoId: string) =>
  prismaSemIsolamento.user.count({ where: { organizacaoId, perfil: 'ADMIN', ativo: true } });
const versaoDe = async (id: string) => (await prismaSemIsolamento.user.findUniqueOrThrow({ where: { id } })).sessaoVersao;

beforeAll(async () => {
  // Defesa em profundidade: mesmo depois da guarda do setup, confirma onde esta ligado.
  const destino = new URL(process.env.DATABASE_URL!);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(destino.hostname)) {
    throw new Error(`Recusado: DATABASE_URL aponta para ${destino.hostname}, nao para um banco local.`);
  }
  const colunas = await prismaSemIsolamento.$queryRaw<Array<{ is_nullable: string; column_default: string | null }>>`
    SELECT is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'sessao_versao'`;
  if (colunas.length === 0) {
    throw new Error('A coluna usuarios.sessao_versao nao existe: rode `npm run test:integracao:preparar` no banco de teste.');
  }
});

afterAll(async () => {
  if (orgsCriadas.length === 0) return;
  // Banco descartavel: limpa o que o teste criou, sem tocar em mais nada.
  await prismaSemIsolamento.user.deleteMany({ where: { organizacaoId: { in: orgsCriadas } } }).catch(() => undefined);
  await prismaSemIsolamento.organizacao.deleteMany({ where: { id: { in: orgsCriadas } } }).catch(() => undefined);
  await prismaSemIsolamento.$disconnect();
});

describe('migration sessao_versao_usuario', () => {
  it('a coluna e NOT NULL com default 0, e usuario novo nasce com versao 0', async () => {
    const [col] = await prismaSemIsolamento.$queryRaw<Array<{ is_nullable: string; column_default: string | null }>>`
      SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'usuarios' AND column_name = 'sessao_versao'`;
    expect(col!.is_nullable).toBe('NO');
    expect(col!.column_default).toBe('0');

    const org = await criarOrg('migration');
    const u = await criarUsuario(org, 'SUPORTE', 'novo');
    expect(u.sessaoVersao).toBe(0);
  });
});

describe('pg_advisory_xact_lock — serializacao real', () => {
  /** Segura o lock da organizacao por `ms` e informa quando adquiriu e quando vai soltar. */
  async function segurar(organizacaoId: string, ms: number) {
    return prismaSemIsolamento.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admins:${organizacaoId}`}, 0))`;
        const adquiriuEm = Date.now();
        await dormir(ms);
        return { adquiriuEm, soltouEm: Date.now() };
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  }

  it('a segunda transacao da MESMA organizacao espera a primeira terminar', async () => {
    const org = await criarOrg('lock');
    const a = segurar(org, 800);
    await dormir(150); // garante que A pegou o lock antes de B tentar
    const b = segurar(org, 10);

    const [ra, rb] = await Promise.all([a, b]);

    // B so adquire depois de A soltar (folga de 30 ms por resolucao de relogio/commit).
    expect(rb.adquiriuEm).toBeGreaterThanOrEqual(ra.soltouEm - 30);
  });

  it('organizacoes DIFERENTES nao se bloqueiam', async () => {
    const orgA = await criarOrg('lockA');
    const orgB = await criarOrg('lockB');
    const a = segurar(orgA, 800);
    await dormir(150);
    const inicioB = Date.now();
    const rb = await segurar(orgB, 10);
    const ra = await a;

    // B adquiriu quase imediatamente, bem antes de A soltar.
    expect(rb.adquiriuEm - inicioB).toBeLessThan(400);
    expect(rb.adquiriuEm).toBeLessThan(ra.soltouEm);
  });
});

describe('ultimo ADMIN — concorrencia real', () => {
  it('dois ADMIN rebaixados ao mesmo tempo, 15 rodadas: sempre um passa, um recebe 409, sobra 1 ADMIN', async () => {
    for (let rodada = 0; rodada < 15; rodada++) {
      const org = await criarOrg(`corrida${rodada}`);
      const a1 = await criarUsuario(org, 'ADMIN', `a1-${rodada}`);
      const a2 = await criarUsuario(org, 'ADMIN', `a2-${rodada}`);

      const r = await Promise.allSettled([
        como(org, () => updateUser(a1.id, { perfil: 'SUPORTE' })),
        como(org, () => updateUser(a2.id, { perfil: 'SUPORTE' })),
      ]);

      expect(r.filter((x) => x.status === 'fulfilled'), `rodada ${rodada}`).toHaveLength(1);
      const recusada = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
      expect(recusada.reason).toMatchObject({ status: 409 });
      expect(await adminsAtivos(org), `rodada ${rodada}`).toBe(1);
    }
  });

  it('PATCH, desativar e excluir misturados em 3 ADMIN: ao menos 1 sobra, e no maximo 2 operacoes passam', async () => {
    const org = await criarOrg('mistura');
    const [a1, a2, a3] = await Promise.all([
      criarUsuario(org, 'ADMIN', 'm1'),
      criarUsuario(org, 'ADMIN', 'm2'),
      criarUsuario(org, 'ADMIN', 'm3'),
    ]);

    const r = await Promise.allSettled([
      como(org, () => updateUser(a1.id, { ativo: false })),
      como(org, () => deactivateUser(a2.id)),
      como(org, () => deleteUserPermanently(a3.id)),
    ]);

    expect(await adminsAtivos(org)).toBeGreaterThanOrEqual(1);
    expect(r.filter((x) => x.status === 'fulfilled').length).toBeLessThanOrEqual(2);
  });
});

describe('sessaoVersao — incremento atomico', () => {
  it('40 incrementos concorrentes direto no SQL: nenhum se perde (versao final = 40)', async () => {
    const org = await criarOrg('atomico');
    const u = await criarUsuario(org, 'SUPORTE', 'contador');

    await Promise.all(
      Array.from({ length: 40 }, () =>
        prismaSemIsolamento.user.update({ where: { id: u.id }, data: { sessaoVersao: { increment: 1 } } }),
      ),
    );

    expect(await versaoDe(u.id)).toBe(40);
  });

  it('10 trocas de senha concorrentes pelo servico: versao final = 10', async () => {
    const org = await criarOrg('senhas');
    const u = await criarUsuario(org, 'SUPORTE', 'trocas');

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => como(org, () => updateUser(u.id, { senha: `senha-numero-${i}-forte` }))),
    );

    expect(await versaoDe(u.id)).toBe(10);
  });

  it('mudar so o nome NAO sobe a versao; mudar o perfil sobe exatamente 1', async () => {
    const org = await criarOrg('nome');
    const u = await criarUsuario(org, 'SUPORTE', 'nome-a');

    await como(org, () => updateUser(u.id, { nome: 'Outro Nome' }));
    expect(await versaoDe(u.id)).toBe(0);

    await como(org, () => updateUser(u.id, { perfil: 'SUPERVISOR' }));
    expect(await versaoDe(u.id)).toBe(1);
  });
});

describe('isolamento por organizacao — filtro real da extensao', () => {
  it('o ultimo ADMIN de cada organizacao e protegido SO pelos ADMIN dela (rebaixar os dois ao mesmo tempo: ambos 409)', async () => {
    const orgA = await criarOrg('isoA');
    const orgB = await criarOrg('isoB');
    const adminA = await criarUsuario(orgA, 'ADMIN', 'unicoA');
    const adminB = await criarUsuario(orgB, 'ADMIN', 'unicoB');

    const r = await Promise.allSettled([
      como(orgA, () => updateUser(adminA.id, { perfil: 'SUPORTE' })),
      como(orgB, () => updateUser(adminB.id, { perfil: 'SUPORTE' })),
    ]);

    expect(r.map((x) => x.status)).toEqual(['rejected', 'rejected']);
    expect(await adminsAtivos(orgA)).toBe(1);
    expect(await adminsAtivos(orgB)).toBe(1);
  });

  it('usuario de OUTRA organizacao nao e alcancado: 404, e a versao dele nao muda', async () => {
    const orgA = await criarOrg('alcanceA');
    const orgB = await criarOrg('alcanceB');
    const emB = await criarUsuario(orgB, 'SUPORTE', 'em-b');

    await expect(como(orgA, () => updateUser(emB.id, { perfil: 'SUPERVISOR' }))).rejects.toMatchObject({ status: 404 });
    expect(await versaoDe(emB.id)).toBe(0);
    expect((await prismaSemIsolamento.user.findUniqueOrThrow({ where: { id: emB.id } })).perfil).toBe('SUPORTE');
  });

  it('mesmo e-mail em duas organizacoes: versoes independentes', async () => {
    const orgA = await criarOrg('emailA');
    const orgB = await criarOrg('emailB');
    const email = `repetido-${EXECUCAO}@x.teste`;
    const a = await criarUsuario(orgA, 'SUPORTE', 'rep-a', email);
    const b = await criarUsuario(orgB, 'SUPORTE', 'rep-b', email);

    await como(orgA, () => updateUser(a.id, { perfil: 'SUPERVISOR' }));

    expect(await versaoDe(a.id)).toBe(1);
    expect(await versaoDe(b.id)).toBe(0);
  });

  it('a consulta REAL de validarSessao respeita a organizacao do token', async () => {
    const orgA = await criarOrg('valA');
    const orgB = await criarOrg('valB');
    const u = await criarUsuario(orgA, 'SUPORTE', 'validado');

    await expect(validarSessao({ sub: u.id, org: orgA, sv: 0 })).resolves.toBeUndefined();
    // Mesmo id, organizacao errada no token: o filtro devolve nulo -> 401.
    invalidarSessaoLocal(orgB, u.id);
    await expect(validarSessao({ sub: u.id, org: orgB, sv: 0 })).rejects.toMatchObject({ status: 401 });
  });
});

describe('validarSessao contra o banco real, de ponta a ponta', () => {
  it('mudanca de perfil: token antigo (sv=0) cai na hora, o novo (sv=1) passa; token legado (sem sv) tambem cai', async () => {
    const org = await criarOrg('ponta');
    const u = await criarUsuario(org, 'SUPERVISOR', 'ponta-a-ponta');

    await expect(validarSessao({ sub: u.id, org, sv: 0 })).resolves.toBeUndefined();
    await expect(validarSessao({ sub: u.id, org })).resolves.toBeUndefined(); // legado = 0

    await como(org, () => updateUser(u.id, { perfil: 'SUPORTE' })); // sobe a versao e solta o cache local

    await expect(validarSessao({ sub: u.id, org, sv: 0 })).rejects.toMatchObject({ status: 401 });
    await expect(validarSessao({ sub: u.id, org })).rejects.toMatchObject({ status: 401 });
    await expect(validarSessao({ sub: u.id, org, sv: 1 })).resolves.toBeUndefined();
  });

  it('desativar e excluir: a sessao deixa de valer', async () => {
    const org = await criarOrg('desativa');
    const admin = await criarUsuario(org, 'ADMIN', 'admin-fica');
    const a = await criarUsuario(org, 'SUPORTE', 'sera-desativado');
    const b = await criarUsuario(org, 'SUPORTE', 'sera-excluido');
    expect(admin.id).toBeTruthy();

    await como(org, () => deactivateUser(a.id));
    await como(org, () => deleteUserPermanently(b.id));

    await expect(validarSessao({ sub: a.id, org, sv: 0 })).rejects.toMatchObject({ status: 401 });
    await expect(validarSessao({ sub: a.id, org, sv: 1 })).rejects.toMatchObject({ status: 401 }); // inativo
    await expect(validarSessao({ sub: b.id, org, sv: 0 })).rejects.toMatchObject({ status: 401 });
  });
});

// Evita aviso de import nao usado em ambientes que nao fazem tree-shaking de tipos.
void prisma;
