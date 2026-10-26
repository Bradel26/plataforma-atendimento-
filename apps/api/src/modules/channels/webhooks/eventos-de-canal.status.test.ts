import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registrarStatusDeEntrega`: o ack (WAHA/GOWA/Baileys/WPPConnect, ja
 * traduzido para `StatusDeEntrega`) precisa achar a mensagem por `idExterno`,
 * gravar e avisar o painel — mas NUNCA regredir um status que ja avancou mais
 * (ex.: LIDA nao pode voltar a ENTREGUE so porque um webhook chegou fora de
 * ordem, o que e comum em reentrega).
 */

const db = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  messageUpdate: vi.fn(),
  conversationFindUnique: vi.fn(),
  channelConfigFindFirst: vi.fn(),
  channelConfigUpdate: vi.fn(),
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: db.messageFindUnique, update: db.messageUpdate },
    conversation: { findUnique: db.conversationFindUnique },
    channelConfig: { findFirst: db.channelConfigFindFirst, update: db.channelConfigUpdate },
  },
  prismaSemIsolamento: { channelConfig: { findFirst: vi.fn() } },
}));

const hub = vi.hoisted(() => ({
  notificarMensagemStatus: vi.fn(),
  notificarStatusCanal: vi.fn(),
}));
vi.mock('../../../realtime/hub', () => hub);

import { registrarEstadoDaSessao, registrarStatusDeEntrega } from './eventos-de-canal';

const CONTEXTO = { provider: 'waha', organizacaoId: 'org-1' };

beforeEach(() => {
  vi.clearAllMocks();
  db.conversationFindUnique.mockResolvedValue({ filaId: 'fila-1', agenteId: 'agente-1' });
  db.channelConfigFindFirst.mockResolvedValue({
    id: 'canal-1', ponteSessao: 'vendedor-1', donoId: 'agente-1', ponteConectadoEm: new Date(),
  });
});

describe('registrarEstadoDaSessao', () => {
  it('persiste a desconexao e envia o motivo ao responsavel da linha', async () => {
    const resultado = await registrarEstadoDaSessao('vendedor-1', {
      estado: 'DESCONECTADO', detalhe: 'WhatsApp desconectado: CONFLICT', telefone: null,
    }, CONTEXTO);

    expect(resultado).toBe('processado');
    expect(db.channelConfigFindFirst).toHaveBeenCalledWith({
      where: { canal: 'WHATSAPP', ponteSessao: 'vendedor-1' },
    });
    expect(db.channelConfigUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'canal-1' }, data: expect.objectContaining({ ponteStatus: 'DESCONECTADO' }),
    }));
    expect(hub.notificarStatusCanal).toHaveBeenCalledWith(expect.objectContaining({
      id: 'canal-1', status: 'DESCONECTADO', detalhe: 'WhatsApp desconectado: CONFLICT',
    }), { agenteId: 'agente-1' });
  });
});

describe('registrarStatusDeEntrega', () => {
  it('idExterno desconhecido: ignora sem gravar nem avisar', async () => {
    db.messageFindUnique.mockResolvedValue(null);

    const resultado = await registrarStatusDeEntrega('id-fantasma', 'ENTREGUE', CONTEXTO);

    expect(resultado).toBe('ignorado');
    expect(db.messageUpdate).not.toHaveBeenCalled();
    expect(hub.notificarMensagemStatus).not.toHaveBeenCalled();
  });

  it('progressao normal (sem status anterior -> ENVIADA): grava e avisa', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'm-1', conversaId: 'c-1', status: null, interno: false });

    const resultado = await registrarStatusDeEntrega('X1', 'ENVIADA', CONTEXTO);

    expect(resultado).toBe('processado');
    expect(db.messageUpdate).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { status: 'ENVIADA' } });
    expect(hub.notificarMensagemStatus).toHaveBeenCalledWith(
      { conversaId: 'c-1', mensagemId: 'm-1', idExterno: 'X1', status: 'ENVIADA' },
      { conversaId: 'c-1', filaId: 'fila-1', agenteId: 'agente-1', incluirSalaDaConversa: true },
    );
  });

  it('progressao normal (ENTREGUE -> LIDA): grava e avisa', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'm-1', conversaId: 'c-1', status: 'ENTREGUE', interno: false });

    const resultado = await registrarStatusDeEntrega('X1', 'LIDA', CONTEXTO);

    expect(resultado).toBe('processado');
    expect(db.messageUpdate).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { status: 'LIDA' } });
  });

  it('fora de ordem (ja LIDA, chega ENTREGUE de uma reentrega): ignora sem regredir', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'm-1', conversaId: 'c-1', status: 'LIDA', interno: false });

    const resultado = await registrarStatusDeEntrega('X1', 'ENTREGUE', CONTEXTO);

    expect(resultado).toBe('ignorado');
    expect(db.messageUpdate).not.toHaveBeenCalled();
    expect(hub.notificarMensagemStatus).not.toHaveBeenCalled();
  });

  it('mesmo status repetido (reentrega identica): ignora sem regredir nem reavisar', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'm-1', conversaId: 'c-1', status: 'ENTREGUE', interno: false });

    const resultado = await registrarStatusDeEntrega('X1', 'ENTREGUE', CONTEXTO);

    expect(resultado).toBe('duplicado');
    expect(db.messageUpdate).not.toHaveBeenCalled();
    expect(hub.notificarMensagemStatus).not.toHaveBeenCalled();
  });

  it('nota interna: avisa mas exclui a sala da conversa (nunca sai pelo canal externo)', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'm-1', conversaId: 'c-1', status: null, interno: true });

    await registrarStatusDeEntrega('X1', 'ENVIADA', CONTEXTO);

    expect(hub.notificarMensagemStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ incluirSalaDaConversa: false }),
    );
  });
});
