import { describe, expect, it } from 'vitest';
import { apos, codificarCursor, decodificarCursor, fatiar } from './paginacao';

describe('cursor', () => {
  it('sobrevive a ida e volta', () => {
    const valor = new Date('2026-08-25T12:34:56.789Z');
    const cursor = codificarCursor({ valor, id: 'abc-123' });
    expect(decodificarCursor(cursor)).toEqual({ valor, id: 'abc-123' });
  });

  it('e opaco (nao expoe data nem id em claro)', () => {
    const cursor = codificarCursor({ valor: new Date('2026-08-25T00:00:00Z'), id: 'abc-123' });
    expect(cursor).not.toContain('2026');
    expect(cursor).not.toContain('abc-123');
  });

  it('devolve nulo quando nao ha cursor', () => {
    expect(decodificarCursor(undefined)).toBeNull();
  });

  it('recusa cursor invalido em vez de ignorar', () => {
    expect(() => decodificarCursor('isto-nao-e-cursor')).toThrow();
    expect(() => decodificarCursor(Buffer.from('sem-separador').toString('base64url'))).toThrow();
    expect(() => decodificarCursor(Buffer.from('data-ruim|id').toString('base64url'))).toThrow();
  });
});

describe('apos', () => {
  it('nao filtra nada na primeira pagina', () => {
    expect(apos('criadoEm', null)).toBeUndefined();
  });

  /**
   * O desempate por id e o ponto do teste: sem o segundo termo do OR, dois
   * registros no mesmo milissegundo fariam a paginacao pular um deles.
   */
  it('desempata por id quando a data e igual', () => {
    const valor = new Date('2026-08-25T10:00:00Z');
    expect(apos('criadoEm', { valor, id: 'x' })).toEqual({
      OR: [{ criadoEm: { lt: valor } }, { criadoEm: valor, id: { lt: 'x' } }],
    });
  });
});

describe('fatiar', () => {
  const registros = [1, 2, 3, 4].map((n) => ({
    id: `id-${n}`,
    criadoEm: new Date(`2026-08-2${n}T00:00:00Z`),
  }));

  it('devolve cursor quando veio o registro extra', () => {
    const { itens, proximoCursor } = fatiar(registros, 3, (r) => r.criadoEm);
    expect(itens.map((i) => i.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(decodificarCursor(proximoCursor!)).toEqual({ valor: registros[2]!.criadoEm, id: 'id-3' });
  });

  it('nao devolve cursor na ultima pagina', () => {
    expect(fatiar(registros, 4, (r) => r.criadoEm).proximoCursor).toBeNull();
    expect(fatiar([], 10, (r: { id: string; criadoEm: Date }) => r.criadoEm).proximoCursor).toBeNull();
  });
});
