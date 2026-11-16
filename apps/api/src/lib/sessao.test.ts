import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./prisma', () => ({ prisma: {} }));

import { criarValidadorDeSessao, TTL_PADRAO_MS, type Consulta, type EstadoSessao } from './sessao';

/*
 * Validacao de sessao por versao (`sv`). O banco e um Map em memoria — nenhuma
 * conexao —, e o relogio e injetado, entao o TTL do cache e testado sem esperar.
 *
 * O que estes testes provam: a LOGICA (versao, legado, cache, invalidacao,
 * coalescencia, falha -> 503). Nao provam latencia nem comportamento do Postgres.
 */

const banco = new Map<string, EstadoSessao>();
const chave = (org: string, id: string) => `${org}:${id}`;
let consultas: Array<[string, string]> = [];
let agora = 1_000_000;
let falhar: Error | null = null;
let atraso: Promise<void> | null = null;

/** Consulta ao banco simulado; cada instancia da API compartilha o MESMO banco. */
const consultar: Consulta = async (org, id) => {
  consultas.push([org, id]);
  // Organizacao cruzada: o filtro da extensao devolve nulo para usuario de outra org.
  // A leitura acontece ANTES da espera: uma consulta lenta devolve o estado de
  // quando comecou, mesmo que o banco mude enquanto ela voa (e o que o banco faz).
  const lido = banco.get(chave(org, id)) ?? null;
  if (atraso) await atraso;
  if (falhar) throw falhar;
  return lido;
};

const novaInstancia = (extra: object = {}) => criarValidadorDeSessao({ consultar, agora: () => agora, ...extra });
const cred = (sv: number | undefined, org = 'org-a', sub = 'u1') => ({ sub, org, ...(sv === undefined ? {} : { sv }) });

beforeEach(() => {
  banco.clear();
  consultas = [];
  agora = 1_000_000;
  falhar = null;
  atraso = null;
  banco.set(chave('org-a', 'u1'), { versao: 0, ativo: true });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('versao da sessao', () => {
  it('aceita quando a versao do token e a do banco', async () => {
    banco.set(chave('org-a', 'u1'), { versao: 3, ativo: true });
    await expect(novaInstancia().validar(cred(3))).resolves.toBeUndefined();
  });

  it('recusa (401) token de versao anterior — perfil/senha mudaram', async () => {
    banco.set(chave('org-a', 'u1'), { versao: 4, ativo: true });
    await expect(novaInstancia().validar(cred(3))).rejects.toMatchObject({ status: 401 });
  });

  it('recusa conta desativada mesmo com a versao igual', async () => {
    banco.set(chave('org-a', 'u1'), { versao: 0, ativo: false });
    await expect(novaInstancia().validar(cred(0))).rejects.toMatchObject({ status: 401 });
  });

  it('recusa pessoa removida (401)', async () => {
    await expect(novaInstancia().validar(cred(0, 'org-a', 'removido'))).rejects.toMatchObject({ status: 401 });
  });
});

describe('token legado, sem sv', () => {
  it('vale como versao 0: aceito enquanto a pessoa nunca teve sessao revogada', async () => {
    await expect(novaInstancia().validar(cred(undefined))).resolves.toBeUndefined();
  });

  it('deixa de valer na primeira revogacao (versao >= 1) — nao e um coringa permanente', async () => {
    banco.set(chave('org-a', 'u1'), { versao: 1, ativo: true });
    await expect(novaInstancia().validar(cred(undefined))).rejects.toMatchObject({ status: 401 });
  });

  it('um token novo (sv=1) vale depois da revogacao, o legado nao', async () => {
    banco.set(chave('org-a', 'u1'), { versao: 1, ativo: true });
    const v = novaInstancia();
    await expect(v.validar(cred(1))).resolves.toBeUndefined();
    await expect(v.validar(cred(undefined))).rejects.toMatchObject({ status: 401 });
  });

  it('sv=0 explicito e igual ao legado', async () => {
    await expect(novaInstancia().validar(cred(0))).resolves.toBeUndefined();
  });
});

describe('isolamento entre organizacoes', () => {
  it('o mesmo id em outra organizacao nao e aceito (o filtro devolve nulo)', async () => {
    await expect(novaInstancia().validar(cred(0, 'org-b', 'u1'))).rejects.toMatchObject({ status: 401 });
  });

  it('cache e por organizacao: aceitar em org-a nao autoriza o mesmo id em org-b', async () => {
    const v = novaInstancia();
    await v.validar(cred(0, 'org-a', 'u1'));
    await expect(v.validar(cred(0, 'org-b', 'u1'))).rejects.toMatchObject({ status: 401 });
    expect(consultas).toEqual([
      ['org-a', 'u1'],
      ['org-b', 'u1'],
    ]);
  });

  it('revogar na org-a nao invalida o cache da org-b', async () => {
    banco.set(chave('org-b', 'u1'), { versao: 0, ativo: true });
    const v = novaInstancia();
    await v.validar(cred(0, 'org-a'));
    await v.validar(cred(0, 'org-b'));
    consultas = [];

    v.invalidar('org-a', 'u1');
    await v.validar(cred(0, 'org-b'));
    expect(consultas).toEqual([]);
  });
});

describe('cache', () => {
  it('a segunda validacao dentro do TTL nao consulta o banco', async () => {
    const v = novaInstancia();
    await v.validar(cred(0));
    await v.validar(cred(0));
    expect(consultas).toHaveLength(1);
  });

  it('o TTL maximo e de 5 segundos', () => {
    expect(TTL_PADRAO_MS).toBeLessThanOrEqual(5_000);
  });

  it('depois do TTL consulta de novo e enxerga a versao nova', async () => {
    const v = novaInstancia();
    await v.validar(cred(0));
    banco.set(chave('org-a', 'u1'), { versao: 1, ativo: true });

    agora += TTL_PADRAO_MS + 1;
    await expect(v.validar(cred(0))).rejects.toMatchObject({ status: 401 });
    expect(consultas).toHaveLength(2);
  });

  it('INVALIDACAO LOCAL IMEDIATA: depois de invalidar, a proxima validacao ja ve a mudanca, sem esperar o TTL', async () => {
    const v = novaInstancia();
    await v.validar(cred(0));
    banco.set(chave('org-a', 'u1'), { versao: 1, ativo: true });

    // Sem invalidar, o cache ainda aceitaria (esta e a janela):
    await expect(v.validar(cred(0))).resolves.toBeUndefined();

    v.invalidar('org-a', 'u1');
    await expect(v.validar(cred(0))).rejects.toMatchObject({ status: 401 });
  });

  it('muitas requisicoes simultaneas da mesma pessoa fazem UMA consulta', async () => {
    let liberar!: () => void;
    atraso = new Promise<void>((r) => (liberar = r));
    const v = novaInstancia();

    const todas = Promise.all(Array.from({ length: 50 }, () => v.validar(cred(0))));
    liberar();
    await todas;
    expect(consultas).toHaveLength(1);
  });

  it('invalidar enquanto uma consulta voa descarta o resultado dela (nao reabre a janela)', async () => {
    let liberar!: () => void;
    atraso = new Promise<void>((r) => (liberar = r));
    const v = novaInstancia();

    const emVoo = v.validar(cred(0)); // le versao 0 e fica esperando
    v.invalidar('org-a', 'u1'); // a revogacao chega enquanto isso
    banco.set(chave('org-a', 'u1'), { versao: 1, ativo: true });
    liberar();
    await emVoo.catch(() => undefined);
    atraso = null;

    // O resultado antigo (versao 0) NAO pode ter sido guardado:
    await expect(v.validar(cred(0))).rejects.toMatchObject({ status: 401 });
  });

  it('o cache tem limite de entradas', async () => {
    const v = novaInstancia();
    for (let i = 0; i < 10_050; i++) {
      banco.set(chave('org-a', `u${i}`), { versao: 0, ativo: true });
      await v.validar(cred(0, 'org-a', `u${i}`));
    }
    expect(v.tamanho()).toBeLessThanOrEqual(10_000);
  });
});

describe('duas instancias da API (cache independente, banco compartilhado)', () => {
  it('a instancia que revoga ve na hora; a outra aceita ate o TTL e depois converge', async () => {
    const a = novaInstancia();
    const b = novaInstancia();
    await a.validar(cred(0));
    await b.validar(cred(0));

    // Revogacao executada na instancia A: grava no banco e invalida o cache dela.
    banco.set(chave('org-a', 'u1'), { versao: 1, ativo: true });
    a.invalidar('org-a', 'u1');

    await expect(a.validar(cred(0))).rejects.toMatchObject({ status: 401 }); // imediato
    // JANELA RESIDUAL: B nao foi avisada e ainda aceita o token antigo.
    await expect(b.validar(cred(0))).resolves.toBeUndefined();

    agora += TTL_PADRAO_MS - 1; // ainda dentro do TTL
    await expect(b.validar(cred(0))).resolves.toBeUndefined();

    agora += 2; // TTL vencido
    await expect(b.validar(cred(0))).rejects.toMatchObject({ status: 401 }); // convergiu
  });

  it('a janela residual nunca passa de TTL_PADRAO_MS', async () => {
    const b = novaInstancia();
    await b.validar(cred(0));
    banco.set(chave('org-a', 'u1'), { versao: 1, ativo: true });

    agora += TTL_PADRAO_MS; // exatamente o TTL: ja expirou (`ate > agora` e falso)
    await expect(b.validar(cred(0))).rejects.toMatchObject({ status: 401 });
  });
});

describe('falha do banco: fail-closed com 503, nunca 401', () => {
  it('erro de conexao vira 503 SESSAO_INDISPONIVEL', async () => {
    falhar = new Error('connection terminated');
    await expect(novaInstancia().validar(cred(0))).rejects.toMatchObject({
      status: 503,
      code: 'SESSAO_INDISPONIVEL',
    });
  });

  it('falha NAO vira "credencial invalida": o status nunca e 401', async () => {
    falhar = new Error('too many connections');
    const erro = await novaInstancia()
      .validar(cred(0))
      .catch((e) => e);
    expect(erro.status).not.toBe(401);
  });

  it('timeout da consulta vira 503', async () => {
    atraso = new Promise<void>(() => undefined); // nunca resolve
    const v = novaInstancia({ timeoutMs: 20 });
    await expect(v.validar(cred(0))).rejects.toMatchObject({ status: 503 });
  });

  it('falha nao fica no cache: a requisicao seguinte tenta de novo e passa', async () => {
    const v = novaInstancia();
    falhar = new Error('connection terminated');
    await expect(v.validar(cred(0))).rejects.toMatchObject({ status: 503 });

    falhar = null;
    await expect(v.validar(cred(0))).resolves.toBeUndefined();
    expect(consultas).toHaveLength(2);
  });

  it('uma falha nao derruba quem ja estava em cache dentro do TTL', async () => {
    const v = novaInstancia();
    await v.validar(cred(0));
    falhar = new Error('connection terminated');
    await expect(v.validar(cred(0))).resolves.toBeUndefined();
  });

  it('com o cache vencido e o banco fora, recusa (fail-closed): nao assume que a sessao continua boa', async () => {
    const v = novaInstancia();
    await v.validar(cred(0));
    agora += TTL_PADRAO_MS + 1;
    falhar = new Error('connection terminated');
    await expect(v.validar(cred(0))).rejects.toMatchObject({ status: 503 });
  });
});
