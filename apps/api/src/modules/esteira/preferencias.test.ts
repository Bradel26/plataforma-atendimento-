import { describe, expect, it } from 'vitest';
import { validarPreferencia } from './preferencias';

describe('validarPreferencia', () => {
  it('aceita chave de esteira com operação válida', () => {
    expect(validarPreferencia('esteira:TIM', { modo: 'kanban' })).toBeNull();
    expect(validarPreferencia('esteira:starlink:colunas', ['a'])).toBeNull();
    expect(validarPreferencia('tema-escuro_1', false)).toBeNull();
    expect(validarPreferencia('x', null)).toBeNull();
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
