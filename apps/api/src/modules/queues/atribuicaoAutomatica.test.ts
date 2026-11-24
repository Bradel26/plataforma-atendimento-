import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  conversaFind: vi.fn(),
  conversaUpdateMany: vi.fn(),
  conversaFindMany: vi.fn(),
  queueFind: vi.fn(),
  msgCreate: vi.fn(),
  sugestao: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: m.conversaFind, updateMany: m.conversaUpdateMany, findMany: m.conversaFindMany },
    queue: { findUnique: m.queueFind },
    queueAgent: { findMany: vi.fn().mockResolvedValue([]) },
    message: { create: m.msgCreate },
  },
}));
vi.mock('../../realtime/hub', () => ({ notificarConversaAtualizada: vi.fn() }));
vi.mock('../conversations/conversations.serializer', () => ({
  inclusaoDetalhe: {},
  semNotasInternas: (x: unknown) => x,
  toConversaDetalhe: (x: unknown) => x,
}));
vi.mock('./queues.service', () => ({ calcularSugestaoDaFila: m.sugestao }));

import { atribuirAutomaticamente } from './atribuicaoAutomatica';

const emEspera = { id: 'c1', status: 'EM_ESPERA', agenteId: null, filaId: 'f1', arquivada: false, canalConfig: null };

describe('atribuirAutomaticamente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.conversaFind.mockResolvedValue(emEspera);
    m.queueFind.mockResolvedValue({ ativa: true, atribuicaoAutomatica: true });
    m.sugestao.mockResolvedValue({ sugerido: { id: 'u1', nome: 'Ana' }, elegiveis: [], excluidos: [] });
    m.conversaUpdateMany.mockResolvedValue({ count: 1 });
    m.msgCreate.mockResolvedValue({});
  });

  it('com a fila ligada e alguem disponivel, atribui e registra o evento', async () => {
    const r = await atribuirAutomaticamente('c1');
    expect(r).toEqual({ atribuida: true, agenteId: 'u1' });
    expect(m.conversaUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'c1', status: 'EM_ESPERA', agenteId: null },
      data: { agenteId: 'u1', status: 'ATRIBUIDO' },
    });
    expect(m.msgCreate).toHaveBeenCalledOnce();
  });

  it('desligada por padrao: nao atribui', async () => {
    m.queueFind.mockResolvedValue({ ativa: true, atribuicaoAutomatica: false });
    expect(await atribuirAutomaticamente('c1')).toEqual({ atribuida: false, motivo: 'automatica-desligada' });
    expect(m.conversaUpdateMany).not.toHaveBeenCalled();
  });

  it('ninguem disponivel: a conversa continua em espera', async () => {
    m.sugestao.mockResolvedValue({ sugerido: null, elegiveis: [], excluidos: [] });
    expect(await atribuirAutomaticamente('c1')).toEqual({ atribuida: false, motivo: 'ninguem-disponivel' });
    expect(m.conversaUpdateMany).not.toHaveBeenCalled();
  });

  it('linha pessoal nunca passa pela distribuicao', async () => {
    m.conversaFind.mockResolvedValue({ ...emEspera, canalConfig: { donoId: 'dono' } });
    expect((await atribuirAutomaticamente('c1')).motivo).toBe('linha-pessoal');
  });

  it('conversa ja atribuida ou finalizada nao e tocada', async () => {
    m.conversaFind.mockResolvedValue({ ...emEspera, status: 'ATRIBUIDO', agenteId: 'u9' });
    expect((await atribuirAutomaticamente('c1')).motivo).toBe('nao-esta-em-espera');
  });

  it('se outro atendente assumiu no meio, nao sobrescreve', async () => {
    m.conversaUpdateMany.mockResolvedValue({ count: 0 });
    expect(await atribuirAutomaticamente('c1')).toEqual({ atribuida: false, motivo: 'assumida-por-outro' });
    expect(m.msgCreate).not.toHaveBeenCalled();
  });

  it('nunca lanca: erro vira resultado', async () => {
    m.conversaFind.mockRejectedValue(new Error('banco fora'));
    expect(await atribuirAutomaticamente('c1')).toEqual({ atribuida: false, motivo: 'erro' });
  });
});
