import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A tela registra a chamada em eventos seguidos (Chamando, Em ligacao). Duas requisicoes quase
 * simultaneas viam "nao existe" e as duas criavam: a segunda violava `id_externo` e virava
 * "Erro interno do servidor" na tela, embora a ligacao tivesse acontecido.
 */

const m = vi.hoisted(() => ({
  callFindFirst: vi.fn(),
  callCreate: vi.fn(),
  callUpdate: vi.fn(),
  callFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
}));
vi.mock('../../lib/prisma', () => ({
  prisma: {
    call: { findFirst: m.callFindFirst, create: m.callCreate, update: m.callUpdate, findUnique: m.callFindUnique },
    contact: { findFirst: m.contactFindFirst, findMany: m.contactFindMany },
  },
}));
vi.mock('../../lib/storage', () => ({ salvar: vi.fn() }));
vi.mock('../../realtime/hub', () => ({ notificarChamada: vi.fn() }));

import { salvarRegistroChamadaWebJs } from './webjs-call-history.service';

const entrada = (status: 'CHAMANDO' | 'EM_ANDAMENTO') => ({
  callId: 'abc',
  sessao: 'vendedor-x',
  direcao: 'SAINTE' as const,
  telefone: '5562992885001',
  status: status as never,
  canalConfig: { id: 'cfg', donoId: 'u1', filaId: null, nome: 'Linha Kaua' },
  agenteId: 'u1',
});

const violacaoUnica = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`id_externo`)', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('salvarRegistroChamadaWebJs: registros simultaneos da mesma chamada', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    m.contactFindFirst.mockResolvedValue(null);
    m.contactFindMany.mockResolvedValue([]);
    m.callFindUnique.mockResolvedValue({ id: 'c1', agenteId: 'u1', filaId: null });
  });

  it('segunda requisicao perde a corrida no create: atualiza o registro da outra, sem erro', async () => {
    m.callFindFirst
      .mockResolvedValueOnce(null) // nao existia quando olhou
      .mockResolvedValueOnce({ id: 'c1', gravacaoUrl: null }); // a outra ja tinha criado
    m.callCreate.mockRejectedValue(violacaoUnica());
    m.callUpdate.mockResolvedValue({ id: 'c1' });

    const r = await salvarRegistroChamadaWebJs(entrada('EM_ANDAMENTO'));

    expect(r.chamadaId).toBe('c1');
    expect(m.callUpdate).toHaveBeenCalledTimes(1);
    expect(m.callUpdate.mock.calls[0]![0]).toMatchObject({ where: { id: 'c1' }, data: { status: 'EM_ANDAMENTO' } });
  });

  it('outro erro do banco continua subindo', async () => {
    m.callFindFirst.mockResolvedValue(null);
    m.callCreate.mockRejectedValue(new Error('banco fora'));
    await expect(salvarRegistroChamadaWebJs(entrada('CHAMANDO'))).rejects.toThrow('banco fora');
  });

  it('P2002 sem registro para reler: o erro original sobe (nada de mascarar)', async () => {
    m.callFindFirst.mockResolvedValue(null);
    m.callCreate.mockRejectedValue(violacaoUnica());
    await expect(salvarRegistroChamadaWebJs(entrada('CHAMANDO'))).rejects.toThrow(/Unique constraint/);
  });

  it('caminho normal: cria uma vez e nao atualiza', async () => {
    m.callFindFirst.mockResolvedValue(null);
    m.callCreate.mockResolvedValue({ id: 'c1' });
    const r = await salvarRegistroChamadaWebJs(entrada('CHAMANDO'));
    expect(r.chamadaId).toBe('c1');
    expect(m.callCreate).toHaveBeenCalledTimes(1);
    expect(m.callUpdate).not.toHaveBeenCalled();
  });
});
