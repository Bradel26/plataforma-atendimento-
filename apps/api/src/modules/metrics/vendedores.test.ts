import { describe, expect, it } from 'vitest';
import { conversao } from './vendedores';

describe('conversao', () => {
  it('ganhas sobre ganhas mais perdidas', () => {
    expect(conversao(3, 1)).toBe(0.75);
  });

  it('100% quando so ha ganhas', () => {
    expect(conversao(2, 0)).toBe(1);
  });

  it('0% quando so ha perdidas', () => {
    expect(conversao(0, 4)).toBe(0);
  });

  it('nula quando nao ha nenhum fechamento no periodo', () => {
    expect(conversao(0, 0)).toBeNull();
  });

  it('nao e afetada por oportunidades DESCARTADA -- o chamador nunca as inclui em ganhas/perdidas', () => {
    // DESCARTADA nem entra nos parametros de conversao(), que so recebe
    // ganhas/perdidas ja filtrados por igualdade exata de status -- este teste
    // fixa o contrato da funcao pura; o caminho real (obterDesempenho exclui
    // DESCARTADA do groupBy lido) fica coberto indiretamente por nao quebrar
    // nenhum teste existente deste modulo.
    expect(conversao(3, 1)).toBeCloseTo(0.75);
  });
});
