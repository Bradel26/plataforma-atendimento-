import { describe, expect, it } from 'vitest';
import { planejarRetomada } from './retomadaEmLote';

const p = (id: string, contatoId: string, responsavelId: string | null) => ({ id, contatoId, responsavelId });

describe('planejarRetomada', () => {
  it('cria so para quem tem responsavel e ainda nao tem tarefa aberta', () => {
    const plano = planejarRetomada(
      ['a', 'b', 'c', 'x'],
      [p('a', 'c1', 'u1'), p('b', 'c2', null), p('c', 'c3', 'u1')],
      new Set(['c3']),
    );
    expect(plano.criar).toEqual(['a']);
    expect(plano.semResponsavel).toEqual(['b']);
    expect(plano.jaTemTarefa).toEqual(['c']);
    expect(plano.naoEncontrados).toEqual(['x']);
  });

  it('o mesmo contato nas duas esteiras ganha uma tarefa so', () => {
    const plano = planejarRetomada(['a', 'b'], [p('a', 'c1', 'u1'), p('b', 'c1', 'u1')], new Set());
    expect(plano.criar).toEqual(['a']);
    expect(plano.jaTemTarefa).toEqual(['b']);
  });

  it('a soma das faixas e o total de ids unicos', () => {
    const plano = planejarRetomada(['a', 'a', 'b'], [p('a', 'c1', 'u1')], new Set());
    expect(plano.criar.length + plano.semResponsavel.length + plano.jaTemTarefa.length + plano.naoEncontrados.length).toBe(2);
  });
});
