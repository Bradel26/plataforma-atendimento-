import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { validarPreferencia, valorLido, valorParaGravar } from './preferencias';

describe('validarPreferencia', () => {
  it('aceita chave de esteira com operação válida', () => {
    expect(validarPreferencia('esteira:TIM', { modo: 'kanban' })).toBeNull();
    expect(validarPreferencia('esteira:starlink:colunas', ['a'])).toBeNull();
    expect(validarPreferencia('tema-escuro_1', false)).toBeNull();
    expect(validarPreferencia('x', null)).toBeNull();
  });

  it('aceita esteira:ultimaOperacao (spec 4.10), a única chave de esteira sem operação', () => {
    expect(validarPreferencia('esteira:ultimaOperacao', { operacao: 'TIM' })).toBeNull();
    expect(validarPreferencia('esteira:ultimaOperacao:x', 1)?.status).toBe(400);
  });

  it('recusa chave fora do padrão ou longa demais', () => {
    expect(validarPreferencia('', 1)?.status).toBe(400);
    expect(validarPreferencia('com espaço', 1)?.status).toBe(400);
    expect(validarPreferencia('a/b', 1)?.status).toBe(400);
    expect(validarPreferencia('a'.repeat(81), 1)?.status).toBe(400);
    expect(validarPreferencia('a'.repeat(80), 1)).toBeNull();
  });

  it('recusa operação inválida em esteira:', () => {
    expect(validarPreferencia('esteira:VIVO', 1)?.status).toBe(400);
    expect(validarPreferencia('esteira:', 1)?.status).toBe(400);
    expect(validarPreferencia('esteira:TIMX:a', 1)?.status).toBe(400);
  });

  it('recusa valor indefinido', () => {
    expect(validarPreferencia('x', undefined)?.status).toBe(400);
  });

  it('limita o valor serializado a 32 KB (413)', () => {
    expect(validarPreferencia('x', 'a'.repeat(32 * 1024 - 2))).toBeNull();
    expect(validarPreferencia('x', 'a'.repeat(32 * 1024))?.status).toBe(413);
  });
});

describe('valorParaGravar / valorLido', () => {
  it('null vira Prisma.JsonNull e volta como null', () => {
    expect(valorParaGravar(null)).toBe(Prisma.JsonNull);
    expect(valorLido(valorParaGravar(null))).toBeNull();
    expect(valorLido(null)).toBeNull();
  });
  it('objeto, array, número, string e booleano passam intactos', () => {
    for (const v of [{ a: 1 }, [1, 'b'], 0, 42, '', 'txt', false]) {
      expect(valorParaGravar(v)).toBe(v);
      expect(valorLido(valorParaGravar(v))).toBe(v);
    }
  });
});
