import { describe, expect, it } from 'vitest';
import { planejarAtribuicao } from './atribuicaoEmLote';

describe('planejarAtribuicao', () => {
  it('atribui so quem nao tem responsavel e nunca troca o de ninguem', () => {
    const plano = planejarAtribuicao(
      ['a', 'b', 'c', 'x'],
      [
        { id: 'a', responsavelId: null },
        { id: 'b', responsavelId: 'u-1' },
        { id: 'c', responsavelId: null },
      ],
    );
    expect(plano.paraAtribuir).toEqual(['a', 'c']);
    expect(plano.jaTemResponsavel).toEqual(['b']);
    expect(plano.naoEncontrados).toEqual(['x']);
  });

  it('ids repetidos contam uma vez', () => {
    const plano = planejarAtribuicao(['a', 'a', 'a'], [{ id: 'a', responsavelId: null }]);
    expect(plano.paraAtribuir).toEqual(['a']);
  });

  it('a soma das tres faixas e o total de ids unicos pedidos', () => {
    const plano = planejarAtribuicao(['a', 'b', 'c'], [{ id: 'a', responsavelId: null }]);
    expect(plano.paraAtribuir.length + plano.jaTemResponsavel.length + plano.naoEncontrados.length).toBe(3);
  });
});
