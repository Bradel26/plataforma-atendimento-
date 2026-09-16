import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemNormalizada } from './meta.types';

/**
 * Corrida entre o `findUnique` de topo de `registrarMensagemEntrante` e o
 * `Message.create`: duas requisicoes com o mesmo `idExterno` podem passar
 * as duas pelo `findUnique` antes de qualquer commit. So a constraint
 * `@unique` em `idExterno` (schema.prisma) pega esse caso, como P2002 no
 * `create`.
 *
 * Este teste NAO reproduz concorrencia real (duas chamadas simultaneas) --
 * a suite roda em processo unico e o Prisma real nao esta disponivel aqui.
 * Ele testa diretamente o TRATAMENTO do P2002: mocka `message.create` para
 * rejeitar com o erro que o Prisma lancaria nesse cenario, e verifica que
 * `criarMensagemOuDetectarCorrida` (via `registrarMensagemEntrante`) trata
 * como duplicata sem repetir os efeitos que vem depois do create
 * (Conversation.update, realtime, IA/bot). Os efeitos ANTES do create
 * (Contact, Conversation.create, ChatPreview) nao sao cobertos por esta
 * correcao -- numa corrida real ambas as requisicoes ja os executaram antes
 * de uma perder aqui; ver limitacao no relatorio.
 */
const {
  messageFindUnique,
  contactFindFirst,
  conversationFindFirst,
  conversationCreate,
  conversationUpdate,
  messageCreate,
} = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  messageCreate: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: messageFindUnique, create: messageCreate },
    contact: { findFirst: contactFindFirst, findUniqueOrThrow: vi.fn(), create: vi.fn() },
    conversation: { findFirst: conversationFindFirst, create: conversationCreate, update: conversationUpdate },
    queue: { findFirst: vi.fn() },
  },
}));

vi.mock('./channels.service', () => ({ configDoDestino: vi.fn() }));
vi.mock('./chat-previews.service', () => ({ promoverPrevia: vi.fn() }));
vi.mock('./media.service', () => ({ baixarAnexo: vi.fn().mockResolvedValue({ url: null, motivo: null }) }));

const { responderAutomaticamente } = vi.hoisted(() => ({ responderAutomaticamente: vi.fn() }));
vi.mock('../bots/bots.service', () => ({ responderAutomaticamente }));

const { entregarParaIa } = vi.hoisted(() => ({ entregarParaIa: vi.fn().mockResolvedValue({ entregue: true }) }));
vi.mock('../bots/ia.service', () => ({ entregarParaIa }));

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
  idExterno: 'wamid.corrida',
  conteudo: 'oi',
  tipoAnexo: 'TEXTO',
  anexoUrl: null,
  anexoIdExterno: null,
  anexoNome: null,
  identificadorDestino: null,
};

function erroP2002(target: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('registrarMensagemEntrante — corrida no Message.create (P2002 de idExterno)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // findUnique do topo: nao acha (as duas requisicoes da corrida passam por aqui).
    messageFindUnique.mockResolvedValueOnce(null);
    conversationFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    contactFindFirst.mockResolvedValue({ id: 'contato-1', telefone: MENSAGEM.telefone });
    conversationCreate.mockResolvedValue({
      id: 'conv-1',
      canalConfigId: null,
      filaId: 'fila-1',
      agenteId: null,
    });
  });

  it('P2002 de id_externo: refaz findUnique, acha a vencedora e devolve duplicada:true sem efeitos posteriores', async () => {
    messageCreate.mockRejectedValueOnce(erroP2002('id_externo'));
    // 2a chamada ao findUnique: a busca pos-P2002 pela Message vencedora.
    messageFindUnique.mockResolvedValueOnce({ id: 'msg-vencedora', idExterno: 'wamid.corrida' });

    const resultado = await registrarMensagemEntrante(MENSAGEM);

    expect(resultado).toEqual({ duplicada: true });
    expect(messageFindUnique).toHaveBeenCalledTimes(2);
    expect(messageFindUnique).toHaveBeenNthCalledWith(2, { where: { idExterno: 'wamid.corrida' } });

    // Efeitos que vem DEPOIS do create no fluxo normal nao repetem.
    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(notificarMensagem).not.toHaveBeenCalled();
    expect(notificarConversaNova).not.toHaveBeenCalled();
    expect(notificarConversaAtualizada).not.toHaveBeenCalled();
    expect(entregarParaIa).not.toHaveBeenCalled();
    expect(responderAutomaticamente).not.toHaveBeenCalled();
  });

  it('P2002 de id_externo mas vencedora nao encontrada (ex.: outra organizacao): relanca o erro original', async () => {
    const erro = erroP2002('id_externo');
    messageCreate.mockRejectedValueOnce(erro);
    messageFindUnique.mockResolvedValueOnce(null);

    await expect(registrarMensagemEntrante(MENSAGEM)).rejects.toBe(erro);
  });

  it('P2002 de outra constraint (nao idExterno): relanca sem tratar como duplicata', async () => {
    const erro = erroP2002('outra_coluna');
    messageCreate.mockRejectedValueOnce(erro);

    await expect(registrarMensagemEntrante(MENSAGEM)).rejects.toBe(erro);
    expect(messageFindUnique).toHaveBeenCalledTimes(1);
  });

  it('erro que nao e P2002: sobe sem tratamento (comportamento atual)', async () => {
    const erro = new Error('falha generica de banco');
    messageCreate.mockRejectedValueOnce(erro);

    await expect(registrarMensagemEntrante(MENSAGEM)).rejects.toBe(erro);
  });
});
