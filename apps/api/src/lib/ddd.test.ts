import { describe, expect, it } from 'vitest';
import { dddDoTelefone, ufDoTelefone } from './ddd';

describe('dddDoTelefone', () => {
  it('reconhece numero com codigo do pais e mascara (+55 62 9967-1844)', () => {
    expect(dddDoTelefone('+55 62 9967-1844')).toBe('62');
  });

  it('reconhece numero so com digitos, com codigo do pais (556299671844)', () => {
    expect(dddDoTelefone('556299671844')).toBe('62');
  });

  it('reconhece numero fixo (8 digitos) com codigo do pais', () => {
    expect(dddDoTelefone('551632654321')).toBe('16');
  });

  it('reconhece numero nacional sem codigo do pais (11 digitos)', () => {
    expect(dddDoTelefone('62996671844')).toBe('62');
  });

  it('nao corta o DDD 55 (Santa Maria/RS) de um numero nacional sem DDI', () => {
    expect(dddDoTelefone('55984567890')).toBe('55');
  });

  it('devolve nulo para numero curto demais para ter DDD', () => {
    expect(dddDoTelefone('12345')).toBeNull();
  });

  it('devolve nulo para telefone ausente', () => {
    expect(dddDoTelefone(null)).toBeNull();
    expect(dddDoTelefone(undefined)).toBeNull();
    expect(dddDoTelefone('')).toBeNull();
  });
});

describe('ufDoTelefone', () => {
  it('mapeia DDD 62 para GO', () => {
    expect(ufDoTelefone('+55 62 9967-1844')).toBe('GO');
  });

  it('mapeia DDD 11 para SP', () => {
    expect(ufDoTelefone('5511988887777')).toBe('SP');
  });

  it('devolve nulo quando o telefone nao tem DDD reconhecivel', () => {
    expect(ufDoTelefone('123')).toBeNull();
  });
});
