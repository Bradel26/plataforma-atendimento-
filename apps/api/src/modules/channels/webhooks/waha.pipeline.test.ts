import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Do payload do WAHA ate a conversa: `WahaProvider.webhook.interpretar` ->
 * `processarEventoDeCanal` -> o `registrarMensagemEntrante` REAL (sem mock),
 * com so o Prisma e os efeitos externos (Socket.IO, IA, bot) falsos.
 *
 * Prova que o WAHA entra pelo pipeline que ja existe — idempotencia,
 * contato, conversa e a regra de distribuicao por linha — e nao por um
 * caminho paralelo.
 */

const db = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  contactFindFirst: vi.fn(),
  contactCreate: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  queueFindFirst: vi.fn(),
  channelConfigFindFirst: vi.fn(),
  channelConfigUpdate: vi.fn(),
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: db.messageFindUnique, create: db.messageCreate },
    contact: { findFirst: db.contactFindFirst, create: db.contactCreate, findUniqueOrThrow: vi.fn() },
    conversation: { findFirst: db.conversationFindFirst, create: db.conversationCreate, update: db.conversationUpdate },
    queue: { findFirst: db.queueFindFirst },
    channelConfig: { findFirst: db.channelConfigFindFirst, update: db.channelConfigUpdate },
  },
  prismaSemIsolamento: { channelConfig: { findFirst: vi.fn() } },
}));

const { configDoDestino } = vi.hoisted(() => ({ configDoDestino: vi.fn() }));
vi.mock('../channels.service', () => ({ configDoDestino }));
vi.mock('../chat-previews.service', () => ({ promoverPrevia: vi.fn() }));
vi.mock('../media.service', () => ({ baixarAnexo: vi.fn().mockResolvedValue({ url: null }) }));
vi.mock('../../bots/bots.service', () => ({ responderAutomaticamente: vi.fn() }));
vi.mock('../../bots/ia.service', () => ({ entregarParaIa: vi.fn().mockResolvedValue({ entregue: false }) }));

const hub = vi.hoisted(() => ({
  notificarMensagem: vi.fn(),
  notificarConversaNova: vi.fn(),
  notificarConversaAtualizada: vi.fn(),
  notificarStatusCanal: vi.fn(),
}));
vi.mock('../../../realtime/hub', () => hub);
vi.mock('../../conversations/conversations.serializer', () => ({
  toConversaDetalhe: (c: unknown) => c,
  toMensagem: (m: unknown) => m,
  inclusaoDetalhe: {},
}));

import { interpretarEventoWaha } from '../providers/waha/waha.mapper';
import { processarEventoDeCanal } from './eventos-de-canal';

const CONTEXTO = { provider: 'waha', organizacaoId: 'org-1' };

/** Linha pessoal do vendedor: o que chega por ela ja nasce atribuido a ele. */
const LINHA_PESSOAL = { id: 'linha-1', donoId: 'vendedor-1', filaId: null, ponteSessao: 'vendedor-1a2b3c4d' };

const EVENTO_WAHA = {
  event: 'message',
  session: 'vendedor-1a2b3c4d',
  payload: {
    id: 'false_5562999990000@c.us_3EB0A238AC2DE5AE1C5D04',
    from: '5562999990000@c.us',
    fromMe: false,
    body: 'Oi, quero um orcamento',
    _data: { notifyName: 'Maria' },
  },
};

async function entregar(corpo: unknown) {
  const [evento] = interpretarEventoWaha(corpo);
  return processarEventoDeCanal(evento!, CONTEXTO);
}

describe('pipeline WAHA -> registrarMensagemEntrante', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    db.messageFindUnique.mockResolvedValue(null);
    db.conversationFindFirst.mockResolvedValue(null); // nem contato por endereco, nem conversa aberta
    db.contactFindFirst.mockResolvedValue(null);
    db.contactCreate.mockImplementation(async ({ data }) => ({ id: 'contato-1', ...data }));
    db.conversationCreate.mockImplementation(async ({ data }) => ({ id: 'conv-1', ...data }));
    db.messageCreate.mockImplementation(async ({ data }) => ({ id: 'msg-1', criadoEm: new Date(), ...data }));
    db.conversationUpdate.mockImplementation(async () => ({ id: 'conv-1', filaId: null, agenteId: 'vendedor-1' }));
    configDoDestino.mockResolvedValue(LINHA_PESSOAL);
  });

  it('mensagem nova: cria contato com o telefone, conversa atribuida ao dono da linha e a mensagem', async () => {
    expect(await entregar(EVENTO_WAHA)).toBe('processado');

    expect(db.contactCreate).toHaveBeenCalledWith({
      data: { nome: 'Maria', telefone: '5562999990000', canalOrigem: 'WHATSAPP' },
    });
    // A linha e achada pela sessao do WAHA.
    expect(configDoDestino).toHaveBeenCalledWith('WHATSAPP', 'vendedor-1a2b3c4d');
    expect(db.conversationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        canal: 'WHATSAPP',
        status: 'ATRIBUIDO',
        agenteId: 'vendedor-1',
        canalConfigId: 'linha-1',
        enderecoExterno: '5562999990000@c.us',
      }),
    });
    expect(db.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        autor: 'CLIENTE',
        conteudo: 'Oi, quero um orcamento',
        idExterno: 'false_5562999990000@c.us_3EB0A238AC2DE5AE1C5D04',
      }),
    });
    expect(hub.notificarConversaNova).toHaveBeenCalledTimes(1);
    expect(hub.notificarMensagem).toHaveBeenCalledTimes(1);
  });

  it('reentrega do mesmo evento (WAHA sem 200) e duplicada e nao cria nada', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'msg-1' });

    expect(await entregar(EVENTO_WAHA)).toBe('duplicado');
    expect(db.contactCreate).not.toHaveBeenCalled();
    expect(db.conversationCreate).not.toHaveBeenCalled();
    expect(db.messageCreate).not.toHaveBeenCalled();
  });

  it('contato que ja conversou: reaproveita o contato e a conversa aberta', async () => {
    db.conversationFindFirst
      .mockResolvedValueOnce({ contatoId: 'contato-antigo' }) // contato pelo endereco
      .mockResolvedValueOnce({ id: 'conv-aberta', canalConfigId: 'linha-1', filaId: null }); // conversa aberta
    const { prisma } = await import('../../../lib/prisma');
    vi.mocked(prisma.contact.findUniqueOrThrow).mockResolvedValue({ id: 'contato-antigo' } as never);

    expect(await entregar(EVENTO_WAHA)).toBe('processado');
    expect(db.contactCreate).not.toHaveBeenCalled();
    expect(db.conversationCreate).not.toHaveBeenCalled();
    expect(db.messageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ conversaId: 'conv-aberta' }) });
    expect(hub.notificarConversaAtualizada).toHaveBeenCalledTimes(1);
  });

  it('linha compartilhada (sem dono): conversa cai EM_ESPERA na fila da linha', async () => {
    configDoDestino.mockResolvedValue({ id: 'linha-empresa', donoId: null, filaId: 'fila-comercial' });

    await entregar(EVENTO_WAHA);

    expect(db.conversationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'EM_ESPERA', filaId: 'fila-comercial', agenteId: null, canalConfigId: 'linha-empresa' }),
    });
  });

  it('session.status: grava o estado na linha certa e avisa a tela em tempo real', async () => {
    db.channelConfigFindFirst.mockResolvedValue(LINHA_PESSOAL);

    const resultado = await entregar({
      event: 'session.status',
      session: 'vendedor-1a2b3c4d',
      me: { id: '5562988887777@c.us' },
      payload: { status: 'WORKING' },
    });

    expect(resultado).toBe('processado');
    expect(db.channelConfigFindFirst).toHaveBeenCalledWith({ where: { canal: 'WHATSAPP', ponteSessao: 'vendedor-1a2b3c4d' } });
    expect(db.channelConfigUpdate).toHaveBeenCalledWith({
      where: { id: 'linha-1' },
      data: expect.objectContaining({ ponteStatus: 'CONECTADO' }),
    });
    expect(hub.notificarStatusCanal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'linha-1', status: 'CONECTADO', detalhe: 'WORKING' }),
      { agenteId: 'vendedor-1' },
    );
  });

  it('session.status STARTING nao grava nada (subindo nao e nem conectado nem caido)', async () => {
    db.channelConfigFindFirst.mockResolvedValue(LINHA_PESSOAL);
    await entregar({ event: 'session.status', session: 'vendedor-1a2b3c4d', payload: { status: 'STARTING' } });
    expect(db.channelConfigUpdate).not.toHaveBeenCalled();
  });
});
