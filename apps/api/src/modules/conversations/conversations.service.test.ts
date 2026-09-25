import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decidirDestino } from '../channels/inbound.service';
import { comOrganizacao } from '../../lib/tenant';
import {
  arquivarConversa,
  contarPorStatus,
  desarquivarConversa,
  enviarMensagem,
  finalizarConversa,
  iniciarConversa,
  listarConversas,
  motivoSemTelefone,
  type Solicitante,
} from './conversations.service';

/**
 * `iniciarConversa` (vendedor abre uma conversa de WhatsApp com um Contato que
 * nunca escreveu) reaproveita a mesma decisao fila-vs-dono de
 * `destinoDaMensagem`, extraida em `decidirDestino` para ser testavel sem
 * banco. Estes testes cobrem so a parte pura — a parte com Prisma real (buscar
 * contato, checar conversa aberta, criar) fica coberta pelo smoke test.
 */
describe('motivoSemTelefone', () => {
  it('recusa contato sem telefone', () => {
    expect(motivoSemTelefone({ telefone: null })).toMatch(/telefone/i);
  });

  it('recusa contato com telefone vazio', () => {
    expect(motivoSemTelefone({ telefone: '' })).toMatch(/telefone/i);
  });

  it('aceita contato com telefone preenchido', () => {
    expect(motivoSemTelefone({ telefone: '5511999998888' })).toBeNull();
  });
});

describe('decidirDestino', () => {
  it('config com donoId (linha pessoal) decide agenteId, sem fila', () => {
    const config = { id: 'config-1', donoId: 'user-1', filaId: null };
    expect(decidirDestino(config)).toEqual({ canalConfigId: 'config-1', filaId: null, agenteId: 'user-1' });
  });

  it('config sem dono (compartilhada) com fila decide filaId, sem agente', () => {
    const config = { id: 'config-2', donoId: null, filaId: 'fila-1' };
    expect(decidirDestino(config)).toEqual({ canalConfigId: 'config-2', filaId: 'fila-1', agenteId: null });
  });

  it('sem config nenhuma, nao decide nem fila nem agente', () => {
    expect(decidirDestino(null)).toEqual({ canalConfigId: null, filaId: null, agenteId: null });
  });
});

/*
 * Fase 11.2 — `iniciarConversa` cria a Conversation mas, ate aqui, nunca
 * publicava evento nenhum de socket (bug encontrado na Fase 11.1: so
 * `inbound.service.ts` chamava `notificarConversaNova`). Estes testes cobrem
 * so a publicacao em tempo real — a decisao de fila-vs-dono ja esta coberta
 * acima (`decidirDestino`) e nao muda aqui.
 *
 * Mocka prisma (sem banco real), o canal (sem Graph API/ponte real) e o hub de
 * realtime (sem Socket.IO real) — mesmo padrao de
 * `inbound.service.dedup.test.ts`. Usa o contexto de tenant REAL
 * (`comOrganizacao`) em vez de mockar `lib/politicas`/`lib/visibilidade`: essas
 * duas camadas de isolamento sao justamente o que os testes 4 e 5 precisam
 * observar de verdade.
 */
const {
  contactFindFirst,
  conversationFindFirst,
  conversationFindMany,
  conversationCreate,
  conversationUpdate,
  conversationGroupBy,
  channelConfigFindFirst,
  queueAgentFindMany,
  messageCreate,
} = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationFindMany: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationGroupBy: vi.fn(),
  channelConfigFindFirst: vi.fn(),
  queueAgentFindMany: vi.fn(),
  messageCreate: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    contact: { findFirst: contactFindFirst },
    conversation: {
      findFirst: conversationFindFirst,
      findMany: conversationFindMany,
      create: conversationCreate,
      update: conversationUpdate,
      groupBy: conversationGroupBy,
    },
    channelConfig: { findFirst: channelConfigFindFirst },
    queueAgent: { findMany: queueAgentFindMany },
    message: { create: messageCreate },
  },
}));

// `finalizarConversa` toca pesquisa de satisfacao e a fila de reenvio — nao e
// o que a Fase 11.9-B observa (so que finalizar continua alheio a `arquivada`),
// entao ficam mockadas para isolar o teste sem precisar simular o fluxo inteiro.
const { criarPesquisa, entregarPesquisa } = vi.hoisted(() => ({
  criarPesquisa: vi.fn().mockResolvedValue(undefined),
  entregarPesquisa: vi.fn().mockResolvedValue({ entregue: true }),
}));
vi.mock('../surveys/surveys.service', () => ({
  TIPO_CONVITE_PESQUISA: 'pesquisa:convite',
  criarPesquisa,
  entregarPesquisa,
}));
vi.mock('../../lib/fila', () => ({ enfileirar: vi.fn() }));

const { obterConfig } = vi.hoisted(() => ({ obterConfig: vi.fn() }));
vi.mock('../channels/channels.service', () => ({ obterConfig }));

const { promoverPrevia } = vi.hoisted(() => ({ promoverPrevia: vi.fn() }));
vi.mock('../channels/chat-previews.service', () => ({ promoverPrevia }));

// `enviarMensagem` fala com o canal externo por aqui — mockado para os testes
// de nota interna nao dependerem da Graph API/ponte real (mesmo padrao dos
// mocks acima).
const { enviarParaCanal, enviarArquivoParaCanal, exigeEnvioExterno } = vi.hoisted(() => ({
  enviarParaCanal: vi.fn(),
  enviarArquivoParaCanal: vi.fn(),
  exigeEnvioExterno: vi.fn(),
}));
vi.mock('../channels/outbound.service', () => ({ enviarParaCanal, enviarArquivoParaCanal, exigeEnvioExterno }));

const { entregarParaIa } = vi.hoisted(() => ({ entregarParaIa: vi.fn() }));
vi.mock('../bots/ia.service', () => ({ entregarParaIa }));

const { notificarConversaNova, notificarConversaAtualizada, notificarMensagem } = vi.hoisted(() => ({
  notificarConversaNova: vi.fn(),
  notificarConversaAtualizada: vi.fn(),
  notificarMensagem: vi.fn(),
}));
vi.mock('../../realtime/hub', () => ({ notificarConversaNova, notificarConversaAtualizada, notificarMensagem }));

// Serializer identidade: o que este teste observa e SE/COM QUE DESTINOS o
// evento sai, nao o formato exato do payload (ja coberto onde o serializer e
// testado). `toConversaDetalhe` passa o registro adiante como veio.
vi.mock('./conversations.serializer', () => ({
  toConversaDetalhe: (c: unknown) => c,
  toConversaResumo: (c: unknown) => c,
  toMensagem: (m: unknown) => m,
  inclusaoDetalhe: {},
  inclusaoResumo: {},
}));

const SOLICITANTE: Solicitante = { sub: 'user-1', perfil: 'ADMIN', nome: 'Admin Teste' };

/** Config OFICIAL minimamente valida para `impedimentoDeEnvio` (real, pura) devolver nulo. */
const CONFIG_OFICIAL_BASE = {
  modo: 'OFICIAL' as const,
  ativo: true,
  accessToken: 'token-fake',
  phoneNumberId: '55500000000',
  ponteUrl: null,
  ponteToken: null,
};

describe('iniciarConversa — publicacao em tempo real (Fase 11.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. cria a Conversation e publica notificarConversaNova (nao fica muda)', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contato-1', telefone: '5511999998888' });
    conversationFindFirst
      .mockResolvedValueOnce(null) // nao ha conversa aberta ainda
      .mockResolvedValueOnce({ id: 'conv-1', fila: null, agente: { id: 'user-1' } }); // carregarOuFalhar em publicarNova
    channelConfigFindFirst.mockResolvedValue({ id: 'cfg-pessoal', donoId: 'user-1', filaId: null, ...CONFIG_OFICIAL_BASE });
    conversationCreate.mockResolvedValue({ id: 'conv-1' });

    const resultado = await comOrganizacao('org-1', () => iniciarConversa(SOLICITANTE, 'contato-1'), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    expect(resultado).toEqual({ id: 'conv-1' });
    expect(notificarConversaNova).toHaveBeenCalledTimes(1);
    expect(notificarConversaAtualizada).not.toHaveBeenCalled();
  });

  it('2. conversa nova em fila compartilhada notifica pela fila, sem agente', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contato-2', telefone: '5511988887777' });
    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'conv-2', fila: { id: 'fila-x' }, agente: null });
    // Sem linha pessoal: configWhatsappDoSolicitante cai no canal compartilhado.
    channelConfigFindFirst.mockResolvedValue(null);
    obterConfig.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-x', ...CONFIG_OFICIAL_BASE });
    conversationCreate.mockResolvedValue({ id: 'conv-2' });

    await comOrganizacao('org-1', () => iniciarConversa(SOLICITANTE, 'contato-2'), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    expect(notificarConversaNova).toHaveBeenCalledTimes(1);
    const destinos = notificarConversaNova.mock.calls[0]?.[1];
    expect(destinos).toMatchObject({ conversaId: 'conv-2', filaId: 'fila-x', agenteId: undefined });
  });

  it('3. conversa pessoal notifica o dono correto (agenteId = dono da linha)', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contato-3', telefone: '5511977776666' });
    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'conv-3', fila: null, agente: { id: 'user-1' } });
    channelConfigFindFirst.mockResolvedValue({ id: 'cfg-pessoal', donoId: 'user-1', filaId: null, ...CONFIG_OFICIAL_BASE });
    conversationCreate.mockResolvedValue({ id: 'conv-3' });

    await comOrganizacao('org-1', () => iniciarConversa(SOLICITANTE, 'contato-3'), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    expect(notificarConversaNova).toHaveBeenCalledTimes(1);
    const [detalhe, destinos] = notificarConversaNova.mock.calls[0] ?? [];
    expect(destinos).toMatchObject({ conversaId: 'conv-3', agenteId: 'user-1' });
    expect((destinos as { filaId?: unknown })?.filaId).toBeUndefined();
    expect(detalhe).toEqual({ id: 'conv-3', fila: null, agente: { id: 'user-1' } });
  });

  it('reaproveita conversa ja aberta (idempotente) e NAO publica de novo', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contato-4', telefone: '5511966665555' });
    conversationFindFirst.mockResolvedValueOnce({ id: 'conv-existente' });

    const resultado = await comOrganizacao('org-1', () => iniciarConversa(SOLICITANTE, 'contato-4'), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    expect(resultado).toEqual({ id: 'conv-existente' });
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(notificarConversaNova).not.toHaveBeenCalled();
  });

  it('reaproveita conversa ARQUIVADA: desarquiva e publica conversa:atualizada (Fase 11.9-B)', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contato-5', telefone: '5511955554444' });
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-arquivada', filaId: 'fila-y', arquivada: true })
      .mockResolvedValueOnce({ id: 'conv-arquivada', fila: { id: 'fila-y' }, agente: null, arquivada: false });

    const resultado = await comOrganizacao('org-1', () => iniciarConversa(SOLICITANTE, 'contato-5'), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    expect(resultado).toEqual({ id: 'conv-arquivada' });
    expect(conversationUpdate).toHaveBeenCalledWith({ where: { id: 'conv-arquivada' }, data: { arquivada: false } });
    expect(conversationCreate).not.toHaveBeenCalled();
    // Reaproveitada (ja existia), nao criada: notifica por `conversa:atualizada`, nunca `conversa:nova`.
    expect(notificarConversaAtualizada).toHaveBeenCalledTimes(1);
    expect(notificarConversaNova).not.toHaveBeenCalled();
  });

  it('reaproveita conversa NAO arquivada: nenhum update, nenhuma notificacao (comportamento identico a antes da Fase 11.9)', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contato-6', telefone: '5511944443333' });
    conversationFindFirst.mockResolvedValueOnce({ id: 'conv-normal', filaId: 'fila-z', arquivada: false });

    await comOrganizacao('org-1', () => iniciarConversa(SOLICITANTE, 'contato-6'), { id: 'user-1', perfil: 'ADMIN' });

    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(notificarConversaAtualizada).not.toHaveBeenCalled();
  });
});

/*
 * Fase 11.9-B — arquivar/desarquivar. Mesmo padrao de mocks dos blocos
 * acima: prisma e hub mockados, contexto de tenant REAL via `comOrganizacao`.
 */
describe('arquivarConversa / desarquivarConversa (Fase 11.9-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('arquivar: grava arquivada=true e publica conversa:atualizada', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-1', filaId: 'fila-1', arquivada: false })
      .mockResolvedValueOnce({ id: 'conv-1', fila: { id: 'fila-1' }, agente: null, arquivada: true });

    const resultado = await comOrganizacao('org-1', () => arquivarConversa(SOLICITANTE, 'conv-1'), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    expect(conversationUpdate).toHaveBeenCalledWith({ where: { id: 'conv-1' }, data: { arquivada: true } });
    expect(notificarConversaAtualizada).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ arquivada: true });
  });

  it('desarquivar: grava arquivada=false e publica conversa:atualizada', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-2', filaId: 'fila-1', arquivada: true })
      .mockResolvedValueOnce({ id: 'conv-2', fila: { id: 'fila-1' }, agente: null, arquivada: false });

    await comOrganizacao('org-1', () => desarquivarConversa(SOLICITANTE, 'conv-2'), { id: 'user-1', perfil: 'ADMIN' });

    expect(conversationUpdate).toHaveBeenCalledWith({ where: { id: 'conv-2' }, data: { arquivada: false } });
  });

  it('arquivar uma ja arquivada: nao escreve nem notifica de novo (mesmo padrao de definirTags)', async () => {
    conversationFindFirst.mockResolvedValueOnce({ id: 'conv-3', filaId: 'fila-1', arquivada: true });

    await comOrganizacao('org-1', () => arquivarConversa(SOLICITANTE, 'conv-3'), { id: 'user-1', perfil: 'ADMIN' });

    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(notificarConversaAtualizada).not.toHaveBeenCalled();
  });

  it('desarquivar uma ja nao-arquivada: nao escreve nem notifica de novo', async () => {
    conversationFindFirst.mockResolvedValueOnce({ id: 'conv-4', filaId: 'fila-1', arquivada: false });

    await comOrganizacao('org-1', () => desarquivarConversa(SOLICITANTE, 'conv-4'), { id: 'user-1', perfil: 'ADMIN' });

    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(notificarConversaAtualizada).not.toHaveBeenCalled();
  });

  it('funciona em conversa FINALIZADA: arquivar nao exige status especifico (ortogonal ao ciclo de vida)', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-5', filaId: null, arquivada: false, status: 'FINALIZADO' })
      .mockResolvedValueOnce({ id: 'conv-5', fila: null, agente: null, arquivada: true, status: 'FINALIZADO' });

    await comOrganizacao('org-1', () => arquivarConversa(SOLICITANTE, 'conv-5'), { id: 'user-1', perfil: 'ADMIN' });

    expect(conversationUpdate).toHaveBeenCalledWith({ where: { id: 'conv-5' }, data: { arquivada: true } });
  });

  it('permissoes: AGENTE (perfil sem privilegio de gestao) consegue arquivar uma conversa dentro do proprio escopo, sem checagem de perfil adicional', async () => {
    // contextoVisibilidade para perfil nao-veTudo consulta queueAgent — sem
    // filas vinculadas, o que nao afeta este teste (o filtro so entra no
    // WHERE, que aqui e mockado).
    queueAgentFindMany.mockResolvedValue([]);
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-6', filaId: null, agenteId: 'agente-1', arquivada: false })
      .mockResolvedValueOnce({ id: 'conv-6', fila: null, agente: { id: 'agente-1' }, arquivada: true });

    const solicitanteAgente: Solicitante = { sub: 'agente-1', perfil: 'AGENTE', nome: 'Agente Teste' };
    await expect(
      comOrganizacao('org-1', () => arquivarConversa(solicitanteAgente, 'conv-6'), {
        id: 'agente-1',
        perfil: 'AGENTE',
      }),
    ).resolves.toBeDefined();

    // A politica de visibilidade (nao um `requireRole`) e quem decide: o
    // where usado para carregar a conversa inclui `agenteId: ctx.usuarioId`
    // -- exatamente a mesma regra de `definirTags`/`assumirConversa`, sem
    // excecao nova para arquivar.
    const where = conversationFindFirst.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).toContain('agente-1');
  });

  it('isolamento entre organizacoes: nenhuma query de arquivar/desarquivar passa organizacaoId manualmente — a fronteira e so o contexto do tenant', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-7', filaId: null, arquivada: false })
      .mockResolvedValueOnce({ id: 'conv-7', fila: null, agente: null, arquivada: true });

    await comOrganizacao('org-A', () => arquivarConversa(SOLICITANTE, 'conv-7'), { id: 'user-1', perfil: 'ADMIN' });

    const where = conversationFindFirst.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).not.toContain('organizacaoId');
    // A garantia de organizacao vem da extensao do Prisma (ver prisma.test.ts),
    // nunca de um filtro escrito a mao no service — reforcado aqui so para
    // documentar que `arquivarConversa` nao introduziu um atalho manual.
  });
});

/*
 * Fase 11.9-B — filtros de listagem e contadores excluem arquivadas por
 * padrao (auditoria 11.9-A, itens 5 e 8), sem tocar a mecanica de cursor.
 */
describe('listarConversas / contarPorStatus — exclusao de arquivadas (Fase 11.9-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationFindMany.mockResolvedValue([]);
    conversationGroupBy.mockResolvedValue([]);
  });

  it('sem `arquivadas` na query: filtra arquivada=false', async () => {
    await comOrganizacao('org-1', () => listarConversas(SOLICITANTE, { limite: 50, tags: [] }), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    const where = conversationFindMany.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).toContain('"arquivada":false');
  });

  it('arquivadas=true: filtra arquivada=true (visao de arquivadas, nunca as duas juntas)', async () => {
    await comOrganizacao(
      'org-1',
      () => listarConversas(SOLICITANTE, { limite: 50, tags: [], arquivadas: 'true' }),
      { id: 'user-1', perfil: 'ADMIN' },
    );

    const where = conversationFindMany.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).toContain('"arquivada":true');
    expect(JSON.stringify(where)).not.toContain('"arquivada":false');
  });

  it('contarPorStatus: sempre exclui arquivadas, para o numero da aba bater com a lista', async () => {
    await comOrganizacao('org-1', () => contarPorStatus(SOLICITANTE), { id: 'user-1', perfil: 'ADMIN' });

    const where = conversationGroupBy.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).toContain('"arquivada":false');
  });
});

/*
 * Fase 11.9-B — "separar claramente Finalizar de Arquivar": finalizar
 * continua sem tocar `arquivada`, nos dois sentidos (nao arquiva ao
 * finalizar, nao desarquiva ao finalizar).
 */
describe('finalizarConversa — permanece alheio a arquivamento (Fase 11.9-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageCreate.mockResolvedValue({ id: 'msg-sistema', criadoEm: new Date() });
    conversationUpdate.mockResolvedValue(undefined);
  });

  it('finalizar uma conversa arquivada: o update de status nao mexe em `arquivada`', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-f1', filaId: null, status: 'EM_ATENDIMENTO', arquivada: true })
      .mockResolvedValueOnce({ id: 'conv-f1', fila: null, agente: null, status: 'FINALIZADO', arquivada: true });

    await comOrganizacao('org-1', () => finalizarConversa(SOLICITANTE, 'conv-f1'), { id: 'user-1', perfil: 'ADMIN' });

    const dados = conversationUpdate.mock.calls[0]?.[0]?.data;
    expect(dados).not.toHaveProperty('arquivada');
    expect(dados).toMatchObject({ status: 'FINALIZADO' });
  });

  it('finalizar uma conversa NAO arquivada: continua nao arquivada depois (finalizar nao arquiva sozinho)', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'conv-f2', filaId: null, status: 'EM_ATENDIMENTO', arquivada: false })
      .mockResolvedValueOnce({ id: 'conv-f2', fila: null, agente: null, status: 'FINALIZADO', arquivada: false });

    await comOrganizacao('org-1', () => finalizarConversa(SOLICITANTE, 'conv-f2'), { id: 'user-1', perfil: 'ADMIN' });

    const dados = conversationUpdate.mock.calls[0]?.[0]?.data;
    expect(dados).not.toHaveProperty('arquivada');
  });
});

/*
 * Nota interna (redesign estilo WhatsBot-Pro) — `enviarMensagem` com
 * `interno=true` grava a anotacao no historico mas nunca sai pelo canal
 * externo nem alimenta o motor de IA: e comunicacao entre a equipe, nao parte
 * da conversa com o cliente.
 */
describe('enviarMensagem — nota interna', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function criarConversaMock(overrides: Record<string, unknown> = {}) {
    return {
      id: 'conv-1',
      canal: 'WHATSAPP' as const,
      status: 'EM_ATENDIMENTO' as const,
      enderecoExterno: '5511999998888',
      canalConfigId: 'cfg-1',
      filaId: null,
      agenteId: 'user-1',
      ...overrides,
    };
  }

  function criarMensagemMock(overrides: Record<string, unknown> = {}) {
    return {
      id: 'msg-1',
      conversaId: 'conv-1',
      autor: 'AGENTE' as const,
      autorId: 'user-1',
      conteudo: '',
      idExterno: null,
      interno: false,
      criadoEm: new Date(),
      ...overrides,
    };
  }

  it('nota interna nao chama o canal nem a IA, e grava interno=true', async () => {
    const conversa = criarConversaMock();
    conversationFindFirst.mockResolvedValue(conversa);
    exigeEnvioExterno.mockReturnValue(true);
    messageCreate.mockResolvedValue(criarMensagemMock({ conteudo: 'nota interna de teste', interno: true }));

    await comOrganizacao(
      'org-1',
      () => enviarMensagem(SOLICITANTE, conversa.id, 'nota interna de teste', true),
      { id: 'user-1', perfil: 'ADMIN' },
    );

    expect(enviarParaCanal).not.toHaveBeenCalled();
    expect(entregarParaIa).not.toHaveBeenCalled();
    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ interno: true, idExterno: null }),
      }),
    );
  });

  it('sem o parametro interno, continua enviando pelo canal normalmente (regressao)', async () => {
    const conversa = criarConversaMock();
    conversationFindFirst.mockResolvedValue(conversa);
    exigeEnvioExterno.mockReturnValue(true);
    enviarParaCanal.mockResolvedValue({ idExterno: 'ext-1' });
    messageCreate.mockResolvedValue(criarMensagemMock({ conteudo: 'oi', interno: false }));

    await comOrganizacao('org-1', () => enviarMensagem(SOLICITANTE, conversa.id, 'oi'), {
      id: 'user-1',
      perfil: 'ADMIN',
    });

    expect(enviarParaCanal).toHaveBeenCalled();
    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ interno: false }) }),
    );
  });
});
