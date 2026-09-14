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
});
