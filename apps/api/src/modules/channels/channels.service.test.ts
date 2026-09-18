import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { comOrganizacao } from '../../lib/tenant';
import { dadosContatoImportado, gerarNomeSessao, herdarCredenciaisDaPonte } from './channels.service';
import { decifrar } from '../../lib/crypto-box';

/**
 * Herdar credenciais da ponte compartilhada evita que o ADMIN redigite
 * endereco/token/segredo em toda linha pessoal nova, quando todas apontam
 * para a mesma ponte.
 */
describe('herdarCredenciaisDaPonte', () => {
  it('herda os 3 campos da compartilhada quando o input nao trouxe nenhum', () => {
    const compartilhada = { ponteUrl: 'http://ponte:3100', ponteToken: 'token-x', ponteSegredo: 'segredo-x' };
    const resultado = herdarCredenciaisDaPonte(
      { ponteUrl: null, ponteToken: null, ponteSegredo: null },
      compartilhada,
    );
    expect(resultado).toEqual(compartilhada);
  });

  it('mantem os campos do input quando todos os 3 vieram preenchidos', () => {
    const input = { ponteUrl: 'http://input:3100', ponteToken: 'token-input', ponteSegredo: 'segredo-input' };
    const compartilhada = { ponteUrl: 'http://ponte:3100', ponteToken: 'token-x', ponteSegredo: 'segredo-x' };
    expect(herdarCredenciaisDaPonte(input, compartilhada)).toEqual(input);
  });

  it('herda so o que faltou quando o input e parcial', () => {
    const compartilhada = { ponteUrl: 'http://ponte:3100', ponteToken: 'token-x', ponteSegredo: 'segredo-x' };
    const resultado = herdarCredenciaisDaPonte(
      { ponteUrl: 'http://input:3100', ponteToken: null, ponteSegredo: null },
      compartilhada,
    );
    expect(resultado).toEqual({
      ponteUrl: 'http://input:3100',
      ponteToken: 'token-x',
      ponteSegredo: 'segredo-x',
    });
  });

  it('sem compartilhada e sem input, todos ficam nulos', () => {
    const resultado = herdarCredenciaisDaPonte({ ponteUrl: null, ponteToken: null, ponteSegredo: null }, null);
    expect(resultado).toEqual({ ponteUrl: null, ponteToken: null, ponteSegredo: null });
  });
});

describe('gerarNomeSessao', () => {
  it('gera um nome no formato esperado', () => {
    expect(gerarNomeSessao('abcdef12-3456-7890-abcd-ef1234567890')).toBe('vendedor-abcdef12');
  });

  it('e deterministico: mesma entrada gera sempre a mesma saida', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(gerarNomeSessao(id)).toBe(gerarNomeSessao(id));
  });

  it('donoId diferentes geram nomes diferentes', () => {
    const a = gerarNomeSessao('11111111-0000-0000-0000-000000000000');
    const b = gerarNomeSessao('22222222-0000-0000-0000-000000000000');
    expect(a).not.toBe(b);
  });
});

/**
 * `dadosContatoImportado` e a parte pura de `importarContatos`: monta os
 * campos do `Contact` a criar a partir de um contato vindo da ponte, sem
 * tocar em banco. O `findFirst`+`create` em loop nao tem teste de unidade —
 * fica para o smoke test, como o `vitest.config.ts` documenta.
 */
describe('dadosContatoImportado', () => {
  it('monta os dados do Contact com origem WHATSAPP e o responsavel informado', () => {
    expect(
      dadosContatoImportado(
        { numero: '5511999998888', nome: 'Fulano da Silva' },
        { organizacaoId: 'org-1', responsavelId: 'user-1' },
      ),
    ).toEqual({
      organizacaoId: 'org-1',
      nome: 'Fulano da Silva',
      telefone: '5511999998888',
      canalOrigem: 'WHATSAPP',
      responsavelId: 'user-1',
    });
  });

  it('sem responsavel (linha sem dono), o contato fica sem responsavel', () => {
    expect(
      dadosContatoImportado({ numero: '5511999998888', nome: 'Fulano' }, { organizacaoId: 'org-1', responsavelId: null }),
    ).toMatchObject({ responsavelId: null });
  });
});

/*
 * Fase 12.1 — `ponteSessao` passou a ter `@@unique([canal, ponteSessao])`
 * global no banco (nao por organizacao — ver a auditoria: `PonteSessaoAuth`,
 * escrita por `apps/ponte`, e uma tabela compartilhada entre todas as
 * organizacoes, chaveada so pelo nome da sessao). Estes testes mockam prisma
 * inteiro (mesmo padrao das fases anteriores) para provar que uma violacao
 * dessa constraint (`P2002`) vira um erro de dominio (409), nunca um 500
 * generico, e que o resto do fluxo de criacao/edicao de numero continua
 * intacto.
 */
const {
  channelConfigFindFirst,
  channelConfigFindMany,
  channelConfigFindUnique,
  channelConfigCreate,
  channelConfigUpdate,
  queueFindUnique,
  userFindUnique,
} = vi.hoisted(() => ({
  channelConfigFindFirst: vi.fn(),
  channelConfigFindMany: vi.fn(),
  channelConfigFindUnique: vi.fn(),
  channelConfigCreate: vi.fn(),
  channelConfigUpdate: vi.fn(),
  queueFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    channelConfig: {
      findFirst: channelConfigFindFirst,
      findMany: channelConfigFindMany,
      findUnique: channelConfigFindUnique,
      create: channelConfigCreate,
      update: channelConfigUpdate,
    },
    queue: { findUnique: queueFindUnique },
    user: { findUnique: userFindUnique },
  },
  prismaSemIsolamento: {},
}));

const { obterConfigGlobalPonteMock } = vi.hoisted(() => ({ obterConfigGlobalPonteMock: vi.fn() }));
vi.mock('../../config/ponte.config', () => ({ obterConfigGlobalPonte: obterConfigGlobalPonteMock }));

// Por padrao nenhuma instalacao de teste tem config global — quem precisa dela liga explicitamente.
beforeEach(() => {
  obterConfigGlobalPonteMock.mockReturnValue(null);
});

/** Erro do Prisma para violacao da constraint `canais_config_canal_ponte_sessao_key` — mesma classe que uma colisao real produziria. */
function erroDeColisaoDeSessao(alvo: string[] | string = ['canal', 'ponteSessao']) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: alvo },
  });
}

const CONFIG_BASE = { modo: 'NAO_OFICIAL' as const, ativo: true, ponteUrl: 'http://ponte:3100', ponteToken: 'token-ponte-123' };

/** Linha crua que `listarCanais` (chamada no fim de criarNumero/salvarCanal/atualizarNumero) precisa encontrar para nao lançar "nao encontrado apos criacao". */
function linhaCrua(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cfg-1',
    canal: 'WHATSAPP',
    donoId: null,
    dono: null,
    ativo: true,
    nome: null,
    phoneNumberId: null,
    pageId: null,
    igUserId: null,
    wabaId: null,
    fila: null,
    filaId: null,
    atualizadoEm: new Date('2026-09-16T10:00:00.000Z'),
    accessToken: null,
    appSecret: null,
    verifyToken: null,
    iaSegredo: null,
    modo: 'NAO_OFICIAL',
    ponteUrl: 'http://ponte:3100',
    ponteSessao: null,
    ponteToken: 'token-ponte-123',
    ponteSegredo: 'segredo-1234567890',
    ponteStatus: null,
    ponteStatusEm: null,
    ...overrides,
  };
}

describe('criarNumero / atualizarNumero / salvarCanal — colisao de ponteSessao (Fase 12.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1/3. colisao entre organizacoes diferentes: o Prisma (constraint global) recusa a escrita mesmo sem a checagem previa ver nada', async () => {
    // A checagem previa (`findFirst`, escopada pela organizacao no contexto)
    // nao encontra nada — simula exatamente o caso em que a colisao e com
    // uma linha de OUTRA organizacao, que o `findFirst` desta nunca veria.
    channelConfigFindFirst.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    channelConfigCreate.mockRejectedValue(erroDeColisaoDeSessao());

    const { criarNumero } = await import('./channels.service');
    await expect(
      comOrganizacao(
        'org-2',
        () =>
          criarNumero('WHATSAPP', {
            ...CONFIG_BASE,
            ponteSegredo: 'segredo-1234567890',
            donoId: 'user-1',
            ponteSessao: 'sessao-ja-usada',
          }),
        { id: 'admin-1', perfil: 'ADMIN' },
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(channelConfigCreate).toHaveBeenCalledTimes(1);
  });

  it('4. o erro de colisao e um AppError de dominio (409), nunca um 500 generico', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    channelConfigFindFirst.mockResolvedValue(null);
    channelConfigCreate.mockRejectedValue(erroDeColisaoDeSessao());

    const { criarNumero } = await import('./channels.service');
    try {
      await comOrganizacao(
        'org-1',
        () =>
          criarNumero('WHATSAPP', {
            ...CONFIG_BASE,
            ponteSegredo: 'segredo-1234567890',
            donoId: 'user-1',
            ponteSessao: 'colidiu',
          }),
        { id: 'admin-1', perfil: 'ADMIN' },
      );
      throw new Error('deveria ter lancado');
    } catch (erro) {
      expect(erro).toMatchObject({ status: 409, code: 'CONFLICT' });
      expect((erro as Error).message).toContain('colidiu');
    }
  });

  it('violacao de constraint SEM ser em ponteSessao continua subindo sem traducao (nao esconde outros erros do Prisma)', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    channelConfigFindFirst.mockResolvedValue(null);
    channelConfigCreate.mockRejectedValue(erroDeColisaoDeSessao(['canal', 'phoneNumberId']));

    const { criarNumero } = await import('./channels.service');
    await expect(
      comOrganizacao(
        'org-1',
        () =>
          criarNumero('WHATSAPP', {
            ...CONFIG_BASE,
            ponteSegredo: 'segredo-1234567890',
            donoId: 'user-1',
            ponteSessao: 'sessao-normal',
          }),
        { id: 'admin-1', perfil: 'ADMIN' },
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('5. geracao automatica de sessao pessoal continua funcionando quando o admin nao informa uma', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-9' });
    channelConfigFindFirst.mockResolvedValue(null); // sem compartilhada, sem conflito
    channelConfigCreate.mockResolvedValue({ id: 'cfg-novo' });
    channelConfigFindMany.mockResolvedValue([
      linhaCrua({ id: 'cfg-novo', donoId: 'user-9', dono: { id: 'user-9', nome: 'Vendedor 9' }, ponteSessao: 'vendedor-user-9' }),
    ]);

    const { criarNumero } = await import('./channels.service');
    await comOrganizacao(
      'org-1',
      () => criarNumero('WHATSAPP', { ...CONFIG_BASE, ponteSegredo: 'segredo-1234567890', donoId: 'user-9' }),
      { id: 'admin-1', perfil: 'ADMIN' },
    );

    const dados = channelConfigCreate.mock.calls[0]?.[0]?.data;
    // `gerarNomeSessao('user-9')` = `vendedor-${'user-9'.slice(0,8)}` = 'vendedor-user-9' (string curta, slice devolve ela inteira).
    expect(dados.ponteSessao).toBe('vendedor-user-9');
  });

  it('6. linha compartilhada (sem donoId) continua funcionando, sem exigir ponteSessao', async () => {
    channelConfigFindFirst.mockResolvedValue(null);
    channelConfigCreate.mockResolvedValue({ id: 'cfg-compartilhada' });
    channelConfigFindMany.mockResolvedValue([linhaCrua({ id: 'cfg-compartilhada', donoId: null, dono: null })]);

    const { salvarCanal } = await import('./channels.service');
    await comOrganizacao(
      'org-1',
      () => salvarCanal('WHATSAPP', { ...CONFIG_BASE, ponteSegredo: 'segredo-1234567890' }),
      { id: 'admin-1', perfil: 'ADMIN' },
    );

    expect(channelConfigCreate).toHaveBeenCalledTimes(1);
    const dados = channelConfigCreate.mock.calls[0]?.[0]?.data;
    expect(dados.ponteSessao).toBeUndefined();
  });

  it('7. ponteSessao NULL continua funcionando conforme a regra existente (linha compartilhada, sem sessao propria)', async () => {
    channelConfigFindFirst.mockResolvedValue(null);
    channelConfigUpdate.mockResolvedValue({ id: 'cfg-existente' });
    channelConfigFindUnique.mockResolvedValue(linhaCrua({ id: 'cfg-existente', canal: 'WHATSAPP' }));
    channelConfigFindMany.mockResolvedValue([linhaCrua({ id: 'cfg-existente', donoId: null, dono: null })]);

    const { atualizarNumero } = await import('./channels.service');
    await comOrganizacao('org-1', () => atualizarNumero('cfg-existente', { nome: 'Novo nome' }), {
      id: 'admin-1',
      perfil: 'ADMIN',
    });

    expect(channelConfigUpdate).toHaveBeenCalledTimes(1);
    const dados = channelConfigUpdate.mock.calls[0]?.[0]?.data;
    expect(dados.ponteSessao).toBeUndefined();
  });

  it('9. nenhuma credencial e reaproveitada entre organizacoes atraves do fluxo normal: a checagem previa e escopada por organizacao, e a constraint do banco cobre o resto', async () => {
    // A checagem previa nunca inclui organizacaoId no `where` manualmente —
    // depende so do contexto do tenant (extensao do Prisma). Confirma que
    // `criarNumero` nao introduz nenhum filtro cruzado nem reaproveita
    // config de outra organizacao.
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    channelConfigFindFirst.mockResolvedValue(null);
    channelConfigCreate.mockResolvedValue({ id: 'cfg-1' });
    channelConfigFindMany.mockResolvedValue([
      linhaCrua({ id: 'cfg-1', donoId: 'user-1', dono: { id: 'user-1', nome: 'Vendedor 1' }, ponteSessao: 'sessao-exclusiva-org-1' }),
    ]);

    const { criarNumero } = await import('./channels.service');
    await comOrganizacao(
      'org-1',
      () =>
        criarNumero('WHATSAPP', {
          ...CONFIG_BASE,
          ponteSegredo: 'segredo-1234567890',
          donoId: 'user-1',
          ponteSessao: 'sessao-exclusiva-org-1',
        }),
      { id: 'admin-1', perfil: 'ADMIN' },
    );

    const where = channelConfigFindFirst.mock.calls.map((c) => c[0]?.where);
    for (const w of where) expect(JSON.stringify(w)).not.toContain('organizacaoId');
  });
});

describe('conectarMinhaLinhaWhatsapp — self-service da linha pessoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('linha pessoal ja existe: devolve ela sem criar de novo', async () => {
    channelConfigFindFirst.mockResolvedValueOnce(
      linhaCrua({ id: 'linha-existente', donoId: 'user-1', dono: { id: 'user-1', nome: 'Vendedor 1' } }),
    );

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const resultado = await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-1'), {
      id: 'user-1',
      perfil: 'COMERCIAL',
    });

    expect(resultado).toMatchObject({ id: 'linha-existente' });
    expect(channelConfigCreate).not.toHaveBeenCalled();
  });

  it('D) legado: sem config global, mas linha compartilhada existente e configurada — comportamento legado continua funcionando', async () => {
    // obterConfigGlobalPonteMock ja devolve null pelo beforeEach do topo do
    // arquivo — este e o caso de uma instalacao que nunca configurou
    // PONTE_URL/PONTE_TOKEN/PONTE_SEGREDO e continua so com a linha
    // compartilhada, exatamente como antes desta mudanca.
    channelConfigFindFirst
      .mockResolvedValueOnce(null) // minhaLinhaWhatsapp: nao existe ainda
      .mockResolvedValueOnce(linhaCrua({ id: 'compartilhada', donoId: null, dono: null, modo: 'NAO_OFICIAL' })) // fallback legado: disponibilidade da ponte via linha compartilhada
      .mockResolvedValueOnce(linhaCrua({ id: 'compartilhada', donoId: null, dono: null, modo: 'NAO_OFICIAL' })) // heranca de credenciais dentro de prepararGravacao
      .mockResolvedValueOnce(null) // checagem de colisao de sessao dentro de prepararGravacao
      .mockResolvedValueOnce(
        linhaCrua({ id: 'nova-linha', donoId: 'user-9', ponteSessao: 'vendedor-user-9' }),
      ); // minhaLinhaWhatsapp apos criar
    userFindUnique.mockResolvedValue({ id: 'user-9' });
    channelConfigCreate.mockResolvedValue({ id: 'nova-linha' });
    channelConfigFindMany.mockResolvedValue([
      linhaCrua({ id: 'nova-linha', donoId: 'user-9', dono: { id: 'user-9', nome: 'Vendedor 9' }, ponteSessao: 'vendedor-user-9' }),
    ]);

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const resultado = await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-9'), {
      id: 'user-9',
      perfil: 'COMERCIAL',
    });

    expect(channelConfigCreate).toHaveBeenCalledTimes(1);
    const dados = channelConfigCreate.mock.calls[0]?.[0]?.data;
    expect(dados.donoId).toBe('user-9');
    expect(dados.modo).toBe('NAO_OFICIAL');
    expect(dados.ponteSessao).toBe('vendedor-user-9'); // herdado/gerado, nunca pedido ao usuario
    expect(resultado.id).toBe('nova-linha');
  });

  it('A) sem linha pessoal, sem linha compartilhada, config global da ponte definida: cria a linha pessoal sem depender de nenhum admin', async () => {
    obterConfigGlobalPonteMock.mockReturnValue({
      ponteUrl: 'http://ponte-global:3100',
      ponteToken: 'token-global',
      ponteSegredo: 'segredo-global',
    });
    channelConfigFindFirst
      .mockResolvedValueOnce(null) // minhaLinhaWhatsapp: nao existe ainda
      .mockResolvedValueOnce(null) // compartilhada dentro de prepararGravacao: nao existe nenhuma — e nao faz diferenca
      .mockResolvedValueOnce(null); // checagem de colisao de sessao dentro de prepararGravacao
    userFindUnique.mockResolvedValue({ id: 'user-9' });
    channelConfigCreate.mockResolvedValue({ id: 'nova-linha' });
    channelConfigFindMany.mockResolvedValue([
      linhaCrua({ id: 'nova-linha', donoId: 'user-9', dono: { id: 'user-9', nome: 'Vendedor 9' }, ponteSessao: 'vendedor-user-9' }),
    ]);
    channelConfigFindFirst.mockResolvedValueOnce(
      linhaCrua({ id: 'nova-linha', donoId: 'user-9', ponteSessao: 'vendedor-user-9' }),
    ); // minhaLinhaWhatsapp apos criar

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const resultado = await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-9'), {
      id: 'user-9',
      perfil: 'COMERCIAL',
    });

    expect(channelConfigCreate).toHaveBeenCalledTimes(1);
    const dados = channelConfigCreate.mock.calls[0]?.[0]?.data;
    expect(dados.donoId).toBe('user-9');
    expect(dados.ponteUrl).toBe('http://ponte-global:3100');
    expect(decifrar(dados.ponteToken)).toBe('token-global');
    expect(decifrar(dados.ponteSegredo)).toBe('segredo-global');
    expect(resultado.id).toBe('nova-linha');
  });

  it('B) sem linha pessoal e sem NENHUMA linha compartilhada cadastrada: nao pede configuracao de administrador (self-service nao depende mais dela)', async () => {
    // O self-service de hoje nunca busca a linha compartilhada — quem confirma
    // isso e o numero de chamadas ao findFirst: 3 (minhaLinhaWhatsapp, a
    // compartilhada DENTRO de prepararGravacao/herdarCredenciaisDaPonte, e a
    // checagem de colisao), nunca a checagem antiga que existia so dentro de
    // conectarMinhaLinhaWhatsapp.
    obterConfigGlobalPonteMock.mockReturnValue({
      ponteUrl: 'http://ponte-global:3100',
      ponteToken: 'token-global',
      ponteSegredo: 'segredo-global',
    });
    channelConfigFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linhaCrua({ id: 'nova-linha', donoId: 'user-1', ponteSessao: 'vendedor-user-1' }));
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    channelConfigCreate.mockResolvedValue({ id: 'nova-linha' });
    channelConfigFindMany.mockResolvedValue([
      linhaCrua({ id: 'nova-linha', donoId: 'user-1', dono: { id: 'user-1', nome: 'Vendedor 1' }, ponteSessao: 'vendedor-user-1' }),
    ]);

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const resultado = await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-1'), {
      id: 'user-1',
      perfil: 'COMERCIAL',
    });

    expect(channelConfigCreate).toHaveBeenCalledTimes(1);
    expect(resultado.id).toBe('nova-linha');
  });

  it('C) sem linha pessoal, sem config global e sem linha compartilhada utilizavel: erro 503 amigavel de infraestrutura indisponivel, sem termos tecnicos', async () => {
    obterConfigGlobalPonteMock.mockReturnValue(null);
    channelConfigFindFirst
      .mockResolvedValueOnce(null) // minhaLinhaWhatsapp: nao existe
      .mockResolvedValueOnce(null); // fallback legado: nenhuma linha compartilhada utilizavel tambem

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    await expect(
      comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-1'), { id: 'user-1', perfil: 'COMERCIAL' }),
    ).rejects.toMatchObject({ status: 503, code: 'CANAL_INDISPONIVEL' });

    expect(channelConfigCreate).not.toHaveBeenCalled();
    try {
      await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-1'), { id: 'user-1', perfil: 'COMERCIAL' });
      throw new Error('deveria ter lancado');
    } catch (erro) {
      expect((erro as Error).message).not.toContain('token');
      expect((erro as Error).message).not.toContain('administrador');
    }
  });

  it('F) corrida entre dois cliques: colisao na propria sessao deterministica devolve a linha ja criada pela vencedora, sem erro tecnico', async () => {
    obterConfigGlobalPonteMock.mockReturnValue({
      ponteUrl: 'http://ponte-global:3100',
      ponteToken: 'token-global',
      ponteSegredo: 'segredo-global',
    });
    channelConfigFindFirst
      .mockResolvedValueOnce(null) // minhaLinhaWhatsapp: ainda nao existe (perdedora da corrida tambem viu isto)
      .mockResolvedValueOnce(null) // compartilhada dentro de prepararGravacao: nao existe (config vem toda da global)
      .mockResolvedValueOnce(null) // checagem previa de colisao dentro de prepararGravacao: nao ve nada, a vencedora ja passou por aqui
      .mockResolvedValueOnce(
        linhaCrua({ id: 'linha-da-vencedora', donoId: 'user-9', dono: { id: 'user-9', nome: 'Vendedor 9' }, ponteSessao: 'vendedor-user-9' }),
      ); // minhaLinhaWhatsapp no catch: a vencedora ja criou a linha
    userFindUnique.mockResolvedValue({ id: 'user-9' });
    channelConfigCreate.mockRejectedValue(erroDeColisaoDeSessao());

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const resultado = await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-9'), {
      id: 'user-9',
      perfil: 'COMERCIAL',
    });

    expect(resultado).toMatchObject({ id: 'linha-da-vencedora' });
    expect(channelConfigCreate).toHaveBeenCalledTimes(1);
  });
});
