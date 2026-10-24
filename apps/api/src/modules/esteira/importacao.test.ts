import type { Operacao } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import { ETAPAS, type ChaveEtapa } from './catalogo';
import { planejarImportacao, type EntradaDeImportacao, type EstagioDoPlano, type PontoDePartida } from './importacao';
import { CAMPOS_STARLINK_VAZIO, type CamposStarlink } from './starlink';
import { CAMPOS_TIM_VAZIO, type CamposTim } from './tim';

const AGORA = new Date('2026-10-24T15:00:00Z');

/** Funil com todas as etapas do catálogo (id = chave), ativas salvo as indicadas. */
const estagios = (operacao: Operacao, inativas: ChaveEtapa[] = []): EstagioDoPlano[] =>
  ETAPAS[operacao].map((e) => ({ id: e.chave, chave: e.chave, ativa: !inativas.includes(e.chave) }));

const tim = (chave: ChaveEtapa, campos: Partial<CamposTim> = {}, inativas: ChaveEtapa[] = []): PontoDePartida<EstagioDoPlano> => ({
  operacao: 'TIM',
  chave,
  estagioId: chave,
  estagios: estagios('TIM', inativas),
  tim: { ...CAMPOS_TIM_VAZIO, ...campos },
  starlink: CAMPOS_STARLINK_VAZIO,
});

const starlink = (chave: ChaveEtapa, campos: Partial<CamposStarlink> = {}): PontoDePartida<EstagioDoPlano> => ({
  operacao: 'STARLINK',
  chave,
  estagioId: chave,
  estagios: estagios('STARLINK'),
  tim: CAMPOS_TIM_VAZIO,
  starlink: { ...CAMPOS_STARLINK_VAZIO, ...campos },
});

const entrada = (e: Partial<EntradaDeImportacao>): EntradaDeImportacao => ({ parceiro: { cnpj: '11222333000181' }, campos: {}, ...e });

/** Erro da linha: AppError com o código e um trecho da mensagem. */
function erroDe(f: () => unknown): AppError {
  try {
    f();
  } catch (erro) {
    if (erro instanceof AppError) return erro;
    throw erro;
  }
  throw new Error('não lançou');
}

describe('planejarImportacao — TIM', () => {
  it('posiciona sem gates (pulo sem matrícula) e aplica os efeitos de entrada', () => {
    const plano = planejarImportacao(tim('TIM_NEGOCIACAO'), entrada({ etapa: 'TIM_POS_CRED', campos: { dep: 'PARCEIRO' } }), AGORA);
    expect(plano.movimento?.para.chave).toBe('TIM_POS_CRED');
    expect(plano.movimento).toMatchObject({ motivoSituacao: null, classeMotivo: null });
    expect(plano.tim).toEqual({ dep: 'PARCEIRO', dataCredenciamento: AGORA, promoStatus: 'promovido', tipoCarteira: 'recem-entrada' });
  });

  it('o que veio na planilha prevalece sobre o efeito de entrada', () => {
    const data = new Date('2026-09-01T03:00:00Z');
    const plano = planejarImportacao(tim('TIM_NEGOCIACAO'), entrada({ etapa: 'TIM_CRED_OK', campos: { dataCredenciamento: data } }), AGORA);
    expect(plano.tim).toMatchObject({ dataCredenciamento: data });
  });

  it('Acompanhamento marca a parceria como ATIVO', () => {
    const plano = planejarImportacao(tim('TIM_NEGOCIACAO'), entrada({ etapa: 'TIM_ACOMPANHAMENTO' }), AGORA);
    expect(plano.tim).toMatchObject({ statusParceria: 'ATIVO' });
  });

  it('etapa de saída é recusada: a saída exige motivo, registrado na ficha', () => {
    for (const saida of ['TIM_DESISTENCIA', 'TIM_DESCREDENCIADO'] as const) {
      const erro = erroDe(() => planejarImportacao(tim('TIM_CRED_OK'), entrada({ etapa: saida }), AGORA));
      expect(erro.code).toBe('EXIGE_MOTIVO');
      expect(erro.message).toContain('registre a saída pela ficha do parceiro, com motivo');
    }
  });

  it('já na saída e a planilha repete a mesma etapa: não move nem recusa', () => {
    const plano = planejarImportacao(tim('TIM_DESISTENCIA'), entrada({ etapa: 'TIM_DESISTENCIA', campos: { dep: 'TIM' } }), AGORA);
    expect(plano.movimento).toBeNull();
    expect(plano.tim).toEqual({ dep: 'TIM' });
  });

  it('etapa inativa no funil: erro da linha', () => {
    const erro = erroDe(() => planejarImportacao(tim('TIM_NEGOCIACAO', {}, ['TIM_POS_CRED']), entrada({ etapa: 'TIM_POS_CRED' }), AGORA));
    expect(erro.code).toBe('TRANSICAO_PROIBIDA');
  });

  it('sem etapa: só campos, responsável e observações, sem movimento', () => {
    const plano = planejarImportacao(
      tim('TIM_CRED_OK'),
      entrada({ campos: { matriculaSappdv: 'M1' }, responsavelId: 'u1', observacoes: 'ok' }),
      AGORA,
    );
    expect(plano).toEqual({ movimento: null, tim: { matriculaSappdv: 'M1' }, vinculo: { responsavelId: 'u1', observacoes: 'ok' } });
  });
});

describe('planejarImportacao — Starlink', () => {
  it('coluna Etapa vira o patch da coluna (patchStarlinkParaMovimento)', () => {
    const plano = planejarImportacao(starlink('SL_AGUARDANDO'), entrada({ etapa: 'SL_CREDENCIAMENTO' }), AGORA);
    expect(plano.movimento?.para.chave).toBe('SL_CREDENCIAMENTO');
    expect(plano.starlink).toMatchObject({ cnpjApto: true });
  });

  it('campos que já levam à etapa pedida: sem patch extra', () => {
    const plano = planejarImportacao(
      starlink('SL_AGUARDANDO'),
      entrada({ etapa: 'SL_EM_ATENDIMENTO', campos: { primeiroContatoEm: new Date('2026-10-01T03:00:00Z') } }),
      AGORA,
    );
    expect(plano.movimento?.para.chave).toBe('SL_EM_ATENDIMENTO');
    expect(plano.starlink?.primeiroContatoEm).toEqual(new Date('2026-10-01T03:00:00Z'));
  });

  it('etapa impossível com os campos: erro da linha', () => {
    const atual = { primeiroContatoEm: AGORA, cnpjApto: true, treinamento: true, parceiro: true, contrato: true, prontoVenda: true };
    const erro = erroDe(() => planejarImportacao(starlink('SL_PRONTO_VENDA', atual), entrada({ etapa: 'SL_MEI' }), AGORA));
    expect(erro.code).toBe('TRANSICAO_PROIBIDA');
    expect(erro.message).toContain('Quer abrir MEI');
  });

  it('perda sem motivo: erro da linha (pelos campos e pela coluna Etapa)', () => {
    expect(erroDe(() => planejarImportacao(starlink('SL_AGUARDANDO'), entrada({ campos: { perdido: true } }), AGORA)).code).toBe(
      'EXIGE_MOTIVO',
    );
    expect(erroDe(() => planejarImportacao(starlink('SL_AGUARDANDO'), entrada({ etapa: 'SL_NURTURE' }), AGORA)).message).toContain(
      'motivo da perda',
    );
  });

  it('perda com motivo: move para a saída com a situação do motivo', () => {
    const plano = planejarImportacao(
      starlink('SL_EM_ATENDIMENTO', { primeiroContatoEm: AGORA }),
      entrada({ campos: { perdido: true, motivoPerda: 'SEM_PERFIL' } }),
      AGORA,
    );
    expect(plano.movimento).toMatchObject({ para: { chave: 'SL_DESCARTADO' }, motivoSituacao: 'Sem perfil', classeMotivo: 'DEFINITIVO' });
  });

  it('troca de motivo sem mudar de coluna: a situação acompanha, sem movimento', () => {
    const plano = planejarImportacao(
      starlink('SL_NURTURE', { perdido: true, motivoPerda: 'NAO_RESPONDEU' }),
      entrada({ campos: { motivoPerda: 'SEM_CONTATO' } }),
      AGORA,
    );
    expect(plano.movimento).toBeNull();
    expect(plano.vinculo).toEqual({ motivoSituacao: 'Sem contato', classeMotivo: 'RECUPERAVEL' });
    expect(plano.starlink).toMatchObject({ perdido: true, motivoPerda: 'SEM_CONTATO' });
  });

  it('nada muda: sem movimento e sem colunas do vínculo', () => {
    const plano = planejarImportacao(starlink('SL_EM_ATENDIMENTO', { primeiroContatoEm: AGORA }), entrada({ campos: { vsm: null } }), AGORA);
    expect(plano.movimento).toBeNull();
    expect(plano.vinculo).toEqual({});
  });
});
