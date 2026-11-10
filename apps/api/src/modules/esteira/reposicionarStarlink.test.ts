import { describe, expect, it } from 'vitest';
import type { CredenciamentoStarlink } from '@prisma/client';
import { destinoStarlink, type EtapaDoFunil } from './reposicionarStarlink';
import { CAMPOS_STARLINK_VAZIO } from './starlink';
import { ETAPAS, type ChaveEtapa } from './catalogo';

/** Funil Starlink com id = `id-<chave>`, como a sincronização deixaria. */
const etapas = new Map<ChaveEtapa, EtapaDoFunil>(
  ETAPAS.STARLINK.map((e) => [e.chave, { id: `id-${e.chave}`, tipoEtapa: e.tipo }]),
);

const linha = (parcial: Partial<CredenciamentoStarlink>): CredenciamentoStarlink => ({
  credenciamentoId: 'c1',
  ...CAMPOS_STARLINK_VAZIO,
  ...parcial,
});

describe('destinoStarlink', () => {
  it('card sem linha Starlink vai para Aguardando contato', () => {
    const r = destinoStarlink({ estagioId: 'antigo', tipoEtapaAtual: 'NORMAL', starlink: null }, etapas);
    expect(r).toEqual({ estagioId: 'id-SL_AGUARDANDO', guardarAntesDaSaida: false });
  });

  it('move para a etapa derivada dos campos', () => {
    const r = destinoStarlink(
      { estagioId: 'antigo', tipoEtapaAtual: 'NORMAL', starlink: linha({ cnpjApto: true, contrato: true }) },
      etapas,
    );
    expect(r).toEqual({ estagioId: 'id-SL_CONTRATO', guardarAntesDaSaida: false });
  });

  it('quem já está na etapa derivada não move', () => {
    const r = destinoStarlink(
      { estagioId: 'id-SL_CREDENCIAMENTO', tipoEtapaAtual: 'NORMAL', starlink: linha({ cnpjApto: true }) },
      etapas,
    );
    expect(r).toBeNull();
  });

  it('indo para uma saída, guarda a etapa em que estava', () => {
    const r = destinoStarlink(
      { estagioId: 'id-SL_TREINAMENTO', tipoEtapaAtual: 'NORMAL', starlink: linha({ treinamento: true, perdido: true, motivoPerda: 'OUTRO' }) },
      etapas,
    );
    expect(r).toEqual({ estagioId: 'id-SL_DESCARTADO', guardarAntesDaSaida: true });
  });

  it('de uma saída para outra não sobrescreve a etapa guardada', () => {
    const r = destinoStarlink(
      { estagioId: 'id-SL_DESCARTADO', tipoEtapaAtual: 'SAIDA', starlink: linha({ perdido: true, motivoPerda: 'NAO_RESPONDEU' }) },
      etapas,
    );
    expect(r).toEqual({ estagioId: 'id-SL_NURTURE', guardarAntesDaSaida: false });
  });

  it('etapa derivada ausente no funil: não move', () => {
    const r = destinoStarlink(
      { estagioId: 'antigo', tipoEtapaAtual: 'NORMAL', starlink: linha({ cnpjApto: true }) },
      new Map(),
    );
    expect(r).toBeNull();
  });
});
