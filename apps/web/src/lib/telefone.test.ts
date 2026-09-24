import { describe, expect, it } from 'vitest';
import { telefoneLegivel } from './telefone';

describe('telefoneLegivel', () => {
  it('celular brasileiro com DDD', () => expect(telefoneLegivel('5562999990000')).toBe('(62) 99999-0000'));
  it('fixo brasileiro', () => expect(telefoneLegivel('556232220000')).toBe('(62) 3222-0000'));
  it('numero estrangeiro fica como veio', () => expect(telefoneLegivel('595981402525')).toBe('+595981402525'));
});
