import { describe, expect, it } from 'vitest';
import { resumirCustoEClassificacao } from './voice.service';

/**
 * Custo e classificacao da ligacao (item 6.6).
 *
 * O que erra aqui nao quebra: mostra uma media plausivel calculada sobre a base
 * errada. Media de custo dividida pelo total de chamadas, por exemplo, diz que
 * ligar custa menos do que custa — e ninguem confere isso de cabeca.
 */
describe('resumirCustoEClassificacao', () => {
  it('sem chamada nenhuma, tudo nulo — e nao zero', () => {
    const r = resumirCustoEClassificacao([]);
    expect(r.custoTotal).toBeNull();
    expect(r.custoMedio).toBeNull();
    expect(r.notaMedia).toBeNull();
    expect(r.total).toBe(0);
  });

  it('custo nulo em todas nao vira gasto zero', () => {
    /*
     * "O provedor nao informou" e diferente de "foi de graca". Somar como zero
     * faria a tela afirmar que a operacao de voz nao custa nada.
     */
    const r = resumirCustoEClassificacao([{ custo: null, classificacao: 4 }]);
    expect(r.custoTotal).toBeNull();
    expect(r.chamadasComCusto).toBe(0);
  });

  it('as duas medias saem de bases diferentes', () => {
    /*
     * Tres chamadas: duas com custo, uma com nota. Cada media divide pelo que
     * tem o dado, nao pelo total — misturar produziria um numero que nao
     * descreve nem uma coisa nem outra.
     */
    const r = resumirCustoEClassificacao([
      { custo: 0.1, classificacao: null },
      { custo: 0.3, classificacao: null },
      { custo: null, classificacao: 5 },
    ]);
    expect(r.custoTotal).toBe(0.4);
    expect(r.custoMedio).toBe(0.2);
    expect(r.chamadasComCusto).toBe(2);
    expect(r.notaMedia).toBe(5);
    expect(r.chamadasComNota).toBe(1);
  });

  it('conta quantas faltam ouvir', () => {
    // E a fila de trabalho de quem classifica; sem ela, "nota media 5" com uma
    // chamada avaliada de cem parece resultado da operacao inteira.
    const r = resumirCustoEClassificacao([
      { custo: 0.1, classificacao: 5 },
      { custo: 0.1, classificacao: null },
      { custo: 0.1, classificacao: null },
    ]);
    expect(r.semNota).toBe(2);
    expect(r.notaMedia).toBe(5);
  });

  it('custo em fracao de centavo nao e arredondado para zero', () => {
    // Tarifa de voz e cobrada em milesimo: arredondar para dois zeraria o custo
    // de chamada curta, e a coluna passaria a dizer que ligar e de graca.
    const r = resumirCustoEClassificacao([{ custo: 0.0021, classificacao: null }]);
    expect(r.custoTotal).toBe(0.0021);
  });

  it('nota media com casas quebradas fica com duas casas', () => {
    const r = resumirCustoEClassificacao([
      { custo: null, classificacao: 4 },
      { custo: null, classificacao: 5 },
      { custo: null, classificacao: 5 },
    ]);
    expect(r.notaMedia).toBe(4.67);
  });
});
