import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Achado 1(a) da revisao final: `historico()` (GET do Webchat) devolvia TODAS
 * as mensagens da conversa ao visitante, incluindo notas internas
 * (`interno: true`) trocadas so entre a equipe. Este teste usa o serializer
 * REAL (`toConversaDetalhe`/`semNotasInternas`), nao mockado — e exatamente o
 * filtro que precisa ser exercitado aqui.
 */
const { conversationFindUnique, conversationUpdate, conversationUpdateMany, messageCreate } = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  messageCreate: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: conversationFindUnique, update: conversationUpdate, updateMany: conversationUpdateMany },
    message: { create: messageCreate },
  },
}));

const hub = vi.hoisted(() => ({
  notificarConversaAtualizada: vi.fn(),
  notificarConversaNova: vi.fn(),
  notificarMensagem: vi.fn(),
}));
vi.mock('../../realtime/hub', () => hub);

const { entregarParaIa } = vi.hoisted(() => ({ entregarParaIa: vi.fn().mockResolvedValue({ entregue: true }) }));
vi.mock('../bots/ia.service', () => ({ entregarParaIa }));
const { responderAutomaticamente } = vi.hoisted(() => ({ responderAutomaticamente: vi.fn() }));
vi.mock('../bots/bots.service', () => ({ responderAutomaticamente }));

import { historico, mensagemDoCliente } from './webchat.service';

function criarConversaMock() {
  const agora = new Date();
  return {
    id: 'conv-1',
    canal: 'WEBCHAT' as const,
    status: 'EM_ATENDIMENTO' as const,
    assunto: null,
    tags: [],
    naoLidas: 0,
    arquivada: false,
    criadoEm: agora,
    atribuidoEm: null,
    finalizadoEm: null,
    ultimaMensagemEm: agora,
    contato: { id: 'contato-1', nome: 'Visitante', email: null, telefone: null },
    fila: { id: 'fila-1', nome: 'Fila Webchat' },
    agente: { id: 'agente-1', nome: 'Agente Teste' },
    canalConfig: null,
    // `inclusaoDetalhe` busca desc (mais recente primeiro) — `toConversaDetalhe`
    // e quem inverte para ordem cronologica. Aqui a mais recente e m3, depois a
    // nota interna m2, depois m1: por isso o array ja vem nessa ordem.
    mensagens: [
      {
        id: 'm3',
        conversaId: 'conv-1',
        autor: 'AGENTE',
        autorId: 'agente-1',
        conteudo: 'Claro, posso ajudar!',
        tipoAnexo: null,
        anexoUrl: null,
        interno: false,
        criadoEm: agora,
      },
      {
        id: 'm2',
        conversaId: 'conv-1',
        autor: 'AGENTE',
        autorId: 'agente-1',
        conteudo: 'Nota interna: cliente parece irritado',
        tipoAnexo: null,
        anexoUrl: null,
        interno: true,
        criadoEm: agora,
      },
      {
        id: 'm1',
        conversaId: 'conv-1',
        autor: 'CLIENTE',
        autorId: null,
        conteudo: 'Ola, preciso de ajuda',
        tipoAnexo: null,
        anexoUrl: null,
        interno: false,
        criadoEm: agora,
      },
    ],
  };
}

describe('historico (Achado 1a)', () => {
  it('nao inclui mensagens interno:true no historico devolvido ao visitante', async () => {
    conversationFindUnique.mockResolvedValueOnce(criarConversaMock());

    const detalhe = await historico('conv-1');

    const ids = detalhe.mensagens.map((m) => m.id);
    expect(ids).toEqual(['m1', 'm3']);
    expect(detalhe.mensagens.some((m) => m.interno)).toBe(false);
  });

  it('conversa sem nenhuma nota interna continua devolvendo todas as mensagens', async () => {
    const mock = criarConversaMock();
    mock.mensagens = mock.mensagens.filter((m) => !m.interno);
    conversationFindUnique.mockResolvedValueOnce(mock);

    const detalhe = await historico('conv-1');

    expect(detalhe.mensagens.map((m) => m.id)).toEqual(['m1', 'm3']);
  });
});

describe('mensagemDoCliente — transicao de status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('visitante escrevendo numa conversa AGUARDANDO_CLIENTE devolve para EM_ATENDIMENTO', async () => {
    const conversa = { ...criarConversaMock(), status: 'AGUARDANDO_CLIENTE' as const };
    conversationFindUnique.mockResolvedValueOnce(conversa);
    messageCreate.mockResolvedValueOnce({ id: 'm-novo', conversaId: 'conv-1', criadoEm: new Date() });
    conversationUpdate.mockResolvedValueOnce(criarConversaMock());

    await mensagemDoCliente('conv-1', 'ola');

    // Compare-and-set atomico, mesma garantia de `assumirConversa`: so troca
    // se o status AINDA for AGUARDANDO_CLIENTE no banco na hora da escrita.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'conv-1', status: 'AGUARDANDO_CLIENTE' },
      data: { status: 'EM_ATENDIMENTO' },
    });
    expect(conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it('visitante escrevendo numa conversa EM_ESPERA nao muda o status', async () => {
    const conversa = { ...criarConversaMock(), status: 'EM_ESPERA' as const };
    conversationFindUnique.mockResolvedValueOnce(conversa);
    messageCreate.mockResolvedValueOnce({ id: 'm-novo', conversaId: 'conv-1', criadoEm: new Date() });
    conversationUpdate.mockResolvedValueOnce(criarConversaMock());

    await mensagemDoCliente('conv-1', 'ola');

    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'conv-1', status: 'AGUARDANDO_CLIENTE' },
      data: { status: 'EM_ATENDIMENTO' },
    });
    expect(conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it('corrida: conversa finalizada por um agente durante o message.create nao e reaberta pela mensagem do visitante', async () => {
    const conversa = { ...criarConversaMock(), status: 'AGUARDANDO_CLIENTE' as const };
    conversationFindUnique.mockResolvedValueOnce(conversa);
    messageCreate.mockResolvedValueOnce({ id: 'm-novo', conversaId: 'conv-1', criadoEm: new Date() });
    conversationUpdateMany.mockResolvedValueOnce({ count: 0 });
    conversationUpdate.mockResolvedValueOnce(criarConversaMock());

    await mensagemDoCliente('conv-1', 'ola');

    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'conv-1', status: 'AGUARDANDO_CLIENTE' },
      data: { status: 'EM_ATENDIMENTO' },
    });
    // Nao casou (ja estava FINALIZADO) -- o update principal nao reabre.
    expect(conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });
});
