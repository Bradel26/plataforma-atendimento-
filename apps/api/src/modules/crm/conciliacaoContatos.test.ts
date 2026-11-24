import { describe, expect, it } from 'vitest';
import { conciliarContatos } from './conciliacaoContatos';

describe('conciliarContatos', () => {
  it('fecha a soma com a faixa "sem operacao" (caso 822 = 110 + 673 + 39)', () => {
    const r = conciliarContatos({ total: 822, tim: 110, starlink: 673, ambas: 0 });
    expect(r.semOperacao).toBe(39);
    expect(r.somaFaixas).toBe(822);
    expect(r.diferenca).toBe(0);
    expect(r.consistente).toBe(true);
  });

  it('nao conta duas vezes quem esta nas duas operacoes', () => {
    const r = conciliarContatos({ total: 100, tim: 40, starlink: 30, ambas: 10 });
    expect(r.somenteTim).toBe(30);
    expect(r.somenteStarlink).toBe(20);
    expect(r.semOperacao).toBe(40);
    expect(r.somaFaixas).toBe(100);
  });

  it('marca como inconsistente quando as contagens brutas nao fazem sentido', () => {
    expect(conciliarContatos({ total: 10, tim: 20, starlink: 0, ambas: 0 }).consistente).toBe(false);
    expect(conciliarContatos({ total: 10, tim: 3, starlink: 2, ambas: 5 }).consistente).toBe(false);
  });
});
