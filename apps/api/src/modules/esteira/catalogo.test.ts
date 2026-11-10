import { describe, expect, it } from 'vitest';
import { ETAPAS, MOTIVOS_PERDA, etapa, operacaoDaUrl, papelDaChave } from './catalogo';

describe('papelDaChave', () => {
  it('mapeia as chaves para o papel consolidado', () => {
    expect(papelDaChave('TIM_VENDA_LIBERADA')).toBe('ATIVO');
    expect(papelDaChave('TIM_ACOMPANHAMENTO')).toBe('ATIVO');
    expect(papelDaChave('TIM_POS_CRED')).toBe('CREDENCIADO');
    expect(papelDaChave('SL_MEI')).toBe('PENDENCIA');
    expect(papelDaChave('SL_PRONTO_VENDA')).toBe('ATIVO');
  });
  it('saidas, nulo e chave desconhecida nao tem papel', () => {
    expect(papelDaChave('SL_NURTURE')).toBeNull();
    expect(papelDaChave('TIM_DESISTENCIA')).toBeNull();
    expect(papelDaChave(null)).toBeNull();
    expect(papelDaChave('XYZ')).toBeNull();
  });
});

describe('ETAPAS', () => {
  for (const op of ['TIM', 'STARLINK'] as const) {
    it(`${op}: chaves e ordens unicas, ordem contigua e trilho 1..7`, () => {
      const lista = ETAPAS[op];
      expect(new Set(lista.map((e) => e.chave)).size).toBe(lista.length);
      expect(lista.map((e) => e.ordem)).toEqual(lista.map((_, i) => i + 1));
      const trilho = lista.filter((e) => e.trilho !== null).map((e) => e.trilho).sort();
      expect(trilho).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(lista.filter((e) => e.tipo !== 'NORMAL').every((e) => e.trilho === null)).toBe(true);
    });
  }
  it('trilho principal vem antes de desvios e saidas', () => {
    const peso = { NORMAL: 0, DESVIO: 1, SAIDA: 2 } as const;
    const pesos = ETAPAS.STARLINK.map((e) => peso[e.tipo]);
    expect(pesos).toEqual([...pesos].sort((a, b) => a - b));
  });
  it('etapa() devolve a etapa e lanca para chave desconhecida', () => {
    expect(etapa('SL_MEI').nome).toBe('Quer abrir MEI');
    expect(() => etapa('NADA' as never)).toThrow(/desconhecida/);
  });
});

describe('MOTIVOS_PERDA', () => {
  it('4 recuperaveis e 5 definitivos', () => {
    const rec = Object.entries(MOTIVOS_PERDA).filter(([, v]) => v.classe === 'RECUPERAVEL').map(([k]) => k).sort();
    expect(rec).toEqual(['NAO_RESPONDEU', 'OUTRO_PARCEIRO', 'SEM_CONTATO', 'SEM_ESTRUTURA']);
    expect(Object.values(MOTIVOS_PERDA).filter((v) => v.classe === 'DEFINITIVO')).toHaveLength(5);
  });
});

describe('operacaoDaUrl', () => {
  it('reconhece sem diferenciar caixa', () => {
    expect(operacaoDaUrl('TIM')).toBe('TIM');
    expect(operacaoDaUrl('starlink')).toBe('STARLINK');
    expect(operacaoDaUrl('x')).toBeNull();
  });
});
