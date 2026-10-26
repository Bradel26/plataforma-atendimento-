import { describe, expect, it } from 'vitest';
import type { EtapaFunil } from '../../lib/esteiraTypes';
import {
  diaDeHoje,
  filtrosForaDoFunil,
  formatarDias,
  formatarPercentual,
  periodoAnterior,
  periodoDoPreset,
  percentuaisDoFunil,
  periodoExibido,
} from './funilEsteira';

const etapa = (trilho: number, alcancaram: number, extra: Partial<EtapaFunil> = {}): EtapaFunil => ({
  trilho,
  chave: 'TIM_NEGOCIACAO',
  nome: `E${trilho}`,
  alcancaram,
  conversaoParaProxima: null,
  saidas: 0,
  medianaDias: null,
  gargalo: false,
  ...extra,
});

describe('percentuaisDoFunil', () => {
  it('% da primeira etapa e largura relativa ao maior', () => {
    const r = percentuaisDoFunil([etapa(1, 200), etapa(2, 100), etapa(3, 0)]);
    expect(r.map((e) => e.daPrimeira)).toEqual([1, 0.5, 0]);
    expect(r.map((e) => e.largura)).toEqual([1, 0.5, 0]);
  });

  it('ordena pelo trilho', () => {
    const r = percentuaisDoFunil([etapa(2, 50), etapa(1, 100)]);
    expect(r.map((e) => e.trilho)).toEqual([1, 2]);
    expect(r[1]!.daPrimeira).toBe(0.5);
  });

  it('primeira etapa zerada: % nulo e largura zero, sem dividir por zero', () => {
    const r = percentuaisDoFunil([etapa(1, 0), etapa(2, 0)]);
    expect(r.map((e) => e.daPrimeira)).toEqual([null, null]);
    expect(r.map((e) => e.largura)).toEqual([0, 0]);
  });

  it('lista vazia', () => {
    expect(percentuaisDoFunil([])).toEqual([]);
  });
});

describe('períodos', () => {
  it('preset de N dias termina hoje e inclui hoje', () => {
    expect(periodoDoPreset('2026-10-26', 90)).toEqual({ desde: '2026-07-29', ate: '2026-10-26' });
    expect(periodoDoPreset('2026-03-01', 1)).toEqual({ desde: '2026-03-01', ate: '2026-03-01' });
  });

  it('período anterior tem a mesma duração e termina na véspera', () => {
    expect(periodoAnterior({ desde: '2026-07-29', ate: '2026-10-26' })).toEqual({ desde: '2026-04-30', ate: '2026-07-28' });
    expect(periodoAnterior({ desde: '2026-03-01', ate: '2026-03-01' })).toEqual({ desde: '2026-02-28', ate: '2026-02-28' });
    // Atravessa ano bissexto.
    expect(periodoAnterior({ desde: '2024-03-01', ate: '2024-03-31' })).toEqual({ desde: '2024-01-30', ate: '2024-02-29' });
  });

  it('período invertido é tratado como um dia', () => {
    expect(periodoAnterior({ desde: '2026-03-10', ate: '2026-03-01' })).toEqual({ desde: '2026-03-09', ate: '2026-03-09' });
  });

  it('hoje é o dia em Brasília', () => {
    expect(diaDeHoje(new Date('2026-10-27T02:30:00Z'))).toBe('2026-10-26');
  });

  it('período exibido: `ate` exclusivo mostra o dia anterior', () => {
    // `ate=2026-10-26` vira 27/10 00:00 Brasília, exclusivo.
    expect(
      periodoExibido({ desde: '2026-07-29T03:00:00.000Z', ate: '2026-10-27T03:00:00.000Z', ateExclusivo: true }),
    ).toEqual({ desde: '29/07/2026', ate: '26/10/2026' });
    expect(
      periodoExibido({ desde: '2026-07-29T03:00:00.000Z', ate: '2026-10-26T18:00:00.000Z', ateExclusivo: false }),
    ).toEqual({ desde: '29/07/2026', ate: '26/10/2026' });
  });
});

describe('filtrosForaDoFunil', () => {
  it('lista os filtros que o funil ignora', () => {
    expect(filtrosForaDoFunil({ ufs: ['GO'] })).toEqual([]);
    expect(filtrosForaDoFunil({ etapas: ['TIM_NEGOCIACAO'], situacoes: ['EM_ANDAMENTO'], paradoHaMaisDe: 7 })).toEqual([
      'etapa',
      'situação',
      'parado há',
    ]);
    expect(filtrosForaDoFunil({ desde: '2026-01-01' })).toEqual(['período dos filtros']);
    expect(filtrosForaDoFunil({ paradoHaMaisDe: 0 })).toEqual(['parado há']);
  });
});

describe('formatação', () => {
  it('percentual inteiro; nulo vira travessão', () => {
    expect(formatarPercentual(0.625)).toBe('63%');
    expect(formatarPercentual(1)).toBe('100%');
    expect(formatarPercentual(null)).toBe('—');
  });
  it('dias com uma casa no máximo', () => {
    expect(formatarDias(4.25)).toBe('4,3 dias');
    expect(formatarDias(1)).toBe('1 dia');
    expect(formatarDias(null)).toBe('—');
  });
});
