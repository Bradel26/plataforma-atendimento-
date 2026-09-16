import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemNormalizada } from './meta.types';

/*
 * Cenario 3 do checklist de validacao do WhatsApp (Fase 5): mensagem duplicada
 * (mesmo idExterno) nao pode criar uma segunda Message.
 *
 * `registrarMensagemEntrante` (inbound.service.ts:78-79) verifica isso ANTES
 * de qualquer outra coisa — antes de tocar em Contact, Conversation, midia ou
 * disparar Socket.IO/IA. Mockar so `prisma.message.findUnique` e suficiente
 * para provar o curto-circuito: se o resto do prisma nunca for chamado, o
 * comportamento de idempotencia esta correto.
 *
 * Nao mocka `media.service`, `chat-previews.service`, `realtime/hub`,
 * `bots/*` — nenhum deles e tocado neste caminho, entao nao ha necessidade de
 * isola-los (e mocka-los sem necessidade seria simular um comportamento que
 * o teste nao teria como violar).
 */

const { messageFindUnique, contactFindFirst, conversationFindFirst, conversationCreate, messageCreate } = vi.hoisted(
  () => ({
    messageFindUnique: vi.fn(),
    contactFindFirst: vi.fn(),
    conversationFindFirst: vi.fn(),
    conversationCreate: vi.fn(),
    messageCreate: vi.fn(),
  }),
);

vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: messageFindUnique, create: messageCreate },
    contact: { findFirst: contactFindFirst, findUniqueOrThrow: vi.fn(), create: vi.fn() },
    conversation: { findFirst: conversationFindFirst, create: conversationCreate, update: vi.fn() },
    queue: { findFirst: vi.fn() },
  },
}));

import { registrarMensagemEntrante } from './inbound.service';

const MENSAGEM: MensagemNormalizada = {
  canal: 'WHATSAPP',
  enderecoExterno: '5511999999999',
  nomeExibicao: 'Cliente Teste',
  telefone: '5511999999999',
  idExterno: 'wamid.repetido',
  conteudo: 'oi de novo',
  tipoAnexo: 'TEXTO',
  anexoUrl: null,
  anexoIdExterno: null,
  anexoNome: null,
  identificadorDestino: null,
};

describe('registrarMensagemEntrante — idempotencia por idExterno (Cenario 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('idExterno ja existente: devolve duplicada:true e nao cria nada', async () => {
    messageFindUnique.mockResolvedValue({ id: 'msg-existente', idExterno: 'wamid.repetido' });

    const resultado = await registrarMensagemEntrante(MENSAGEM);

    expect(resultado).toEqual({ duplicada: true });
    expect(messageFindUnique).toHaveBeenCalledWith({ where: { idExterno: 'wamid.repetido' } });

    // Nenhum efeito colateral: nem Contact, nem Conversation, nem Message novos.
    expect(contactFindFirst).not.toHaveBeenCalled();
    expect(conversationFindFirst).not.toHaveBeenCalled();
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('idExterno inedito: passa do curto-circuito e segue para encontrarOuCriarContato', async () => {
    messageFindUnique.mockResolvedValue(null);
    // Devolve algo simples so para nao quebrar o restante do fluxo antes do
    // ponto que este teste quer observar (a chamada em si).
    conversationFindFirst.mockResolvedValue({ contatoId: 'contato-1' });
    contactFindFirst.mockResolvedValue(null);

    // A partir daqui o fluxo segue para `prisma.contact.findUniqueOrThrow`,
    // que nao foi mockado com um valor — deixamos falhar de proposito: o que
    // este teste prova e que o curto-circuito NAO retornou "duplicada" e que
    // o codigo prosseguiu ate tentar buscar o contato, que e o suficiente
    // para o Cenario 3 (o oposto do primeiro teste).
    await expect(registrarMensagemEntrante(MENSAGEM)).rejects.toBeDefined();

    expect(messageFindUnique).toHaveBeenCalledWith({ where: { idExterno: 'wamid.repetido' } });
    expect(conversationFindFirst).toHaveBeenCalled();
  });
});
