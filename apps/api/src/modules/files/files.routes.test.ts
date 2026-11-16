import { describe, expect, it } from 'vitest';
import { assinaturaValida } from '../../lib/storage';
import { contentDisposition } from './files.routes';

describe('contentDisposition', () => {
  it('nome comum sai simples e tambem codificado', () => {
    expect(contentDisposition('inline', 'foto.png')).toBe(`inline; filename="foto.png"; filename*=UTF-8''foto.png`);
  });

  it('caracteres fora do Latin-1 (travessao, emoji) nao quebram o cabecalho', () => {
    const valor = contentDisposition('attachment', 'Proposta – final 😀.pdf');
    // O Node recusa qualquer caractere acima de 0xFF em cabecalho: este e o 500 que ocorria.
    expect([...valor].every((c) => c.charCodeAt(0) <= 0xff)).toBe(true);
    expect(valor).toContain('filename*=UTF-8\'\'Proposta%20%E2%80%93%20final%20%F0%9F%98%80.pdf');
  });

  it('aspas, barras e ponto e virgula nao escapam do parametro', () => {
    const valor = contentDisposition('attachment', 'a"b\\c/d;e.pdf');
    expect(valor.split('filename="')[1]!.split('"')[0]).toBe('a_b_c_d_e.pdf');
  });

  it('quebra de linha nao injeta cabecalho novo', () => {
    const valor = contentDisposition('attachment', 'x.pdf\r\nSet-Cookie: a=b');
    expect(valor).not.toMatch(/[\r\n]/);
  });

  it('nome vazio ou so de controles vira um nome padrao', () => {
    expect(contentDisposition('attachment', '\r\n')).toContain('filename="arquivo"');
  });
});

describe('assinatura de link de arquivo', () => {
  const CHAVE = '11111111-1111-1111-1111-111111111111/2026/08/8f14e45f-ceea-467a-9e77-fbc4d3fbe4a5.png';

  it('prazo ilegivel (NaN) e recusado, nao tratado como nao expirado', () => {
    expect(assinaturaValida(CHAVE, 'abc.deadbeef')).toBe(false);
    expect(assinaturaValida(CHAVE, 'NaN.deadbeef')).toBe(false);
    expect(assinaturaValida(CHAVE, '1e99.deadbeef')).toBe(false);
    expect(assinaturaValida(CHAVE, '-1.deadbeef')).toBe(false);
  });
});
