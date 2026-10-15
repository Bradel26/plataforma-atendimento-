import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fecharOportunidadeSchema } from './opportunities.schemas';

const { opportunityFindFirst, opportunityUpdate, activityUpdateMany, activityGroupBy, transaction } = vi.hoisted(() => ({
  opportunityFindFirst: vi.fn(),
  opportunityUpdate: vi.fn(),
  activityUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  activityGroupBy: vi.fn().mockResolvedValue([]),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      opportunity: { update: opportunityUpdate },
      activity: { updateMany: activityUpdateMany },
    }),
  ),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    opportunity: { findFirst: opportunityFindFirst },
    activity: { groupBy: activityGroupBy },
    funnelStage: { findUnique: vi.fn() },
    $transaction: transaction,
  },
}));

vi.mock('../../lib/visibilidade', () => ({ apenasVisivel: (id: string) => ({ id }) }));
vi.mock('../../lib/politicas', () => ({
  filtroDe: vi.fn().mockResolvedValue({}),
  politicaOportunidades: { filtro: () => ({}) },
  politicaContas: { filtro: () => ({}) },
  exigirUsuarioDaOrganizacao: vi.fn(),
}));
vi.mock('./crm.serializers', () => ({
  toOportunidade: (o: unknown) => o,
  inclusaoOportunidade: {},
}));
vi.mock('./etapas', () => ({
  tarefasDeEtapaAbertas: vi.fn().mockResolvedValue([]),
  comTarefaDeEtapa: (oportunidades: unknown[]) => oportunidades,
  conferirEtapaLiberada: vi.fn(),
  ehAvanco: vi.fn(),
  garantirTarefaDaEtapa: vi.fn(),
}));
vi.mock('./campos-customizados.service', () => ({
  valoresDoRegistro: vi.fn().mockResolvedValue({}),
  confirmarValoresDoRegistro: vi.fn(),
  prepararValoresDoRegistro: vi.fn(),
}));
const { registrarAuditoria } = vi.hoisted(() => ({ registrarAuditoria: vi.fn() }));
vi.mock('./auditoria', () => ({
  registrarAuditoria,
  diferencasDaOportunidade: vi.fn(),
  trilhaDaOportunidade: vi.fn(),
}));

import { fecharOportunidade, reabrirOportunidade } from './opportunities.service';

describe('fecharOportunidadeSchema', () => {
  it('aceita DESCARTADA sem exigir motivoPerda', () => {
    const resultado = fecharOportunidadeSchema.safeParse({ status: 'DESCARTADA' });
    expect(resultado.success).toBe(true);
  });
});

describe('fecharOportunidade', () => {
  it('fechar com status DESCARTADA grava motivoPerda nulo e fechadoEm preenchido', async () => {
    opportunityFindFirst.mockResolvedValueOnce({ id: 'op-1', status: 'ABERTA', aprovacaoDesconto: 'NAO_REQUER', estagioId: 'e-1' });
    opportunityUpdate.mockResolvedValueOnce({ id: 'op-1', status: 'DESCARTADA' });

    await fecharOportunidade('op-1', { status: 'DESCARTADA' });

    expect(opportunityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DESCARTADA', motivoPerda: null }),
      }),
    );
    const dados = opportunityUpdate.mock.calls[0]?.[0]?.data;
    expect(dados.fechadoEm).toBeInstanceOf(Date);
  });
});

describe('reabrirOportunidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activityUpdateMany.mockResolvedValue({ count: 0 });
    activityGroupBy.mockResolvedValue([]);
  });

  it('aceita uma oportunidade DESCARTADA, nao so PERDIDA', async () => {
    opportunityFindFirst
      .mockResolvedValueOnce({ id: 'op-1', status: 'DESCARTADA' })
      .mockResolvedValueOnce({ id: 'op-1', status: 'ABERTA', qualificacao: null });

    await expect(reabrirOportunidade('op-1')).resolves.toBeDefined();

    expect(opportunityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ABERTA' }) }),
    );
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      'op-1',
      [{ campo: 'STATUS', de: 'DESCARTADA', para: 'ABERTA' }],
    );
  });

  it('continua recusando uma oportunidade GANHA', async () => {
    opportunityFindFirst.mockResolvedValueOnce({ id: 'op-1', status: 'GANHA' });

    await expect(reabrirOportunidade('op-1')).rejects.toMatchObject({ status: 400 });
    expect(opportunityUpdate).not.toHaveBeenCalled();
  });
});
