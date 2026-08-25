import { describe, expect, it } from 'vitest';
import { COR_CANAL, COR_STATUS_AGENTE, ESTADO, SERIES, duracao } from './viz';

describe('paleta de dados', () => {
  it('nao tem cor repetida entre as series', () => {
    expect(new Set(SERIES).size).toBe(SERIES.length);
  });

  /**
   * Regra do metodo de dataviz: cor de estado (bom/atencao/grave) e reservada.
   * Reusar "grave" como serie 7 faria um dado neutro parecer alarme.
   */
  it('mantem grave e neutro fora da paleta de series', () => {
    expect(SERIES).not.toContain(ESTADO.grave);
    expect(SERIES).not.toContain(ESTADO.neutro);
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

  it('so usa hex de seis digitos', () => {
    for (const cor of [...SERIES, ...Object.values(ESTADO)]) {
      expect(cor).toMatch(/^#[0-9a-f]{6}$/);
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
