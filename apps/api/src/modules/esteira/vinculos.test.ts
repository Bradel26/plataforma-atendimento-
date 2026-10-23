import { describe, expect, it } from 'vitest';
import { chaveDoVinculo, vinculoAntesDeCriar } from './vinculo';
import {
  avisosDoVinculo,
  destinosStarlink,
  destinosTim,
  errosDeMovimento,
  estaParado,
  etiquetasDoVinculo,
  mudancaDeSituacao,
  patchStarlinkParaMovimento,
  semIndefinidos,
  situacaoDaEtapa,
  tipoDoHistorico,
} from './movimento';
import { CAMPOS_STARLINK_VAZIO, aplicarTravas, derivarEtapaStarlink, type CamposStarlink } from './starlink';
import type { CamposTim } from './tim';
import type { Avaliacao } from './tipos';

const agora = new Date('2026-10-23T12:00:00Z');
const ontem = new Date('2026-10-22T12:00:00Z');

const sl = (parcial: Partial<CamposStarlink> = {}): CamposStarlink => ({ ...CAMPOS_STARLINK_VAZIO, ...parcial });
const emAtendimento = sl({ primeiroContatoEm: ontem });
const emCredenciamento = sl({ primeiroContatoEm: ontem, cnpjApto: true });
const emTreinamento = sl({ ...emCredenciamento, vsm: true, vivensisStatus: 'APROVADO', treinamento: true });

const timVazio: CamposTim = {
  origem: null,
  flagTrafegoPago: false,
  statusDescritivo: null,
  dep: null,
  dataCredenciamento: null,
  matriculaSappdv: null,
  promoStatus: null,
  tipoCarteira: null,
  sistemaTimVendas: null,
  sistemaGn: null,
  sistemaTimFormaMais: null,
  sistemaPortalFornecedor: null,
  sistemaMeuTim: null,
  compraChip: null,
  treinamento: null,
  statusParceria: null,
};
const tim = (parcial: Partial<CamposTim> = {}): CamposTim => ({ ...timVazio, ...parcial });

describe('chave de unicidade do vínculo (chaveDoVinculo)', () => {
  it('a conta vence o contato', () => {
    expect(chaveDoVinculo({ operacao: 'TIM', contaId: 'conta-1', contatoId: 'contato-1' })).toBe('TIM:conta:conta-1');
    expect(chaveDoVinculo({ operacao: 'TIM', contaId: 'conta-1', contatoId: 'contato-2' })).toBe('TIM:conta:conta-1');
    expect(chaveDoVinculo({ operacao: 'TIM', contaId: null, contatoId: 'contato-1' })).toBe('TIM:contato:contato-1');
  });
  it('operações diferentes geram chaves diferentes', () => {
    const v = { contaId: 'conta-1', contatoId: 'contato-1' };
    expect(chaveDoVinculo({ ...v, operacao: 'TIM' })).not.toBe(chaveDoVinculo({ ...v, operacao: 'STARLINK' }));
  });
});

describe('situacaoDaEtapa', () => {
  it('saídas viram o nome da situação', () => {
    expect(situacaoDaEtapa('SAIDA', 'TIM_DESISTENCIA')).toBe('DESISTENTE');
    expect(situacaoDaEtapa('SAIDA', 'TIM_DESCREDENCIADO')).toBe('DESCREDENCIADO');
    expect(situacaoDaEtapa('SAIDA', 'SL_NURTURE')).toBe('NURTURE');
    expect(situacaoDaEtapa('SAIDA', 'SL_DESCARTADO')).toBe('DESCARTADO');
  });
  it('NORMAL e DESVIO são EM_ANDAMENTO', () => {
    expect(situacaoDaEtapa('NORMAL', 'TIM_NEGOCIACAO')).toBe('EM_ANDAMENTO');
    expect(situacaoDaEtapa('DESVIO', 'SL_MEI')).toBe('EM_ANDAMENTO');
    expect(situacaoDaEtapa('NORMAL', null)).toBe('EM_ANDAMENTO');
  });
});

describe('errosDeMovimento', () => {
  const comum = { perfil: 'COMERCIAL' as const, nivel: 'EDICAO' as const };
  const chefe = { perfil: 'SUPERVISOR' as const, nivel: 'EDICAO' as const };

  it('LIVRE sem motivo exigido passa', () => {
    expect(errosDeMovimento({ resultado: 'LIVRE', tipo: 'MOVIMENTO' }, comum)).toBeNull();
  });
  it('saída sem motivo → 400 EXIGE_MOTIVO; com motivo passa', () => {
    const saida = { resultado: 'LIVRE', tipo: 'SAIDA', exigeMotivo: true } as const;
    expect(errosDeMovimento(saida, comum)).toMatchObject({ status: 400, code: 'EXIGE_MOTIVO' });
    expect(errosDeMovimento(saida, { ...comum, motivo: '   ' })).toMatchObject({ status: 400, code: 'EXIGE_MOTIVO' });
    expect(errosDeMovimento(saida, { ...comum, motivo: 'Desistiu' })).toBeNull();
  });
  it('PROIBIDO → 400 TRANSICAO_PROIBIDA com o motivo da regra', () => {
    expect(errosDeMovimento({ resultado: 'PROIBIDO', motivo: 'Não pode' }, chefe)).toMatchObject({
      status: 400,
      code: 'TRANSICAO_PROIBIDA',
      mensagem: 'Não pode',
    });
  });
  it('JUSTIFICATIVA sem justificativa → 409 EXIGE_JUSTIFICATIVA; com ela passa', () => {
    const correcao = { resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' } as const;
    expect(errosDeMovimento(correcao, comum)).toMatchObject({
      status: 409,
      code: 'EXIGE_JUSTIFICATIVA',
      details: { resultado: 'JUSTIFICATIVA', pendencias: [] },
    });
    expect(errosDeMovimento(correcao, { ...comum, justificativa: 'Lançado errado' })).toBeNull();
  });
  it('EXCECAO de quem não pode forçar → 403 EXCECAO_NAO_AUTORIZADA (mesmo com justificativa)', () => {
    const excecao: Avaliacao = { resultado: 'EXCECAO', pendencias: ['matriculaSappdv'] };
    expect(errosDeMovimento(excecao, { ...comum, justificativa: 'Urgente' })).toMatchObject({
      status: 403,
      code: 'EXCECAO_NAO_AUTORIZADA',
      details: { pendencias: ['matriculaSappdv'] },
    });
    expect(errosDeMovimento(excecao, { perfil: 'ADMIN', nivel: 'LEITURA', justificativa: 'x' })).toMatchObject({ status: 403 });
  });
  it('EXCECAO de quem pode forçar: sem justificativa → 409; com justificativa passa', () => {
    const excecao: Avaliacao = { resultado: 'EXCECAO', pendencias: ['matriculaSappdv'] };
    expect(errosDeMovimento(excecao, chefe)).toMatchObject({
      status: 409,
      code: 'EXIGE_JUSTIFICATIVA',
      details: { resultado: 'EXCECAO', pendencias: ['matriculaSappdv'] },
    });
    expect(errosDeMovimento(excecao, { ...chefe, justificativa: 'Autorizado pela TIM' })).toBeNull();
  });
  it('EXCECAO sem pendências (volta longa, pulo sem gate) também exige justificativa e poder forçar', () => {
    const excecao: Avaliacao = { resultado: 'EXCECAO', pendencias: [] };
    expect(errosDeMovimento(excecao, { ...comum, justificativa: 'x' })).toMatchObject({ status: 403 });
    expect(errosDeMovimento(excecao, chefe)).toMatchObject({ status: 409, details: { resultado: 'EXCECAO', pendencias: [] } });
    expect(errosDeMovimento(excecao, { ...chefe, justificativa: 'x' })).toBeNull();
  });
});

describe('tipoDoHistorico', () => {
  it('exceção forçada grava EXCECAO; o resto grava o tipo da avaliação', () => {
    expect(tipoDoHistorico({ resultado: 'EXCECAO', pendencias: [] })).toBe('EXCECAO');
    expect(tipoDoHistorico({ resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' })).toBe('CORRECAO');
    expect(tipoDoHistorico({ resultado: 'LIVRE', tipo: 'SAIDA', exigeMotivo: true })).toBe('SAIDA');
  });
});

describe('semIndefinidos', () => {
  it('tira as chaves undefined e mantém null', () => {
    expect(semIndefinidos({ cnpjApto: undefined, mei: null, vsm: true })).toEqual({ mei: null, vsm: true });
  });
});

describe('patchStarlinkParaMovimento', () => {
  it('fora da perda delega para patchParaColuna', () => {
    expect(patchStarlinkParaMovimento('SL_CREDENCIAMENTO', emAtendimento, agora)).toEqual({ cnpjApto: true });
  });
  it('reengajar Nurture para a coluna em que estava: só limpa a perda', () => {
    const nurture = sl({ ...emCredenciamento, perdido: true, motivoPerda: 'NAO_RESPONDEU' });
    expect(derivarEtapaStarlink(nurture)).toBe('SL_NURTURE');
    const patch = patchStarlinkParaMovimento('SL_CREDENCIAMENTO', nurture, agora);
    expect(patch).toEqual({ perdido: null });
    expect(derivarEtapaStarlink(aplicarTravas(nurture, patch))).toBe('SL_CREDENCIAMENTO');
  });
  it('reengajar Nurture para outra coluna: limpa a perda e aplica o patch da coluna', () => {
    const nurture = sl({ ...emAtendimento, perdido: true, motivoPerda: 'SEM_CONTATO' });
    const patch = patchStarlinkParaMovimento('SL_CREDENCIAMENTO', nurture, agora);
    expect(patch).toEqual({ perdido: null, cnpjApto: true });
    expect(derivarEtapaStarlink(aplicarTravas(nurture, patch))).toBe('SL_CREDENCIAMENTO');
  });
  it('voltar abaixo de onde estava ao reengajar limpa os campos acima', () => {
    const nurture = sl({ ...emCredenciamento, perdido: true, motivoPerda: 'NAO_RESPONDEU' });
    const patch = patchStarlinkParaMovimento('SL_EM_ATENDIMENTO', nurture, agora);
    expect(patch).toMatchObject({ perdido: null, cnpjApto: null });
    expect(derivarEtapaStarlink(aplicarTravas(nurture, patch))).toBe('SL_EM_ATENDIMENTO');
  });
  it('de perda para outra saída exige o motivo (lança como patchParaColuna)', () => {
    const nurture = sl({ ...emAtendimento, perdido: true, motivoPerda: 'NAO_RESPONDEU' });
    expect(() => patchStarlinkParaMovimento('SL_DESCARTADO', nurture, agora)).toThrow('Informe o motivo da perda');
    expect(patchStarlinkParaMovimento('SL_DESCARTADO', nurture, agora, 'SEM_INTERESSE')).toEqual({
      perdido: true,
      motivoPerda: 'SEM_INTERESSE',
    });
  });
  it('mesma coluna lança', () => {
    expect(() => patchStarlinkParaMovimento('SL_EM_ATENDIMENTO', emAtendimento, agora)).toThrow('já está nesta etapa');
  });
});

describe('destinosTim', () => {
  const ctx = { perfil: 'COMERCIAL' as const, agora, antesDaSaida: null };
  it('etapa atual é PROIBIDO; próxima livre; pulo é EXCECAO; voltar 1 pede justificativa', () => {
    const d = destinosTim('TIM_DOCUMENTACAO', tim(), ctx);
    expect(d.TIM_DOCUMENTACAO).toBe('PROIBIDO');
    expect(d.TIM_CRED_ANDAMENTO).toBe('LIVRE');
    expect(d.TIM_CRED_OK).toBe('EXCECAO');
    expect(d.TIM_NEGOCIACAO).toBe('JUSTIFICATIVA');
    expect(d.TIM_DESISTENCIA).toBe('LIVRE');
    expect(d.TIM_DESCREDENCIADO).toBe('PROIBIDO');
    expect(Object.keys(d)).toHaveLength(9);
  });
});

describe('destinosStarlink', () => {
  it('etapa atual PROIBIDO; próxima LIVRE; pulo EXCECAO; voltar JUSTIFICATIVA; saídas LIVRE', () => {
    const d = destinosStarlink(emCredenciamento, agora);
    expect(d.SL_CREDENCIAMENTO).toBe('PROIBIDO');
    expect(d.SL_TREINAMENTO).toBe('EXCECAO'); // falta VSM e Vivensis
    expect(d.SL_PARCEIRO).toBe('EXCECAO');
    expect(d.SL_EM_ATENDIMENTO).toBe('JUSTIFICATIVA');
    expect(d.SL_NURTURE).toBe('LIVRE');
    expect(d.SL_DESCARTADO).toBe('LIVRE');
    expect(Object.keys(d)).toHaveLength(11);
  });
  it('desvio impossível (trilho já passou do credenciamento) é PROIBIDO', () => {
    const d = destinosStarlink(emTreinamento, agora);
    expect(d.SL_MEI).toBe('PROIBIDO');
    expect(d.SL_ALT_CNAE).toBe('PROIBIDO');
    expect(d.SL_PARCEIRO).toBe('LIVRE');
  });
  it('reabrir Descartado pede justificativa, inclusive para Nurture', () => {
    const descartado = sl({ ...emAtendimento, perdido: true, motivoPerda: 'SEM_INTERESSE' });
    const d = destinosStarlink(descartado, agora);
    expect(d.SL_DESCARTADO).toBe('PROIBIDO');
    expect(d.SL_EM_ATENDIMENTO).toBe('JUSTIFICATIVA');
    expect(d.SL_NURTURE).toBe('JUSTIFICATIVA');
  });
  it('reengajar Nurture na coluna em que estava é livre', () => {
    const nurture = sl({ ...emAtendimento, perdido: true, motivoPerda: 'NAO_RESPONDEU' });
    expect(destinosStarlink(nurture, agora).SL_EM_ATENDIMENTO).toBe('LIVRE');
  });
});

describe('avisosDoVinculo', () => {
  it('TIM além do gate de matrícula sem matrícula → DADOS_PENDENTES', () => {
    expect(avisosDoVinculo({ operacao: 'TIM', chave: 'TIM_POS_CRED', campos: tim() })).toEqual(['DADOS_PENDENTES']);
    expect(avisosDoVinculo({ operacao: 'TIM', chave: 'TIM_POS_CRED', campos: tim({ matriculaSappdv: '123' }) })).toEqual([]);
    expect(avisosDoVinculo({ operacao: 'TIM', chave: 'TIM_CRED_OK', campos: tim() })).toEqual([]);
  });
  it('TIM em Venda liberada sem "pronto" → DADOS_PENDENTES', () => {
    expect(
      avisosDoVinculo({ operacao: 'TIM', chave: 'TIM_VENDA_LIBERADA', campos: tim({ matriculaSappdv: '1' }) }),
    ).toEqual(['DADOS_PENDENTES']);
  });
  it('TIM em saída não avisa', () => {
    expect(avisosDoVinculo({ operacao: 'TIM', chave: 'TIM_DESCREDENCIADO', campos: tim() })).toEqual([]);
  });
  it('Starlink migrado em etapa avançada sem os campos do gate → DADOS_PENDENTES', () => {
    const migrado = sl({ contrato: true });
    expect(avisosDoVinculo({ operacao: 'STARLINK', chave: 'SL_CONTRATO', campos: migrado })).toEqual(['DADOS_PENDENTES']);
    expect(avisosDoVinculo({ operacao: 'STARLINK', chave: 'SL_TREINAMENTO', campos: emTreinamento })).toEqual([]);
  });
  it('Starlink com cnpjApto NÃO sem MEI/alt CNAE → SUGERE_DESCARTE', () => {
    expect(
      avisosDoVinculo({ operacao: 'STARLINK', chave: 'SL_EM_ATENDIMENTO', campos: sl({ ...emAtendimento, cnpjApto: false }) }),
    ).toEqual(['SUGERE_DESCARTE']);
  });
});

describe('mudancaDeSituacao', () => {
  it('entrar numa saída grava situação, motivo, classe, fechamento e etapa anterior', () => {
    expect(
      mudancaDeSituacao({
        de: { id: 'e2', tipo: 'NORMAL', chave: 'SL_EM_ATENDIMENTO' },
        para: { tipo: 'SAIDA', chave: 'SL_NURTURE' },
        motivo: 'Não respondeu',
        classe: 'RECUPERAVEL',
        agora,
      }),
    ).toEqual({
      situacaoDesde: agora,
      motivoSituacao: 'Não respondeu',
      classeMotivo: 'RECUPERAVEL',
      fechadoEm: agora,
      estagioAntesDaSaidaId: 'e2',
    });
  });
  it('sair da saída limpa situação e etapa anterior', () => {
    expect(
      mudancaDeSituacao({
        de: { id: 'e9', tipo: 'SAIDA', chave: 'TIM_DESISTENCIA' },
        para: { tipo: 'NORMAL', chave: 'TIM_DOCUMENTACAO' },
        motivo: null,
        classe: null,
        agora,
      }),
    ).toEqual({ situacaoDesde: agora, motivoSituacao: null, classeMotivo: null, fechadoEm: null, estagioAntesDaSaidaId: null });
  });
  it('trocar de saída mantém a etapa anterior; movimento no trilho não mexe em nada', () => {
    expect(
      mudancaDeSituacao({
        de: { id: 'n', tipo: 'SAIDA', chave: 'SL_NURTURE' },
        para: { tipo: 'SAIDA', chave: 'SL_DESCARTADO' },
        motivo: 'Sem interesse',
        classe: 'DEFINITIVO',
        agora,
      }),
    ).toEqual({ situacaoDesde: agora, motivoSituacao: 'Sem interesse', classeMotivo: 'DEFINITIVO', fechadoEm: agora });
    expect(
      mudancaDeSituacao({
        de: { id: 'a', tipo: 'NORMAL', chave: 'TIM_NEGOCIACAO' },
        para: { tipo: 'NORMAL', chave: 'TIM_DOCUMENTACAO' },
        motivo: null,
        classe: null,
        agora,
      }),
    ).toEqual({});
  });
});

describe('estaParado', () => {
  it('parado a partir do limite da etapa; sem limite nunca', () => {
    expect(estaParado(5, 5)).toBe(true);
    expect(estaParado(4, 5)).toBe(false);
    expect(estaParado(100, null)).toBe(false);
  });
});

describe('etiquetasDoVinculo', () => {
  it('Starlink: captação, VSM e Vivensis', () => {
    expect(
      etiquetasDoVinculo('STARLINK', sl({ tipoCaptacao: 'LEAD_INBOUND', vsm: true, vivensisStatus: 'PENDENTE' })),
    ).toEqual(['Lead inbound', 'VSM', 'Vivensis pendente']);
  });
  it('TIM: tráfego pago e DEP', () => {
    expect(etiquetasDoVinculo('TIM', tim({ flagTrafegoPago: true, dep: 'PARCEIRO' }))).toEqual(['Tráfego pago', 'DEP: Parceiro']);
    expect(etiquetasDoVinculo('TIM', tim())).toEqual([]);
  });
});

describe('vinculoAntesDeCriar', () => {
  it('conta existente: confere pela conta', () => {
    expect(vinculoAntesDeCriar('TIM', { contaId: 'conta-1', contaNova: false, contatoId: null })).toMatchObject({
      operacao: 'TIM',
      contaId: 'conta-1',
    });
  });
  it('sem conta e contato existente: confere pelo contato', () => {
    expect(vinculoAntesDeCriar('STARLINK', { contaId: null, contaNova: false, contatoId: 'contato-1' })).toEqual({
      operacao: 'STARLINK',
      contaId: null,
      contatoId: 'contato-1',
    });
  });
  it('conta nova (CNPJ inédito) ou parceiro todo novo: nada a conferir', () => {
    expect(vinculoAntesDeCriar('TIM', { contaId: null, contaNova: true, contatoId: 'contato-1' })).toBeNull();
    expect(vinculoAntesDeCriar('TIM', { contaId: null, contaNova: false, contatoId: null })).toBeNull();
  });
});
