import { describe, expect, it } from 'vitest';
import { desserializarValor, gerarChave, validarValorCampo } from './campos-customizados';

describe('gerarChave', () => {
  it('normaliza espacos, maiusculas e acentos', () => {
    expect(gerarChave('Cor Favorita')).toBe('cor_favorita');
    expect(gerarChave('Código do Cliente')).toBe('codigo_do_cliente');
    expect(gerarChave('  Localização  ')).toBe('localizacao');
  });

  it('colapsa pontuacao em um unico underscore', () => {
    expect(gerarChave('Nº / Contrato!!')).toBe('n_contrato');
  });
});

describe('validarValorCampo', () => {
  it('TEXTO: aceita string nao vazia, apara espacos, recusa vazio', () => {
    expect(validarValorCampo('TEXTO', [], '  Azul  ')).toEqual({ ok: true, valor: 'Azul' });
    expect(validarValorCampo('TEXTO', [], '   ').ok).toBe(false);
    expect(validarValorCampo('TEXTO', [], 42).ok).toBe(false);
  });

  it('NUMERO: aceita numero e string numerica, recusa nao-numero e booleano', () => {
    expect(validarValorCampo('NUMERO', [], 42)).toEqual({ ok: true, valor: '42' });
    expect(validarValorCampo('NUMERO', [], '3.5')).toEqual({ ok: true, valor: '3.5' });
    expect(validarValorCampo('NUMERO', [], 'abc').ok).toBe(false);
    // `Number(true) === 1`: sem a checagem de tipo explicita, um booleano passaria como numero.
    expect(validarValorCampo('NUMERO', [], true).ok).toBe(false);
  });

  it('DATA: aceita ISO valido, recusa string invalida', () => {
    const r = validarValorCampo('DATA', [], '2026-01-15');
    expect(r.ok).toBe(true);
    expect(validarValorCampo('DATA', [], 'nao e data').ok).toBe(false);
  });

  it('BOOLEANO: so aceita boolean de verdade', () => {
    expect(validarValorCampo('BOOLEANO', [], true)).toEqual({ ok: true, valor: 'true' });
    expect(validarValorCampo('BOOLEANO', [], 'true').ok).toBe(false);
  });

  it('SELECAO: aceita so uma das opcoes declaradas', () => {
    expect(validarValorCampo('SELECAO', ['A', 'B'], 'A')).toEqual({ ok: true, valor: 'A' });
    expect(validarValorCampo('SELECAO', ['A', 'B'], 'C').ok).toBe(false);
  });
});

describe('desserializarValor', () => {
  it('NUMERO volta como number, BOOLEANO como boolean, o resto como string', () => {
    expect(desserializarValor('NUMERO', '3.5')).toBe(3.5);
    expect(desserializarValor('BOOLEANO', 'true')).toBe(true);
    expect(desserializarValor('BOOLEANO', 'false')).toBe(false);
    expect(desserializarValor('TEXTO', 'Azul')).toBe('Azul');
    expect(desserializarValor('SELECAO', 'A')).toBe('A');
  });
});
