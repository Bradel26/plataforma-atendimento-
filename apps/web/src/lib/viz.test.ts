import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COR_CANAL,
  COR_STATUS_AGENTE,
  ESTADO,
  ESTADO_CLARO,
  ESTADO_ESCURO,
  SERIES,
  SERIES_CLARO,
  SERIES_ESCURO,
  duracao,
} from './viz';

const css = readFileSync(join(__dirname, '../index.css'), 'utf8');

describe('paleta de dados', () => {
  for (const [tema, paleta] of [
    ['claro', SERIES_CLARO],
    ['escuro', SERIES_ESCURO],
  ] as const) {
    it(`nao tem cor repetida entre as series (${tema})`, () => {
      expect(new Set(paleta).size).toBe(paleta.length);
    });

    it(`so usa hex de seis digitos (${tema})`, () => {
      for (const cor of paleta) expect(cor).toMatch(/^#[0-9a-f]{6}$/);
    });
  }

  /**
   * Regra do metodo de dataviz: cor de estado (bom/atencao/grave) e reservada.
   * Reusar "grave" como serie 7 faria um dado neutro parecer alarme.
   */
  it('mantem grave e neutro fora da paleta de series, nos dois temas', () => {
    expect(SERIES_CLARO).not.toContain(ESTADO_CLARO.grave);
    expect(SERIES_CLARO).not.toContain(ESTADO_CLARO.neutro);
    expect(SERIES_ESCURO).not.toContain(ESTADO_ESCURO.grave);
    expect(SERIES_ESCURO).not.toContain(ESTADO_ESCURO.neutro);
  });

  it('da uma cor propria para cada canal, sem ciclar', () => {
    const cores = Object.values(COR_CANAL);
    expect(new Set(cores).size).toBe(cores.length);
    for (const cor of cores) expect(SERIES).toContain(cor as (typeof SERIES)[number]);
  });

  /** Presenca do agente e estado, nao identidade: usa a paleta de estado. */
  it('usa a paleta de estado para status do agente', () => {
    for (const cor of Object.values(COR_STATUS_AGENTE)) {
      expect(Object.values(ESTADO)).toContain(cor);
    }
  });

  it('o que os componentes usam e variavel CSS, nao hex fixo', () => {
    for (const cor of [...SERIES, ...Object.values(ESTADO)]) {
      expect(cor).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
});

/**
 * O valor de cada tema vive no CSS e a documentacao vive no TypeScript. Este
 * teste existe para os dois nao se separarem em silencio — divergir aqui daria
 * uma paleta validada no papel e outra na tela.
 */
describe('CSS e TypeScript descrevem a mesma paleta', () => {
  const blocoClaro = css.slice(css.indexOf(':root {'), css.indexOf('html.tema-escuro'));
  const blocoEscuro = css.slice(css.indexOf('html.tema-escuro'));

  it('as series claras estao no bloco claro, na ordem', () => {
    SERIES_CLARO.forEach((cor, i) => expect(blocoClaro).toContain(`--serie-${i + 1}: ${cor};`));
  });

  it('as series escuras estao no bloco escuro, na ordem', () => {
    SERIES_ESCURO.forEach((cor, i) => expect(blocoEscuro).toContain(`--serie-${i + 1}: ${cor};`));
  });

  it('os estados batem nos dois blocos', () => {
    for (const [nome, cor] of Object.entries(ESTADO_CLARO)) {
      expect(blocoClaro).toContain(`--estado-${nome}: ${cor};`);
    }
    for (const [nome, cor] of Object.entries(ESTADO_ESCURO)) {
      expect(blocoEscuro).toContain(`--estado-${nome}: ${cor};`);
    }
  });

  it('o tema escuro remapeia a escala de cinza que o app usa', () => {
    for (const variavel of ['--color-white', '--color-slate-100', '--color-slate-800', '--color-slate-900']) {
      expect(blocoEscuro).toContain(`${variavel}:`);
    }
  });
});

describe('duracao', () => {
  it('mostra segundos abaixo de um minuto', () => {
    expect(duracao(0)).toBe('0s');
    expect(duracao(45)).toBe('45s');
  });

  it('mostra minutos e segundos abaixo de uma hora', () => {
    expect(duracao(60)).toBe('1m 0s');
    expect(duracao(3599)).toBe('59m 59s');
  });

  it('omite segundos quando ja passou de uma hora', () => {
    expect(duracao(3600)).toBe('1h 0m');
    expect(duracao(7845)).toBe('2h 10m');
  });

  /** Sem dado e diferente de zero: um mostra travessao, o outro mostra 0s. */
  it('distingue ausencia de dado de duracao zero', () => {
    expect(duracao(null)).toBe('—');
    expect(duracao(0)).toBe('0s');
  });
});
