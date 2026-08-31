import { describe, expect, it } from 'vitest';
import { MAXIMO_POR_REGISTRO, normalizarTag, normalizarTags } from './tags';

/**
 * A normalizacao e a unica garantia de que filtro e registro se encontram.
 *
 * Estes casos existem porque cada um deles ja quebraria o filtro em producao:
 * a diferenca de caixa, o espaco que sobrou do copiar e colar, e a duplicata
 * que a pessoa nao percebeu ter digitado duas vezes.
 */

describe('normalizarTag', () => {
  it('tira espaco das pontas e baixa a caixa', () => {
    expect(normalizarTag('  Revenda ')).toBe('revenda');
  });

  it('colapsa espaco interno', () => {
    // Vem de copiar e colar de planilha, e a olho nu e identica a versao certa.
    expect(normalizarTag('cliente   ouro')).toBe('cliente ouro');
  });

  it('preserva acento', () => {
    // `acougue` e `açougue` sao palavras diferentes para quem le a etiqueta.
    expect(normalizarTag('Açougue')).toBe('açougue');
  });

  it('devolve vazio para entrada so de espaco', () => {
    // Quem decide descartar e o chamador; a funcao apenas nao inventa conteudo.
    expect(normalizarTag('   ')).toBe('');
  });
});

describe('normalizarTags', () => {
  it('descarta vazias', () => {
    expect(normalizarTags(['revenda', '  ', ''])).toEqual(['revenda']);
  });

  it('remove duplicata que difere apenas na caixa ou no espaco', () => {
    expect(normalizarTags(['Revenda', 'revenda ', 'REVENDA'])).toEqual(['revenda']);
  });

  it('preserva a ordem em que a pessoa escreveu', () => {
    // A primeira tag e a que aparece na lista compacta, entao a ordem e visivel.
    expect(normalizarTags(['zona norte', 'atacado', 'revenda'])).toEqual([
      'zona norte',
      'atacado',
      'revenda',
    ]);
  });

  it('corta no maximo por registro', () => {
    const muitas = Array.from({ length: MAXIMO_POR_REGISTRO + 5 }, (_, i) => `tag ${i}`);
    expect(normalizarTags(muitas)).toHaveLength(MAXIMO_POR_REGISTRO);
  });

  it('nao devolve lista com furo quando tudo e invalido', () => {
    // Lista vazia e um estado valido: significa "sem etiqueta", e nao "nao mexa".
    expect(normalizarTags(['', ' '])).toEqual([]);
  });
});
