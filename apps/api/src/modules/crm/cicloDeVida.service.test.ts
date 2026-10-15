import { describe, expect, it, vi } from 'vitest';

const { contactFindMany, opportunityGroupBy, leadGroupBy, conversationGroupBy } = vi.hoisted(() => ({
  contactFindMany: vi.fn(),
  opportunityGroupBy: vi.fn().mockResolvedValue([]),
  leadGroupBy: vi.fn().mockResolvedValue([]),
  conversationGroupBy: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    contact: { findMany: contactFindMany },
    opportunity: { groupBy: opportunityGroupBy },
    lead: { groupBy: leadGroupBy },
    conversation: { groupBy: conversationGroupBy },
  },
}));

import { fatosDosContatos } from './cicloDeVida.service';

describe('fatosDosContatos', () => {
  it('conta de oportunidadesPerdidas inclui oportunidades DESCARTADA, para o ciclo cair em PERDIDO em vez de voltar a um degrau mais baixo', async () => {
    contactFindMany.mockResolvedValueOnce([{ id: 'contato-1', contaId: 'conta-1' }]);
    // porConta('GANHA'), porConta('ABERTA'), porConta(['PERDIDA','DESCARTADA']) --
    // so a DESCARTADA (status real da oportunidade, sem linha nenhuma em 'PERDIDA').
    opportunityGroupBy
      .mockResolvedValueOnce([]) // GANHA
      .mockResolvedValueOnce([]) // ABERTA
      .mockResolvedValueOnce([{ contaId: 'conta-1', _count: { _all: 1 } }]); // PERDIDA | DESCARTADA

    const fatos = await fatosDosContatos({});

    expect(fatos.get('contato-1')?.oportunidadesPerdidas).toBe(1);
    // A consulta combinada tem de pedir os dois valores, nao so 'PERDIDA'.
    expect(opportunityGroupBy.mock.calls[2]?.[0]?.where).toMatchObject({
      status: { in: ['PERDIDA', 'DESCARTADA'] },
    });
  });
});
