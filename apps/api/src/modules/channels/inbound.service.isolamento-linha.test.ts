import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemNormalizada } from './meta.types';

/**
 * Auditoria de 23/09/2026, achado critico #1: a busca da conversa aberta
 * (`emAberto`, em `registrarMensagemEntrante`) nao filtrava por
 * `canalConfigId` — so por `contatoId` + `canal` + `status`. Um contato com
 * conversa aberta na linha PESSOAL de um vendedor tinha essa conversa
 * reaproveitada quando escrevia para a linha COMPARTILHADA da empresa (ou
 * para a linha pessoal de outro vendedor): a mensagem caia no atendimento de
 * quem nao deveria ve-la, e a resposta saia pelo numero errado.
 *
 * Mesmo padrao de mocks de inbound.service.race.test.ts.
 */
const {
  messageFindUnique,
  contactFindFirst,
  conversationFindFirst,
  conversationCreate,
  conversationUpdate,
  messageCreate,
  configDoDestino,
} = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  messageCreate: vi.fn(),
  configDoDestino: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: messageFindUnique, create: messageCreate },
    contact: { findFirst: contactFindFirst, findUniqueOrThrow: vi.fn(), create: vi.fn() },
    conversation: { findFirst: conversationFindFirst, create: conversationCreate, update: conversationUpdate },
    queue: { findFirst: vi.fn() },
  },
}));

vi.mock('./channels.service', () => ({ configDoDestino }));
vi.mock('./chat-previews.service', () => ({ promoverPrevia: vi.fn() }));
vi.mock('./media.service', () => ({ baixarAnexo: vi.fn().mockResolvedValue({ url: null, motivo: null }) }));
vi.mock('../bots/bots.service', () => ({ responderAutomaticamente: vi.fn() }));
vi.mock('../bots/ia.service', () => ({ entregarParaIa: vi.fn().mockResolvedValue({ entregue: true }) }));

const { notificarConversaAtualizada, notificarConversaNova, notificarMensagem } = vi.hoisted(() => ({
  notificarConversaAtualizada: vi.fn(),
  notificarConversaNova: vi.fn(),
  notificarMensagem: vi.fn(),
}));
vi.mock('../../realtime/hub', () => ({ notificarConversaAtualizada, notificarConversaNova, notificarMensagem }));

vi.mock('../conversations/conversations.serializer', () => ({
  toConversaDetalhe: (c: unknown) => c,
  toMensagem: (m: unknown) => m,
  inclusaoDetalhe: {},
}));

import { registrarMensagemEntrante } from './inbound.service';

function mensagem(overrides: Partial<MensagemNormalizada> = {}): MensagemNormalizada {
  return {
    canal: 'WHATSAPP',
    enderecoExterno: '5511999999999',
    nomeExibicao: 'Cliente Teste',
    telefone: '5511999999999',
    idExterno: 'wamid.isolamento',
    conteudo: 'oi',
    tipoAnexo: 'TEXTO',
    anexoUrl: null,
    anexoIdExterno: null,
    anexoNome: null,
    identificadorDestino: null,
    ...overrides,
  };
}

describe('registrarMensagemEntrante — conversa nao atravessa linha (achado critico #1, 23/09/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageFindUnique.mockResolvedValue(null);
    contactFindFirst.mockResolvedValue({ id: 'contato-1', telefone: '5511999999999' });
    messageCreate.mockResolvedValue({ id: 'msg-1', criadoEm: new Date('2026-09-24T10:00:00.000Z') });
    // Retorno generico do update mandatorio de fim de fluxo (ultimaMensagemEm,
    // naoLidas, enderecoExterno, arquivada) -- roda em toda chamada, nova ou
    // reaproveitada; os testes abaixo nao observam o resultado dele.
    conversationUpdate.mockResolvedValue({ id: 'conv-atualizada', filaId: null, agenteId: null });
  });

  it('conversa aberta na linha PESSOAL de um vendedor NAO e reaproveitada quando o cliente escreve para a linha COMPARTILHADA', async () => {
    // A mensagem chega pela linha compartilhada (configDoDestino resolve a
    // config compartilhada, independente do que outra linha tenha aberto).
    configDoDestino.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-1' });

    // 1a chamada a conversation.findFirst: lookup de contato por endereco
    // (dentro de encontrarOuCriarContato) -- nao acha, cai no telefone.
    // 2a chamada: `emAberto`, agora filtrada por canalConfigId='cfg-compartilhada'
    // -- nao acha, porque a conversa aberta existente e da linha PESSOAL.
    conversationFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    conversationCreate.mockResolvedValue({
      id: 'conv-nova-compartilhada',
      canalConfigId: 'cfg-compartilhada',
      filaId: 'fila-1',
      agenteId: null,
    });

    await registrarMensagemEntrante(mensagem());

    // A busca da conversa aberta tem que filtrar pela linha que RECEBEU a mensagem.
    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({
      contatoId: 'contato-1',
      canal: 'WHATSAPP',
      canalConfigId: 'cfg-compartilhada',
    });

    // Como a conversa aberta e de OUTRA linha, uma nova foi criada -- nunca
    // reaproveitou a da linha pessoal.
    expect(conversationCreate).toHaveBeenCalledTimes(1);
    const dadosCriacao = conversationCreate.mock.calls[0]?.[0]?.data;
    expect(dadosCriacao.canalConfigId).toBe('cfg-compartilhada');
    expect(notificarConversaNova).toHaveBeenCalledTimes(1);
    expect(notificarConversaAtualizada).not.toHaveBeenCalled();
  });

  it('linha pessoal do vendedor B NAO reaproveita a conversa aberta na linha pessoal do vendedor A', async () => {
    // Mensagem chega com o identificadorDestino da sessao do vendedor B.
    configDoDestino.mockResolvedValue({ id: 'cfg-vendedor-b', donoId: 'vendedor-b', filaId: null });

    conversationFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    conversationCreate.mockResolvedValue({
      id: 'conv-vendedor-b',
      canalConfigId: 'cfg-vendedor-b',
      filaId: null,
      agenteId: 'vendedor-b',
    });

    await registrarMensagemEntrante(
      mensagem({ idExterno: 'wamid.vendedor-b', identificadorDestino: 'sessao-vendedor-b' }),
    );

    expect(configDoDestino).toHaveBeenCalledWith('WHATSAPP', 'sessao-vendedor-b');

    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({ canalConfigId: 'cfg-vendedor-b' });

    const dadosCriacao = conversationCreate.mock.calls[0]?.[0]?.data;
    expect(dadosCriacao.canalConfigId).toBe('cfg-vendedor-b');
    // Linha pessoal: nasce atribuida ao dono da linha, nao em espera de fila.
    expect(dadosCriacao.agenteId).toBe('vendedor-b');
    expect(dadosCriacao.status).toBe('ATRIBUIDO');
  });

  it('conversa aberta na MESMA linha continua sendo reaproveitada (sem regressao no caso comum)', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-1' });

    conversationFindFirst
      .mockResolvedValueOnce(null) // contato por endereco
      .mockResolvedValueOnce({
        id: 'conv-existente',
        contatoId: 'contato-1',
        canalConfigId: 'cfg-compartilhada',
        filaId: 'fila-1',
        arquivada: false,
      });

    await registrarMensagemEntrante(mensagem({ idExterno: 'wamid.mesma-linha' }));

    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({ canalConfigId: 'cfg-compartilhada' });

    expect(conversationCreate).not.toHaveBeenCalled();
    expect(conversationUpdate).toHaveBeenCalledTimes(1);
    expect(conversationUpdate.mock.calls[0]?.[0]?.where).toEqual({ id: 'conv-existente' });
    expect(notificarConversaAtualizada).toHaveBeenCalledTimes(1);
    expect(notificarConversaNova).not.toHaveBeenCalled();
  });

  it('sem nenhuma linha configurada (config nula dos dois lados), ainda agrupa mensagens do mesmo contato entre si', async () => {
    // Caso extremo: configDoDestino nao resolve config nenhuma (nenhum
    // ChannelConfig cadastrado para o canal). canalConfigId fica null dos
    // dois lados -- null casa com null, o agrupamento nao quebra.
    configDoDestino.mockResolvedValue(null);

    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-sem-linha',
        contatoId: 'contato-1',
        canalConfigId: null,
        filaId: null,
        arquivada: false,
      });

    await registrarMensagemEntrante(mensagem({ idExterno: 'wamid.sem-linha' }));

    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({ canalConfigId: null });
    expect(conversationCreate).not.toHaveBeenCalled();
  });
});
