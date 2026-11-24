import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  lead: vi.fn(), contact: vi.fn(), account: vi.fn(), opportunity: vi.fn(), ticket: vi.fn(), conversation: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    lead: { findMany: m.lead },
    contact: { findMany: m.contact },
    account: { findMany: m.account },
    opportunity: { findMany: m.opportunity },
    ticket: { findMany: m.ticket },
    conversation: { findMany: m.conversation },
  },
}));

/*
 * `filtroDe(politica)` devolve um marcador reconhecivel por politica: se a
 * exportacao nao o usar no `where`, o teste falha. Assim prova-se que cada CSV
 * passa pela MESMA politica de visibilidade das listas (que e por perfil).
 */
vi.mock('../../lib/politicas', async () => {
  const nomes = ['Contas', 'Contatos', 'Conversas', 'Leads', 'Oportunidades', 'Protocolos'] as const;
  const politicas = Object.fromEntries(nomes.map((n) => [`politica${n}`, { __politica: n }]));
  return {
    ...politicas,
    filtroDe: vi.fn(async (p: { __politica: string }) => ({ __escopo: p.__politica })),
  };
});

import {
  exportarContas, exportarContatos, exportarConversas, exportarLeads, exportarOportunidades, exportarProtocolos,
} from './dados.service';

const dentroDoWhere = (mock: ReturnType<typeof vi.fn>) => JSON.stringify(mock.mock.calls[0]?.[0]?.where ?? null);

describe('exportacoes CSV respeitam a politica de visibilidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const f of Object.values(m)) f.mockResolvedValue([]);
  });

  it.each([
    ['leads', exportarLeads, () => m.lead, 'Leads'],
    ['contatos', exportarContatos, () => m.contact, 'Contatos'],
    ['contas', exportarContas, () => m.account, 'Contas'],
    ['oportunidades', exportarOportunidades, () => m.opportunity, 'Oportunidades'],
    ['protocolos', exportarProtocolos, () => m.ticket, 'Protocolos'],
    ['conversas', exportarConversas, () => m.conversation, 'Conversas'],
  ] as const)('%s filtra pela politica de %s', async (_nome, exportar, mock, politica) => {
    await exportar();
    expect(dentroDoWhere(mock())).toContain(`"__escopo":"${politica}"`);
  });

  it('contatos excluidos (lixeira) nao saem no CSV', async () => {
    await exportarContatos();
    expect(dentroDoWhere(m.contact)).toContain('"excluidoEm":null');
  });
});
