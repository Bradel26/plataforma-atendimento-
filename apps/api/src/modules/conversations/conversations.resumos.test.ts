import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, envMock } = vi.hoisted(() => ({
  findMany: vi.fn(),
  envMock: { LIGACAO_IA_OLLAMA_URL: 'http://ollama:11434', LIGACAO_IA_OLLAMA_MODELO: 'qwen3:1.7b', OPORTUNIDADE_IA_OLLAMA_URL: undefined, OPORTUNIDADE_IA_OLLAMA_MODELO: 'm' } as Record<string, string | undefined>,
}));
vi.mock('../../lib/prisma', () => ({ prisma: { message: { findMany }, resumoConversa: { findMany: vi.fn(), upsert: vi.fn() } } }));
vi.mock('../../env', () => ({ env: envMock }));

import { resumoDasUltimasHoras } from './conversations.resumos';

const AGORA = Date.parse('2026-11-27T18:00:00.000Z');
const msgs = [
  { autor: 'CLIENTE', conteudo: 'Preciso do credenciamento TIM' },
  { autor: 'AGENTE', conteudo: 'Envio a lista de documentos' },
];

describe('resumoDasUltimasHoras', () => {
  beforeEach(() => {
    findMany.mockReset();
    envMock.LIGACAO_IA_OLLAMA_URL = 'http://ollama:11434';
    vi.unstubAllGlobals();
  });

  it('consulta so as ultimas 2 horas, sem notas internas nem mensagens do sistema', async () => {
    findMany.mockResolvedValue([]);
    await resumoDasUltimasHoras('c1', 2, AGORA);
    const where = findMany.mock.calls[0]![0].where;
    expect(where.interno).toBe(false);
    expect(where.autor).toEqual({ not: 'SISTEMA' });
    expect(where.criadoEm.gte).toEqual(new Date(AGORA - 2 * 3600_000));
    expect(where.criadoEm.lte).toEqual(new Date(AGORA));
  });

  it('sem mensagens no periodo: motivo sem-mensagens e nao chama o modelo', async () => {
    findMany.mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await resumoDasUltimasHoras('c1', 2, AGORA);
    expect(r).toMatchObject({ texto: null, motivo: 'sem-mensagens', mensagens: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem modelo configurado: motivo indisponivel', async () => {
    findMany.mockResolvedValue(msgs);
    envMock.LIGACAO_IA_OLLAMA_URL = undefined;
    const r = await resumoDasUltimasHoras('c1', 2, AGORA);
    expect(r).toMatchObject({ texto: null, motivo: 'indisponivel', disponivel: false, mensagens: 2 });
  });

  it('modelo nao respondeu: motivo falha', async () => {
    findMany.mockResolvedValue(msgs);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const r = await resumoDasUltimasHoras('c1', 2, AGORA);
    expect(r).toMatchObject({ texto: null, motivo: 'falha', disponivel: true });
  });

  it('modelo respondeu: devolve o texto e o periodo', async () => {
    findMany.mockResolvedValue(msgs);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: JSON.stringify({ resumo: 'Cliente pediu o credenciamento TIM; documentos enviados.' }) } }),
      }),
    );
    const r = await resumoDasUltimasHoras('c1', 2, AGORA);
    expect(r).toMatchObject({ texto: 'Cliente pediu o credenciamento TIM; documentos enviados.', motivo: null, mensagens: 2 });
    expect(r.inicio).toBe(new Date(AGORA - 2 * 3600_000).toISOString());
    expect(r.fim).toBe(new Date(AGORA).toISOString());
  });
});
