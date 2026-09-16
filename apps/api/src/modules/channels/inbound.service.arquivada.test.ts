import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemNormalizada } from './meta.types';

/**
 * Fase 11.9-B — mensagem nova do cliente numa conversa ARQUIVADA tem que
 * desarquivar automaticamente (auditoria 11.9-A, item 6): sem isto, a
 * mensagem cairia numa conversa que sumiu da lista de ninguem.
 *
 * Mocka toda a vizinhanca de `registrarMensagemEntrante` que este caminho
 * toca (prisma, canal, previa, midia, IA, bot, hub) -- nenhuma delas e o que
 * este teste observa, so precisam nao lancar.
 */
const {
  messageFindUnique,
  contactFindFirst,
  conversationFindFirst,
  conversationUpdate,
  messageCreate,
} = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationUpdate: vi.fn(),
  messageCreate: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: messageFindUnique, create: messageCreate },
    contact: { findFirst: contactFindFirst, findUniqueOrThrow: vi.fn(), create: vi.fn() },
    conversation: { findFirst: conversationFindFirst, create: vi.fn(), update: conversationUpdate },
    queue: { findFirst: vi.fn() },
  },
}));

vi.mock('./channels.service', () => ({ configDoDestino: vi.fn() }));
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

const MENSAGEM: MensagemNormalizada = {
  canal: 'WHATSAPP',
  enderecoExterno: '5511999999999',
  nomeExibicao: 'Cliente Teste',
  telefone: '5511999999999',
  idExterno: 'wamid.nova',
  conteudo: 'oi de novo',
  tipoAnexo: 'TEXTO',
  anexoUrl: null,
  anexoIdExterno: null,
  anexoNome: null,
  identificadorDestino: null,
};

describe('registrarMensagemEntrante — desarquiva conversa reaproveitada (Fase 11.9-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageFindUnique.mockResolvedValue(null);
    messageCreate.mockResolvedValue({ id: 'msg-nova', criadoEm: new Date('2026-09-16T10:00:00.000Z') });
    conversationUpdate.mockResolvedValue({ id: 'conv-arquivada', filaId: 'fila-1', agenteId: null });
  });

  it('conversa reaproveitada ARQUIVADA: update inclui arquivada:false', async () => {
    // 1a chamada a conversation.findFirst: lookup de contato por conversa (nao acha, cai no telefone).
    // 2a chamada: `emAberto` -- a conversa existente, arquivada.
    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-arquivada',
        contatoId: 'contato-1',
        canalConfigId: 'cfg-1',
        filaId: 'fila-1',
        arquivada: true,
      });
    contactFindFirst.mockResolvedValue({ id: 'contato-1', telefone: MENSAGEM.telefone });

    await registrarMensagemEntrante(MENSAGEM);

    expect(conversationUpdate).toHaveBeenCalledTimes(1);
    const dados = conversationUpdate.mock.calls[0]?.[0];
    expect(dados.where).toEqual({ id: 'conv-arquivada' });
    expect(dados.data).toMatchObject({ arquivada: false });

    // Reaproveitada (nao nova): notifica por `conversa:atualizada`, nunca `conversa:nova`.
    expect(notificarConversaAtualizada).toHaveBeenCalledTimes(1);
    expect(notificarConversaNova).not.toHaveBeenCalled();
  });

  it('conversa reaproveitada JA nao-arquivada: update continua incluindo arquivada:false (escrita incondicional, sem efeito colateral)', async () => {
    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-normal',
        contatoId: 'contato-1',
        canalConfigId: 'cfg-1',
        filaId: 'fila-1',
        arquivada: false,
      });
    contactFindFirst.mockResolvedValue({ id: 'contato-1', telefone: MENSAGEM.telefone });

    await registrarMensagemEntrante(MENSAGEM);

    const dados = conversationUpdate.mock.calls[0]?.[0];
    expect(dados.data).toMatchObject({ arquivada: false });
  });
});
