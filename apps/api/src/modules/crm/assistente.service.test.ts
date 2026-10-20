import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contactCount: vi.fn(), contactFindMany: vi.fn(),
  accountCount: vi.fn(), accountFindMany: vi.fn(),
  opportunityCount: vi.fn(), opportunityAggregate: vi.fn(), opportunityFindMany: vi.fn(),
  activityCount: vi.fn(), activityFindMany: vi.fn(),
  callCount: vi.fn(), callFindMany: vi.fn(),
  filtroDe: vi.fn(),
}));

vi.mock('../../env', () => ({ env: {
  CRM_IA_OLLAMA_URL: 'http://ollama.local:11434',
  CRM_IA_OLLAMA_MODELO: 'qwen3:4b',
  OPORTUNIDADE_IA_OLLAMA_URL: undefined,
  OPORTUNIDADE_IA_OLLAMA_MODELO: 'qwen3:4b',
} }));
vi.mock('../../lib/prisma', () => ({ prisma: {
  contact: { count: mocks.contactCount, findMany: mocks.contactFindMany },
  account: { count: mocks.accountCount, findMany: mocks.accountFindMany },
  opportunity: { count: mocks.opportunityCount, aggregate: mocks.opportunityAggregate, findMany: mocks.opportunityFindMany },
  activity: { count: mocks.activityCount, findMany: mocks.activityFindMany },
  call: { count: mocks.callCount, findMany: mocks.callFindMany },
} }));
vi.mock('../../lib/politicas', () => ({
  filtroDe: mocks.filtroDe,
  politicaAtividades: {}, politicaContas: {}, politicaContatos: {}, politicaOportunidades: {},
}));

import { perguntarAoAssistenteCrm } from './assistente.service';

const respostaOllama = (content: unknown) => new Response(JSON.stringify({ message: { content: JSON.stringify(content) } }), { status: 200 });

describe('assistente de consultas do CRM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filtroDe.mockResolvedValue({ id: { in: ['permitido-pela-politica'] } });
    mocks.contactCount.mockResolvedValue(4);
    mocks.contactFindMany.mockResolvedValue([{ nome: 'Contato visível', criadoEm: new Date('2026-10-16T12:00:00Z') }]);
  });

  it('aplica a política de contato antes de pedir ao modelo que responda', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respostaOllama({ entidade: 'contatos', metrica: 'lista', situacao: 'TODAS', busca: null, periodoDias: 30 }))
      .mockResolvedValueOnce(respostaOllama('Há quatro contatos no período consultado.'));
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await perguntarAoAssistenteCrm(
      'Quais contatos foram cadastrados nos últimos 30 dias?',
      undefined,
      { usuarioId: 'usuario-teste', perfil: 'ADMIN', podeTelefonia: true },
    );

    expect(resultado.resposta).toContain('quatro contatos');
    expect(resultado.total).toBe(4);
    expect(mocks.contactCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ id: { in: ['permitido-pela-politica'] } })]) }),
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('consulta oportunidades abertas com valor total usando filtros fixos', async () => {
    mocks.opportunityCount.mockResolvedValue(2);
    mocks.opportunityAggregate.mockResolvedValue({ _sum: { valor: 1500 } });
    mocks.opportunityFindMany.mockResolvedValue([{ titulo: 'Renovação', valor: 1500, status: 'ABERTA', conta: { nomeFantasia: 'Empresa X', razaoSocial: null } }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respostaOllama({ entidade: 'oportunidades', metrica: 'valor_total', situacao: 'ABERTAS', busca: null, periodoDias: null }))
      .mockResolvedValueOnce(respostaOllama('Existem duas oportunidades abertas, somando R$ 1.500.'));
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await perguntarAoAssistenteCrm(
      'Qual o valor total das oportunidades abertas?',
      undefined,
      { usuarioId: 'usuario-teste', perfil: 'ADMIN', podeTelefonia: true },
    );

    expect('valorTotal' in resultado ? resultado.valorTotal : null).toBe(1500);
    expect(mocks.opportunityAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ status: 'ABERTA' })]) }),
    }));
    vi.unstubAllGlobals();
  });

  it('responde contagem direta de oportunidades abertas sem chamar o Ollama', async () => {
    mocks.opportunityCount.mockResolvedValue(12);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await perguntarAoAssistenteCrm(
      'Quantas oportunidades abertas existem?',
      undefined,
      { usuarioId: 'usuario-teste', perfil: 'ADMIN', podeTelefonia: true },
    );

    expect(resultado).toEqual({
      resposta: 'Existem 12 oportunidades abertas no CRM.',
      fonte: 'oportunidades',
      total: 12,
      motor: 'crm-direto',
    });
    expect(mocks.opportunityCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ status: 'ABERTA' })]) }),
    }));
    expect(mocks.opportunityAggregate).not.toHaveBeenCalled();
    expect(mocks.opportunityFindMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
