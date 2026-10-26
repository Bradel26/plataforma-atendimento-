import { describe, expect, it } from 'vitest';
import { opcoesDeOperacao, partesDoPainel, rotuloConsolidado, rotuloDaEtapa, rotuloDaOperacao } from './indicadoresOperacao';

describe('rotuloConsolidado', () => {
  it('as duas operações viram "TIM + Starlink", na ordem fixa', () => {
    expect(rotuloConsolidado(['STARLINK', 'TIM'])).toBe('TIM + Starlink');
  });

  it('uma operação só: o nome dela', () => {
    expect(rotuloConsolidado(['STARLINK'])).toBe('Starlink');
  });

  it('nenhuma: texto neutro', () => {
    expect(rotuloConsolidado([])).toBe('Nenhuma operação');
  });
});

describe('rotuloDaOperacao', () => {
  it('pelo código, nunca pelo nome do funil', () => {
    expect(rotuloDaOperacao('STARLINK')).toBe('Starlink');
    expect(rotuloDaOperacao('TIM')).toBe('TIM');
  });

  it('sem código: a reserva', () => {
    expect(rotuloDaOperacao(null, 'Funil antigo')).toBe('Funil antigo');
    expect(rotuloDaOperacao(undefined)).toBe('');
  });
});

describe('opcoesDeOperacao', () => {
  const tim = { id: 'f-tim', operacao: 'TIM' as const };
  const sl = { id: 'f-sl', operacao: 'STARLINK' as const };

  it('com as duas: consolidado primeiro (valor vazio) e uma opção por operação', () => {
    expect(opcoesDeOperacao([sl, tim])).toEqual([
      { valor: '', rotulo: 'TIM + Starlink' },
      { valor: 'f-tim', rotulo: 'TIM' },
      { valor: 'f-sl', rotulo: 'Starlink' },
    ]);
  });

  it('só uma permitida: uma opção só (o consolidado é ela)', () => {
    expect(opcoesDeOperacao([sl])).toEqual([{ valor: '', rotulo: 'Starlink' }]);
  });

  it('funil sem código de operação não vira opção', () => {
    expect(opcoesDeOperacao([tim, { id: 'velho', operacao: null }])).toEqual([{ valor: '', rotulo: 'TIM' }]);
  });
});

describe('rotuloDaEtapa', () => {
  it('na visão consolidada leva a operação na frente', () => {
    expect(rotuloDaEtapa('Cadastro', 'STARLINK', true)).toBe('Starlink · Cadastro');
  });

  it('numa operação só, o nome da etapa como veio da API', () => {
    expect(rotuloDaEtapa('Cadastro', 'TIM', false)).toBe('Cadastro');
    expect(rotuloDaEtapa('Cadastro', null, true)).toBe('Cadastro');
  });
});

describe('partesDoPainel', () => {
  it('separa ativos, pendentes, quem saiu (etapas de saída) e o resto em andamento', () => {
    expect(
      partesDoPainel({
        total: 20,
        ativos: 5,
        pendentes: 3,
        porEstagio: [
          { total: 7, tipo: 'NORMAL' },
          { total: 2, tipo: 'SAIDA' },
          { total: 1, tipo: 'SAIDA' },
          { total: 4, tipo: 'DESVIO' },
        ],
      }),
    ).toEqual({ ativos: 5, pendentes: 3, emAndamento: 9, saidas: 3 });
  });

  it('nunca devolve negativo', () => {
    expect(partesDoPainel({ total: 1, ativos: 1, pendentes: 1, porEstagio: [] }).emAndamento).toBe(0);
  });
});
