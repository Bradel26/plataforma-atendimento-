import { describe, expect, it } from 'vitest';
import { decidirAutomatico, validarMudancaManual, type FatosDoCiclo } from './cicloParceiro';

const AGORA = new Date('2026-09-30T12:00:00Z');
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

const base: FatosDoCiclo = {
  status: 'NOVO_PARCEIRO',
  statusDesde: diasAtras(5),
  etapasConcluidas: 0,
  totalEtapas: 5,
  ultimaInteracaoEm: null,
  agora: AGORA,
};

describe('decidirAutomatico — implantacao', () => {
  it('novo parceiro sem etapa continua novo', () => {
    expect(decidirAutomatico(base)).toBeNull();
  });

  it('primeira etapa concluida leva a EM_IMPLANTACAO', () => {
    expect(decidirAutomatico({ ...base, etapasConcluidas: 1 })).toMatchObject({
      para: 'EM_IMPLANTACAO',
      regra: 'IMPLANTACAO_INICIADA',
    });
  });

  it('todas as etapas concluidas levam a ATIVO, mesmo saltando o meio', () => {
    expect(decidirAutomatico({ ...base, etapasConcluidas: 5 })).toMatchObject({
      para: 'ATIVO',
      regra: 'IMPLANTACAO_CONCLUIDA',
    });
  });

  it('desmarcar tudo volta a NOVO_PARCEIRO', () => {
    expect(decidirAutomatico({ ...base, status: 'EM_IMPLANTACAO', etapasConcluidas: 0 })).toMatchObject({
      para: 'NOVO_PARCEIRO',
    });
  });

  it('em implantacao com etapas pendentes nao muda', () => {
    expect(decidirAutomatico({ ...base, status: 'EM_IMPLANTACAO', etapasConcluidas: 3 })).toBeNull();
  });
});

describe('decidirAutomatico — acompanhamento', () => {
  const ativo: FatosDoCiclo = { ...base, status: 'ATIVO', etapasConcluidas: 5 };

  it('ativo com interacao recente nao muda', () => {
    expect(decidirAutomatico({ ...ativo, statusDesde: diasAtras(90), ultimaInteracaoEm: diasAtras(10) })).toBeNull();
  });

  it('exatamente 30 dias sem interacao ainda nao vira alerta; 31 vira', () => {
    expect(decidirAutomatico({ ...ativo, statusDesde: diasAtras(60), ultimaInteracaoEm: diasAtras(30) })).toBeNull();
    expect(decidirAutomatico({ ...ativo, statusDesde: diasAtras(60), ultimaInteracaoEm: diasAtras(31) })).toMatchObject({
      para: 'SEM_ACOMPANHAMENTO',
      regra: 'SEM_INTERACAO_30D',
    });
  });

  it('sem nenhuma interacao, conta desde que virou ativo', () => {
    expect(decidirAutomatico({ ...ativo, statusDesde: diasAtras(40) })?.para).toBe('SEM_ACOMPANHAMENTO');
    expect(decidirAutomatico({ ...ativo, statusDesde: diasAtras(10) })).toBeNull();
  });

  it('interacao anterior ao status nao adia o relogio', () => {
    // Interacao de 100 dias atras, ativo desde ha 40: vale a data do status.
    expect(decidirAutomatico({ ...ativo, statusDesde: diasAtras(40), ultimaInteracaoEm: diasAtras(100) })?.para).toBe(
      'SEM_ACOMPANHAMENTO',
    );
  });

  it('nova interacao depois do alerta devolve a ATIVO', () => {
    const semAcomp: FatosDoCiclo = { ...ativo, status: 'SEM_ACOMPANHAMENTO', statusDesde: diasAtras(5) };
    expect(decidirAutomatico({ ...semAcomp, ultimaInteracaoEm: diasAtras(1) })).toMatchObject({
      para: 'ATIVO',
      regra: 'INTERACAO_REGISTRADA',
    });
    expect(decidirAutomatico({ ...semAcomp, ultimaInteracaoEm: diasAtras(50) })).toBeNull();
  });
});

describe('decidirAutomatico — reativado, risco e inativo', () => {
  it('reativado com interacao volta a ATIVO depois de 30 dias', () => {
    const reativado: FatosDoCiclo = { ...base, status: 'REATIVADO', statusDesde: diasAtras(31), ultimaInteracaoEm: diasAtras(3) };
    expect(decidirAutomatico(reativado)).toMatchObject({ para: 'ATIVO', regra: 'REATIVACAO_CONCLUIDA' });
    expect(decidirAutomatico({ ...reativado, statusDesde: diasAtras(10) })).toBeNull();
  });

  it('reativado sem nenhuma interacao por mais de 30 dias cai em SEM_ACOMPANHAMENTO', () => {
    const reativado: FatosDoCiclo = { ...base, status: 'REATIVADO', statusDesde: diasAtras(31) };
    expect(decidirAutomatico(reativado)?.para).toBe('SEM_ACOMPANHAMENTO');
  });

  it('EM_RISCO e INATIVO nunca mudam sozinhos, nem com interacao', () => {
    for (const status of ['EM_RISCO', 'INATIVO'] as const) {
      expect(decidirAutomatico({ ...base, status, statusDesde: diasAtras(200), ultimaInteracaoEm: diasAtras(1) })).toBeNull();
    }
  });
});

describe('validarMudancaManual', () => {
  it('EM_RISCO e INATIVO exigem motivo', () => {
    expect(validarMudancaManual('ATIVO', 'EM_RISCO', '  ')).toMatch(/motivo/i);
    expect(validarMudancaManual('ATIVO', 'INATIVO', undefined)).toMatch(/motivo/i);
    expect(validarMudancaManual('ATIVO', 'EM_RISCO', 'nao responde')).toBeNull();
    expect(validarMudancaManual('EM_RISCO', 'INATIVO', 'empresa fechou')).toBeNull();
  });

  it('so em risco ou inativo pode ser reativado', () => {
    expect(validarMudancaManual('ATIVO', 'REATIVADO', undefined)).not.toBeNull();
    expect(validarMudancaManual('EM_RISCO', 'REATIVADO', undefined)).toBeNull();
    expect(validarMudancaManual('INATIVO', 'REATIVADO', undefined)).toBeNull();
  });

  it('status automaticos nao podem ser definidos a mao', () => {
    expect(validarMudancaManual('EM_RISCO', 'ATIVO', 'x')).not.toBeNull();
    expect(validarMudancaManual('ATIVO', 'SEM_ACOMPANHAMENTO', 'x')).not.toBeNull();
  });

  it('inativo nao vira em risco; mesmo status e recusado', () => {
    expect(validarMudancaManual('INATIVO', 'EM_RISCO', 'x')).not.toBeNull();
    expect(validarMudancaManual('EM_RISCO', 'EM_RISCO', 'x')).not.toBeNull();
  });
});
