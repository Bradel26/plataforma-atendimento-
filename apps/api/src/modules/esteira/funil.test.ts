import { describe, expect, it } from 'vitest';
import { calcularFunil, mediana, periodoDosFiltros, type EntradaFunil } from './funil';

const ETAPAS_TRILHO = [
  { trilho: 1, chave: 'TIM_NEGOCIACAO' as const, nome: 'Em negociação' },
  { trilho: 2, chave: 'TIM_DOCUMENTACAO' as const, nome: 'Em andamento/Doc' },
  { trilho: 3, chave: 'TIM_CRED_ANDAMENTO' as const, nome: 'Credenciamento em andamento' },
  { trilho: 4, chave: 'TIM_CRED_OK' as const, nome: 'Credenciamento OK' },
];

const entrada = (trilhoMaximo: number, extra: Partial<EntradaFunil> = {}): EntradaFunil => ({
  trilhoMaximo,
  saiuNoTrilho: null,
  diasPorTrilho: {},
  ...extra,
});

describe('mediana', () => {
  it('ímpar: o central; par: média dos dois centrais; vazio: nulo', () => {
    expect(mediana([10, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe('calcularFunil', () => {
  it('10 entradas, 6 chegam ao trilho 3 e 3 ao 4', () => {
    const entradas = [
      ...Array.from({ length: 4 }, () => entrada(2)),
      ...Array.from({ length: 3 }, () => entrada(3)),
      ...Array.from({ length: 3 }, () => entrada(4)),
    ];
    const f = calcularFunil(entradas, ETAPAS_TRILHO);
    expect(f.map((e) => e.alcancaram)).toEqual([10, 10, 6, 3]);
    expect(f[2]!.conversaoParaProxima).toBe(0.5);
    expect(f[0]!.conversaoParaProxima).toBe(1);
    expect(f[3]!.conversaoParaProxima).toBeNull();
  });

  it('marca a saída no trilho de onde saiu', () => {
    const f = calcularFunil([entrada(3, { saiuNoTrilho: 3 }), entrada(2, { saiuNoTrilho: 2 }), entrada(2)], ETAPAS_TRILHO);
    expect(f.map((e) => e.saidas)).toEqual([0, 1, 1, 0]);
  });

  it('mediana de dias por etapa', () => {
    const entradas = [1, 3, 10].map((d) => entrada(2, { diasPorTrilho: { 1: d } }));
    const f = calcularFunil(entradas, ETAPAS_TRILHO);
    expect(f[0]!.medianaDias).toBe(3);
    expect(f[1]!.medianaDias).toBeNull();
  });

  it('gargalo: a menor conversão; empate pela maior mediana; só um', () => {
    const entradas = [entrada(1, { diasPorTrilho: { 1: 2, 2: 9 } }), entrada(2, { diasPorTrilho: { 2: 9 } }), entrada(3), entrada(4)];
    const f = calcularFunil(entradas, ETAPAS_TRILHO);
    // conversões: 1→2 = 3/4, 2→3 = 2/3, 3→4 = 1/2
    expect(f.filter((e) => e.gargalo).map((e) => e.trilho)).toEqual([3]);

  });

  it('empate de conversão: desempata pela maior mediana', () => {
    // alcancaram [4,2,1]: 1→2 = 1/2 e 2→3 = 1/2; mediana do trilho 2 (5) > a do trilho 1 (1)
    const f = calcularFunil(
      [
        entrada(3, { diasPorTrilho: { 1: 1, 2: 5 } }),
        entrada(2, { diasPorTrilho: { 1: 1, 2: 5 } }),
        entrada(1, { diasPorTrilho: { 1: 1 } }),
        entrada(1, { diasPorTrilho: { 1: 1 } }),
      ],
      ETAPAS_TRILHO.slice(0, 3),
    );
    expect(f.map((e) => e.conversaoParaProxima)).toEqual([0.5, 0.5, null]);
    expect(f.filter((e) => e.gargalo).map((e) => e.trilho)).toEqual([2]);
  });

  it('sem entradas: tudo zero, conversões nulas e nenhum gargalo', () => {
    const f = calcularFunil([], ETAPAS_TRILHO);
    expect(f.map((e) => e.alcancaram)).toEqual([0, 0, 0, 0]);
    expect(f.every((e) => e.conversaoParaProxima === null && !e.gargalo && e.saidas === 0 && e.medianaDias === null)).toBe(true);
  });
});

describe('periodoDosFiltros', () => {
  const agora = new Date('2026-10-24T12:00:00Z');

  it('sem datas: últimos 90 dias até agora', () => {
    const p = periodoDosFiltros({}, agora);
    expect(p.ate).toEqual(agora);
    expect(p.desde).toEqual(new Date('2026-07-26T12:00:00Z'));
    expect(p.ateExclusivo).toBe(false);
  });

  it('respeita as datas informadas e o fim exclusivo', () => {
    const desde = new Date('2026-10-01T03:00:00Z');
    const ate = new Date('2026-11-01T03:00:00Z');
    expect(periodoDosFiltros({ desde, ate, ateExclusivo: true }, agora)).toEqual({ desde, ate, ateExclusivo: true });
  });
});
