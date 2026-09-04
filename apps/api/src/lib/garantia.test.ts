import { describe, expect, it } from 'vitest';
import { statusDaGarantia } from './garantia';

const HOJE = new Date('2026-09-04T12:00:00Z');
const CREDENCIADO_COM_NF = { instaladorCredenciado: true, notaFiscalNumero: 'NF-123' };

describe('statusDaGarantia', () => {
  it('LEGAL dentro do prazo e VIGENTE', () => {
    const r = statusDaGarantia(
      { tipo: 'LEGAL', prazoDias: 90, dataInicio: new Date('2026-08-10T00:00:00Z') },
      CREDENCIADO_COM_NF,
      HOJE,
    );
    expect(r.status).toBe('VIGENTE');
    expect(r.vencimento).toEqual(new Date(new Date('2026-08-10T00:00:00Z').getTime() + 90 * 86_400_000));
  });

  it('LEGAL com prazo encerrado e VENCIDA', () => {
    const r = statusDaGarantia(
      { tipo: 'LEGAL', prazoDias: 90, dataInicio: new Date('2025-01-01T00:00:00Z') },
      CREDENCIADO_COM_NF,
      HOJE,
    );
    expect(r.status).toBe('VENCIDA');
  });

  it('sem data de inicio e SEM_DATA_INICIO, nunca VENCIDA', () => {
    const r = statusDaGarantia({ tipo: 'LEGAL', prazoDias: 90, dataInicio: null }, CREDENCIADO_COM_NF, HOJE);
    expect(r.status).toBe('SEM_DATA_INICIO');
    expect(r.vencimento).toBeNull();
  });

  it('COMPRESSOR com prazo longo continua VIGENTE anos depois da instalacao', () => {
    const r = statusDaGarantia(
      { tipo: 'COMPRESSOR', prazoDias: 3650, dataInicio: new Date('2020-01-01T00:00:00Z') },
      CREDENCIADO_COM_NF,
      HOJE,
    );
    expect(r.status).toBe('VIGENTE');
  });

  it('CONTRATUAL sem instalador credenciado informado e REQUISITO_NAO_INFORMADO', () => {
    const r = statusDaGarantia(
      { tipo: 'CONTRATUAL', prazoDias: 360, dataInicio: new Date('2026-01-01T00:00:00Z') },
      { instaladorCredenciado: null, notaFiscalNumero: null },
      HOJE,
    );
    expect(r.status).toBe('REQUISITO_NAO_INFORMADO');
    expect(r.vencimento).toBeNull();
  });

  it('CONTRATUAL com instalador explicitamente NAO credenciado e NAO_APLICAVEL, mesmo com nota fiscal', () => {
    const r = statusDaGarantia(
      { tipo: 'CONTRATUAL', prazoDias: 360, dataInicio: new Date('2026-01-01T00:00:00Z') },
      { instaladorCredenciado: false, notaFiscalNumero: 'NF-999' },
      HOJE,
    );
    expect(r.status).toBe('NAO_APLICAVEL');
  });

  it('CONTRATUAL credenciado mas sem nota fiscal e NAO_APLICAVEL', () => {
    const r = statusDaGarantia(
      { tipo: 'CONTRATUAL', prazoDias: 360, dataInicio: new Date('2026-01-01T00:00:00Z') },
      { instaladorCredenciado: true, notaFiscalNumero: null },
      HOJE,
    );
    expect(r.status).toBe('NAO_APLICAVEL');
  });

  it('CONTRATUAL credenciado e com nota fiscal calcula vencimento normalmente', () => {
    const r = statusDaGarantia(
      { tipo: 'CONTRATUAL', prazoDias: 360, dataInicio: new Date('2026-08-01T00:00:00Z') },
      CREDENCIADO_COM_NF,
      HOJE,
    );
    expect(r.status).toBe('VIGENTE');
    expect(r.vencimento).not.toBeNull();
  });

  it('CONTRATUAL sem data de inicio fica SEM_DATA_INICIO mesmo com requisitos cumpridos', () => {
    const r = statusDaGarantia({ tipo: 'CONTRATUAL', prazoDias: 360, dataInicio: null }, CREDENCIADO_COM_NF, HOJE);
    expect(r.status).toBe('SEM_DATA_INICIO');
  });

  it('vencimento no exato instante de "agora" ainda e VIGENTE', () => {
    const dataInicio = new Date(HOJE.getTime() - 90 * 86_400_000);
    const r = statusDaGarantia({ tipo: 'LEGAL', prazoDias: 90, dataInicio }, CREDENCIADO_COM_NF, HOJE);
    expect(r.status).toBe('VIGENTE');
  });

  it('um milissegundo apos o vencimento ja e VENCIDA', () => {
    const dataInicio = new Date(HOJE.getTime() - 90 * 86_400_000 - 1);
    const r = statusDaGarantia({ tipo: 'LEGAL', prazoDias: 90, dataInicio }, CREDENCIADO_COM_NF, HOJE);
    expect(r.status).toBe('VENCIDA');
  });
});
