import { describe, expect, it } from 'vitest';
import { mascararTelefoneBr, telefoneLegivel } from './telefone';

describe('telefoneLegivel', () => {
  it('celular brasileiro com DDD', () => expect(telefoneLegivel('5562999990000')).toBe('(62) 99999-0000'));
  it('fixo brasileiro', () => expect(telefoneLegivel('556232220000')).toBe('(62) 3222-0000'));
  it('número estrangeiro fica como veio', () => expect(telefoneLegivel('595981402525')).toBe('+595981402525'));
});

describe('mascararTelefoneBr', () => {
  it('celular de 9 digitos digitado sem formatacao vira +55 DD DDDDD-DDDD', () => {
    expect(mascararTelefoneBr('62992885001')).toBe('+55 62 99288-5001');
  });

  it('fixo de 8 digitos vira +55 DD DDDD-DDDD', () => {
    expect(mascararTelefoneBr('6232220000')).toBe('+55 62 3222-0000');
  });

  it('já com 55 na frente não duplica o DDI', () => {
    expect(mascararTelefoneBr('+55 62 99288-5001')).toBe('+55 62 99288-5001');
    expect(mascararTelefoneBr('5562992885001')).toBe('+55 62 99288-5001');
  });

  it('só DDD, sem número ainda', () => {
    expect(mascararTelefoneBr('62')).toBe('+55 62');
  });

  it('campo vazio devolve só o DDI', () => {
    expect(mascararTelefoneBr('')).toBe('+55');
  });

  it('digitos além do máximo (DDD + 9) são ignorados, não empurram o formato', () => {
    expect(mascararTelefoneBr('629928850019999')).toBe('+55 62 99288-5001');
  });
});
