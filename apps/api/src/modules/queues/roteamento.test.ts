import { describe, expect, it } from 'vitest';
import { escolherAgenteDaFila, type CandidatoDeFila } from './roteamento';

const c = (nome: string, extra: Partial<CandidatoDeFila> = {}): CandidatoDeFila => ({
  id: nome, nome, status: 'DISPONIVEL', conversasAtivas: 0, ultimaAtribuicaoEm: null, ...extra,
});

describe('escolherAgenteDaFila', () => {
  it('escolhe quem tem menos conversas ativas', () => {
    const r = escolherAgenteDaFila([c('Ana', { conversasAtivas: 3 }), c('Bia', { conversasAtivas: 1 })]);
    expect(r.sugerido?.nome).toBe('Bia');
  });

  it('no empate de carga, quem recebeu ha mais tempo (rodizio); quem nunca recebeu vem antes', () => {
    const r = escolherAgenteDaFila([
      c('Ana', { ultimaAtribuicaoEm: new Date('2026-11-24T10:00:00Z') }),
      c('Bia', { ultimaAtribuicaoEm: new Date('2026-11-24T09:00:00Z') }),
      c('Caio'),
    ]);
    expect(r.elegiveis.map((x) => x.nome)).toEqual(['Caio', 'Bia', 'Ana']);
  });

  it('ignora quem nao esta DISPONIVEL e explica o motivo', () => {
    const r = escolherAgenteDaFila([c('Ana', { status: 'PAUSA' }), c('Bia', { status: 'OFFLINE' }), c('Caio', { status: 'EM_ATENDIMENTO' })]);
    expect(r.sugerido).toBeNull();
    expect(r.excluidos.every((x) => x.motivo === 'indisponivel')).toBe(true);
  });

  it('respeita a capacidade maxima', () => {
    const r = escolherAgenteDaFila([c('Ana', { conversasAtivas: 5 }), c('Bia', { conversasAtivas: 2 })], 5);
    expect(r.sugerido?.nome).toBe('Bia');
    expect(r.excluidos).toEqual([{ id: 'Ana', nome: 'Ana', motivo: 'capacidade' }]);
    expect(escolherAgenteDaFila([c('Ana', { conversasAtivas: 2 })], 2).sugerido).toBeNull();
  });

  it('por padrao nao ha limite de conversas por agente', () => {
    const r = escolherAgenteDaFila([c('Ana', { conversasAtivas: 500 })]);
    expect(r.sugerido?.nome).toBe('Ana');
  });

  it('fila vazia nao sugere ninguem', () => {
    expect(escolherAgenteDaFila([]).sugerido).toBeNull();
  });
});
