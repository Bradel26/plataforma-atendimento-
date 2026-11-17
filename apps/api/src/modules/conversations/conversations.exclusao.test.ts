import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Exclusao definitiva de conversa (Auditoria, so ADMIN). O que se prova: apaga dentro da transacao junto do
 * registro de LGPD, tira os arquivos do disco so depois do commit, e nao faz nada quando a conversa nao existe.
 */

const m = vi.hoisted(() => ({
  convFindFirst: vi.fn(),
  msgFindMany: vi.fn(),
  deleteMany: vi.fn(),
  lgpdCreate: vi.fn(),
  transaction: vi.fn(),
  remover: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    conversation: { findFirst: m.convFindFirst },
    message: { findMany: m.msgFindMany },
    $transaction: m.transaction,
  },
}));
vi.mock('../../lib/storage', () => ({ remover: m.remover }));

import { excluirConversa, excluirConversaSchema } from './conversations.exclusao';

const conversa = {
  id: 'c1',
  protocolo: '261117-00005',
  canal: 'WHATSAPP',
  status: 'FINALIZADO',
  contatoId: 'ct1',
  criadoEm: new Date('2026-11-17T13:14:35Z'),
  finalizadoEm: new Date('2026-11-17T14:41:12Z'),
  canalConfig: { nome: null, ponteSessao: 'vendedor-97f997ed' },
  _count: { mensagens: 3 },
};

describe('excluirConversa', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ conversation: { deleteMany: m.deleteMany }, lgpdLog: { create: m.lgpdCreate } }),
    );
    m.msgFindMany.mockResolvedValue([]);
  });

  it('apaga a conversa e grava o registro de LGPD na mesma transacao', async () => {
    m.convFindFirst.mockResolvedValue(conversa);

    const r = await excluirConversa('c1', 'limpeza de linha desconectada', 'admin-1');

    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(m.lgpdCreate).toHaveBeenCalledTimes(1);
    const dado = m.lgpdCreate.mock.calls[0]![0].data;
    expect(dado).toMatchObject({ acao: 'EXPURGO', autorId: 'admin-1', contatoId: 'ct1' });
    expect(dado.detalhe).toMatchObject({
      origem: 'auditoria-de-conversas',
      protocolo: '261117-00005',
      linha: 'vendedor-97f997ed',
      mensagens: 3,
      motivo: 'limpeza de linha desconectada',
    });
    expect(r).toEqual({ id: 'c1', protocolo: '261117-00005', mensagens: 3, arquivosApagados: 0 });
  });

  it('conversa inexistente: 404 e nada e apagado nem registrado', async () => {
    m.convFindFirst.mockResolvedValue(null);
    await expect(excluirConversa('nao-existe', 'motivo qualquer', 'admin-1')).rejects.toMatchObject({ status: 404 });
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.remover).not.toHaveBeenCalled();
  });

  it('remove do disco so os anexos internos, depois do commit, e conta quantos saíram', async () => {
    m.convFindFirst.mockResolvedValue(conversa);
    m.msgFindMany.mockResolvedValue([
      { anexoUrl: '/api/arquivos/org/2026/11/a.ogg' },
      { anexoUrl: 'https://cdn.externo.com/b.jpg' }, // link externo: nao e do storage
      { anexoUrl: '/api/arquivos/org/2026/11/c.jpg' },
    ]);
    const ordem: string[] = [];
    m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      await fn({ conversation: { deleteMany: m.deleteMany }, lgpdLog: { create: m.lgpdCreate } });
      ordem.push('commit');
    });
    m.remover.mockImplementation(async () => { ordem.push('remover'); });

    const r = await excluirConversa('c1', 'limpeza de linha desconectada', 'admin-1');

    expect(m.remover.mock.calls.map((c) => c[0])).toEqual(['org/2026/11/a.ogg', 'org/2026/11/c.jpg']);
    expect(ordem).toEqual(['commit', 'remover', 'remover']);
    expect(r.arquivosApagados).toBe(2);
    expect(m.lgpdCreate.mock.calls[0]![0].data.detalhe.arquivos).toBe(2);
  });

  it('arquivo que nao da para remover nao desfaz a exclusao', async () => {
    m.convFindFirst.mockResolvedValue(conversa);
    m.msgFindMany.mockResolvedValue([{ anexoUrl: '/api/arquivos/x/a.ogg' }, { anexoUrl: '/api/arquivos/x/b.ogg' }]);
    m.remover.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);

    const r = await excluirConversa('c1', 'limpeza de linha desconectada', 'admin-1');

    expect(r.arquivosApagados).toBe(1);
    expect(m.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('falha na transacao: nenhum arquivo e removido', async () => {
    m.convFindFirst.mockResolvedValue(conversa);
    m.msgFindMany.mockResolvedValue([{ anexoUrl: '/api/arquivos/x/a.ogg' }]);
    m.transaction.mockRejectedValue(new Error('banco fora'));

    await expect(excluirConversa('c1', 'limpeza de linha desconectada', 'admin-1')).rejects.toThrow('banco fora');
    expect(m.remover).not.toHaveBeenCalled();
  });
});

describe('excluirConversaSchema', () => {
  it('exige motivo com no minimo 8 caracteres', () => {
    expect(excluirConversaSchema.safeParse({}).success).toBe(false);
    expect(excluirConversaSchema.safeParse({ motivo: 'curto' }).success).toBe(false);
    expect(excluirConversaSchema.safeParse({ motivo: '   ok   ' }).success).toBe(false);
    expect(excluirConversaSchema.safeParse({ motivo: 'motivo valido' }).success).toBe(true);
  });
});
