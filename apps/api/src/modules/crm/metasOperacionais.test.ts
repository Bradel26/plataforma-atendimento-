import { describe, expect, it } from 'vitest';
import { fracaoDoMes, progressoOperacional, taxaDeConversao } from './metasOperacionais';

describe('progressoOperacional', () => {
  it('sem meta nao e falha de ninguem', () => {
    expect(progressoOperacional({ alvo: null, realizado: 5, sentido: 'maior', fracaoDoMes: 1 }).situacao).toBe('SEM_META');
  });

  it('bateu a meta: atingida, mesmo passando de 100%', () => {
    const p = progressoOperacional({ alvo: 20, realizado: 25, sentido: 'maior', fracaoDoMes: 0.3 });
    expect(p.situacao).toBe('ATINGIDA');
    expect(p.percentual).toBeCloseTo(1.25);
  });

  it('mes corrente: compara com o que o calendario ja gastou', () => {
    // 18 de 20 = 90%; com metade do mes passado esta na frente do ritmo.
    expect(progressoOperacional({ alvo: 20, realizado: 18, sentido: 'maior', fracaoDoMes: 0.5 }).situacao).toBe('NO_RITMO');
    // 5 de 20 = 25%; com 80% do mes passado esta atrasado.
    expect(progressoOperacional({ alvo: 20, realizado: 5, sentido: 'maior', fracaoDoMes: 0.8 }).situacao).toBe('ABAIXO');
  });

  it('mes fechado: so vale a meta inteira', () => {
    expect(progressoOperacional({ alvo: 20, realizado: 18, sentido: 'maior', fracaoDoMes: 1 }).situacao).toBe('ABAIXO');
  });

  it('indicador em que menos e melhor: a meta e um teto', () => {
    expect(progressoOperacional({ alvo: 5, realizado: 3, sentido: 'menor', fracaoDoMes: 0.2 }).situacao).toBe('ATINGIDA');
    expect(progressoOperacional({ alvo: 5, realizado: 5, sentido: 'menor', fracaoDoMes: 0.2 }).situacao).toBe('ATINGIDA');
    expect(progressoOperacional({ alvo: 5, realizado: 6, sentido: 'menor', fracaoDoMes: 0.2 }).situacao).toBe('ABAIXO');
  });

  it('realizado desconhecido nao vira zero', () => {
    const p = progressoOperacional({ alvo: 5, realizado: null, sentido: 'menor', fracaoDoMes: 1 });
    expect(p.percentual).toBeNull();
    expect(p.situacao).toBe('SEM_META');
  });
});

describe('fracaoDoMes', () => {
  const setembro = new Date('2026-09-01T00:00:00Z');
  it('mes fechado = 1, futuro = 0, corrente entre os dois', () => {
    expect(fracaoDoMes(setembro, new Date('2026-10-15T00:00:00Z'))).toBe(1);
    expect(fracaoDoMes(setembro, new Date('2026-08-15T00:00:00Z'))).toBe(0);
    expect(fracaoDoMes(setembro, new Date('2026-09-16T00:00:00Z'))).toBeCloseTo(0.5, 1);
  });
});

describe('taxaDeConversao', () => {
  it('arredonda e devolve nulo sem base', () => {
    expect(taxaDeConversao(14, 20)).toBe(70);
    expect(taxaDeConversao(0, 0)).toBeNull();
  });
});
