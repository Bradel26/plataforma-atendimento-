import { describe, expect, it } from 'vitest';
import { partesComLinks } from './links';

describe('partesComLinks', () => {
  it('texto sem link fica inteiro', () => expect(partesComLinks('bom dia')).toEqual([{ texto: 'bom dia' }]));
  it('separa o link do texto em volta', () => {
    expect(partesComLinks('clique: https://wa.me/556239203399 obrigado')).toEqual([
      { texto: 'clique: ' },
      { texto: 'https://wa.me/556239203399', href: 'https://wa.me/556239203399' },
      { texto: ' obrigado' },
    ]);
  });
  it('não engole a pontuação final', () => {
    expect(partesComLinks('veja https://bradel.com.br.')).toEqual([
      { texto: 'veja ' },
      { texto: 'https://bradel.com.br', href: 'https://bradel.com.br' },
      { texto: '.' },
    ]);
  });
  it('ignora esquema que não é http(s)', () => expect(partesComLinks('javascript:alert(1)')).toEqual([{ texto: 'javascript:alert(1)' }]));
});
