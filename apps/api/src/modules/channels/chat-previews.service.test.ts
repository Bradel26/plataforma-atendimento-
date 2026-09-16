import { beforeEach, describe, expect, it, vi } from 'vitest';

function msg(texto: string): MensagemPrevia {
  return { autor: 'CLIENTE', texto, criadoEm: '2026-09-14T10:00:00.000Z' };
}

describe('cortarCache', () => {
  it('mantem a lista intacta quando ja esta dentro do limite', () => {
    const mensagens = [msg('a'), msg('b')];
    expect(cortarCache(mensagens, 30)).toEqual(mensagens);
  });

  it('corta para as N mais recentes, descartando as mais antigas (inicio do array)', () => {
    const mensagens = [msg('antiga'), msg('do meio'), msg('recente')];
    expect(cortarCache(mensagens, 2)).toEqual([msg('do meio'), msg('recente')]);
  });

  it('usa 30 como limite padrao quando nao informado', () => {
    const mensagens = Array.from({ length: 35 }, (_, i) => msg(String(i)));
    expect(cortarCache(mensagens)).toHaveLength(30);
    expect(cortarCache(mensagens)[0]).toEqual(msg('5'));
  });
});

describe('mensagensParaHistorico', () => {
  it('mapeia o cache da previa para o formato de Message, preservando ordem e data', () => {
    const cache: MensagemPrevia[] = [
      { autor: 'CLIENTE', texto: 'Oi', criadoEm: '2026-09-10T10:00:00.000Z' },
      { autor: 'AGENTE', texto: 'Ola!', criadoEm: '2026-09-10T10:01:00.000Z' },
    ];
    expect(mensagensParaHistorico('conversa-1', cache)).toEqual([
      { conversaId: 'conversa-1', autor: 'CLIENTE', conteudo: 'Oi', criadoEm: new Date('2026-09-10T10:00:00.000Z') },
      { conversaId: 'conversa-1', autor: 'AGENTE', conteudo: 'Ola!', criadoEm: new Date('2026-09-10T10:01:00.000Z') },
    ]);
  });

  it('cache vazio produz lista vazia', () => {
    expect(mensagensParaHistorico('conversa-1', [])).toEqual([]);
  });
});

/*
 * Fase 11.5 — `salvarPrevia` nao pode recriar uma ChatPreview para
 * `canalConfigId + numero` quando ja existe uma Conversation formal ABERTA
 * para essa mesma linha e esse mesmo numero (Fase 11.4, problema tecnico
 * MEDIO). Fase 11.7 — `salvarPrevia` avisa o dono da linha em tempo real
 * depois de um upsert bem sucedido. Mocka prisma e o hub de realtime, mesmo
 * padrao de `inbound.service.dedup.test.ts` — sem banco e sem Socket.IO real.
 */
const {
  conversationFindFirst,
  conversationCreate,
  conversationUpdate,
  conversationDelete,
  chatPreviewUpsert,
  chatPreviewFindUnique,
  chatPreviewDelete,
  messageCreateMany,
} = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationDelete: vi.fn(),
  chatPreviewUpsert: vi.fn(),
  chatPreviewFindUnique: vi.fn(),
  chatPreviewDelete: vi.fn(),
  messageCreateMany: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    conversation: {
      findFirst: conversationFindFirst,
      create: conversationCreate,
      update: conversationUpdate,
      delete: conversationDelete,
    },
    chatPreview: { upsert: chatPreviewUpsert, findUnique: chatPreviewFindUnique, delete: chatPreviewDelete },
    message: { createMany: messageCreateMany },
  },
}));

const { notificarPreviaAtualizada } = vi.hoisted(() => ({ notificarPreviaAtualizada: vi.fn() }));
vi.mock('../../realtime/hub', () => ({ notificarPreviaAtualizada }));

import { cortarCache, mensagensParaHistorico, promoverPrevia, salvarPrevia, type MensagemPrevia } from './chat-previews.service';

const DADOS_BASE = {
  canalConfigId: 'cfg-A',
  organizacaoId: 'org-1',
  donoId: 'user-1',
  numero: '+55 (11) 99999-8888',
  nome: 'Cliente Teste',
  ultimaMensagem: 'oi',
  ultimaMensagemEm: new Date('2026-09-16T10:00:00.000Z'),
  naoLidas: 1,
  mensagens: [],
};

const NUMERO_NORMALIZADO = '5511999998888';

/** Linha gravada no banco (o que `prisma.chatPreview.upsert` devolveria de verdade). */
const PREVIA_GRAVADA = {
  id: 'previa-1',
  canalConfigId: 'cfg-A',
  numero: NUMERO_NORMALIZADO,
  nome: 'Cliente Teste',
  ultimaMensagem: 'oi',
  ultimaMensagemEm: DADOS_BASE.ultimaMensagemEm,
  naoLidas: 1,
};

describe('salvarPrevia — duplicidade com Conversation formal (Fase 11.5) + realtime (Fase 11.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatPreviewUpsert.mockResolvedValue(PREVIA_GRAVADA);
  });

  it('1. sem Conversation aberta: cria/atualiza a ChatPreview normalmente, com o numero normalizado, e emite o evento', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia(DADOS_BASE);

    expect(conversationFindFirst).toHaveBeenCalledWith({
      where: { canalConfigId: 'cfg-A', enderecoExterno: NUMERO_NORMALIZADO, status: { not: 'FINALIZADO' } },
      select: { id: true },
    });
    expect(chatPreviewUpsert).toHaveBeenCalledTimes(1);
    const args = chatPreviewUpsert.mock.calls[0]?.[0];
    expect(args.where).toEqual({ canalConfigId_numero: { canalConfigId: 'cfg-A', numero: NUMERO_NORMALIZADO } });
    expect(args.create.numero).toBe(NUMERO_NORMALIZADO);

    expect(notificarPreviaAtualizada).toHaveBeenCalledTimes(1);
  });

  it('preview CRIADA: evento carrega os dados da previa gravada, para o dono da linha', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia(DADOS_BASE);

    expect(notificarPreviaAtualizada).toHaveBeenCalledWith(
      {
        id: 'previa-1',
        canalConfigId: 'cfg-A',
        numero: NUMERO_NORMALIZADO,
        nome: 'Cliente Teste',
        ultimaMensagem: 'oi',
        ultimaMensagemEm: DADOS_BASE.ultimaMensagemEm,
        naoLidas: 1,
      },
      { agenteId: 'user-1' },
    );
  });

  it('preview ATUALIZADA (upsert com registro ja existente): tambem emite o evento', async () => {
    conversationFindFirst.mockResolvedValue(null);
    chatPreviewUpsert.mockResolvedValue({ ...PREVIA_GRAVADA, naoLidas: 4, ultimaMensagem: 'nova mensagem' });

    await salvarPrevia({ ...DADOS_BASE, naoLidas: 4, ultimaMensagem: 'nova mensagem' });

    expect(notificarPreviaAtualizada).toHaveBeenCalledTimes(1);
    expect(notificarPreviaAtualizada).toHaveBeenCalledWith(
      expect.objectContaining({ naoLidas: 4, ultimaMensagem: 'nova mensagem' }),
      { agenteId: 'user-1' },
    );
  });

  it('organizacao correta: o payload emitido nunca inclui organizacaoId — a room ja e escopada pelo contexto do tenant dentro do hub, nunca por um campo no payload', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia(DADOS_BASE);

    const payload = notificarPreviaAtualizada.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty('organizacaoId');
  });

  it('vendedor correto: destinatario e sempre donoId, nunca outro campo', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia({ ...DADOS_BASE, donoId: 'user-2' });

    expect(notificarPreviaAtualizada).toHaveBeenCalledWith(expect.anything(), { agenteId: 'user-2' });
  });

  it('outro vendedor nao recebe: o destinatario passado ao hub e sempre o donoId desta chamada, nunca um terceiro fixo', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia({ ...DADOS_BASE, donoId: 'user-3' });

    const destinos = notificarPreviaAtualizada.mock.calls[0]?.[1];
    expect(destinos).toEqual({ agenteId: 'user-3' });
    expect(destinos.agenteId).not.toBe('user-1');
  });

  it('2. Conversation aberta na MESMA ChannelConfig: nao cria/atualiza a ChatPreview e NENHUM evento e emitido', async () => {
    conversationFindFirst.mockResolvedValue({ id: 'conv-1' });

    await salvarPrevia(DADOS_BASE);

    expect(chatPreviewUpsert).not.toHaveBeenCalled();
    expect(notificarPreviaAtualizada).not.toHaveBeenCalled();
  });

  it('3. Conversation de OUTRA linha nao bloqueia: previa criada e evento emitido normalmente', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia({ ...DADOS_BASE, canalConfigId: 'cfg-B' });

    expect(conversationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ canalConfigId: 'cfg-B' }) }),
    );
    expect(chatPreviewUpsert).toHaveBeenCalledTimes(1);
    expect(notificarPreviaAtualizada).toHaveBeenCalledTimes(1);
  });

  it('4. nunca filtra organizacao manualmente — isolamento fica 100% a cargo do contexto do tenant (extensao do Prisma)', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia(DADOS_BASE);

    const where = conversationFindFirst.mock.calls[0]?.[0]?.where;
    expect(Object.keys(where)).toEqual(['canalConfigId', 'enderecoExterno', 'status']);
    expect(where).not.toHaveProperty('organizacaoId');
  });

  it('5. ChatPreview existente continua sendo atualizado quando nao ha Conversation aberta', async () => {
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia({ ...DADOS_BASE, nome: 'Nome Atualizado', naoLidas: 3 });

    const args = chatPreviewUpsert.mock.calls[0]?.[0];
    expect(args.update).toMatchObject({ nome: 'Nome Atualizado', naoLidas: 3 });
  });

  it('conversa FINALIZADA nao bloqueia: sincronizacao futura pode voltar a criar a previa, e emitir o evento (mesma regra de "finalizado nao impede nova conversa")', async () => {
    // findFirst com `status: { not: 'FINALIZADO' }` no where nunca devolveria
    // uma conversa finalizada — simulado aqui devolvendo null, como o Prisma
    // real devolveria para esse filtro.
    conversationFindFirst.mockResolvedValue(null);

    await salvarPrevia(DADOS_BASE);

    expect(chatPreviewUpsert).toHaveBeenCalledTimes(1);
    expect(notificarPreviaAtualizada).toHaveBeenCalledTimes(1);
  });

  it('7. nao cria, atualiza nem apaga nenhuma Conversation — a checagem e so leitura', async () => {
    conversationFindFirst.mockResolvedValue({ id: 'conv-1' });

    await salvarPrevia(DADOS_BASE);

    expect(conversationCreate).not.toHaveBeenCalled();
    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(conversationDelete).not.toHaveBeenCalled();
  });
});

describe('promoverPrevia continua funcionando (regressao Fase 11.5/11.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('6. promove o cache da previa para Message e apaga a previa, sem consultar Conversation aberta nem emitir evento de previa', async () => {
    chatPreviewFindUnique.mockResolvedValue({
      id: 'previa-1',
      mensagens: [{ autor: 'CLIENTE', texto: 'oi', criadoEm: '2026-09-16T09:00:00.000Z' }],
    });

    await promoverPrevia('conv-nova', 'cfg-A', NUMERO_NORMALIZADO);

    expect(messageCreateMany).toHaveBeenCalledTimes(1);
    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: 'conv-nova' },
      data: { ultimaMensagemEm: new Date('2026-09-16T09:00:00.000Z') },
    });
    expect(chatPreviewDelete).toHaveBeenCalledWith({ where: { id: 'previa-1' } });
    // `promoverPrevia` nao ganhou a checagem de duplicidade nem o aviso em
    // tempo real — pertencem so a `salvarPrevia`, o unico ponto que CRIA ou
    // ATUALIZA previa. Promover so apaga.
    expect(conversationFindFirst).not.toHaveBeenCalled();
    expect(notificarPreviaAtualizada).not.toHaveBeenCalled();
  });

  it('silenciosa quando nao ha previa nenhuma para promover', async () => {
    chatPreviewFindUnique.mockResolvedValue(null);

    await promoverPrevia('conv-nova', 'cfg-A', NUMERO_NORMALIZADO);

    expect(messageCreateMany).not.toHaveBeenCalled();
    expect(chatPreviewDelete).not.toHaveBeenCalled();
    expect(notificarPreviaAtualizada).not.toHaveBeenCalled();
  });
});
