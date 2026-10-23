import { describe, expect, it } from 'vitest';
import {
  avaliarMovimentoTim,
  deveLiberarVenda,
  efeitosDeEntradaTim,
  pendenciasDeCamposTim,
  prontoTim,
  type CamposTim,
} from './tim';
import type { ChaveTim } from './catalogo';

const agora = new Date('2026-10-23T12:00:00Z');

const vazio: CamposTim = {
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
const pronto: CamposTim = { ...vazio, sistemaTimVendas: true, compraChip: 'CONCLUIDO', treinamento: 'CONCLUIDO' };
const comMatricula: CamposTim = { ...vazio, matriculaSappdv: '123' };

const av = (
  de: ChaveTim,
  para: ChaveTim,
  c: CamposTim = vazio,
  extra: { perfil?: 'ADMIN' | 'SUPERVISOR'; antesDaSaida?: ChaveTim | null } = {},
) =>
  avaliarMovimentoTim(de, para, c, {
    perfil: extra.perfil ?? 'SUPERVISOR',
    agora,
    antesDaSaida: extra.antesDaSaida ?? null,
  });

describe('prontoTim', () => {
  it('exige sistema TIM Vendas, chip e treinamento concluídos', () => {
    expect(prontoTim(pronto)).toBe(true);
    expect(prontoTim({ ...pronto, compraChip: 'PENDENTE' })).toBe(false);
    expect(prontoTim({ ...pronto, treinamento: null })).toBe(false);
    expect(prontoTim({ ...pronto, sistemaTimVendas: false })).toBe(false);
  });
});

describe('avaliarMovimentoTim', () => {
  it('avanço de uma etapa entre 1 e 4 é livre', () => {
    expect(av('TIM_NEGOCIACAO', 'TIM_DOCUMENTACAO')).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
    expect(av('TIM_DOCUMENTACAO', 'TIM_CRED_ANDAMENTO')).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
    expect(av('TIM_CRED_ANDAMENTO', 'TIM_CRED_OK')).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
  });
  it('pular etapas é exceção', () => {
    expect(av('TIM_NEGOCIACAO', 'TIM_CRED_ANDAMENTO')).toEqual({ resultado: 'EXCECAO', pendencias: [] });
  });
  it('pular para uma etapa com gate lista as pendências do destino', () => {
    expect(av('TIM_CRED_ANDAMENTO', 'TIM_POS_CRED')).toEqual({ resultado: 'EXCECAO', pendencias: ['matriculaSappdv'] });
    expect(av('TIM_CRED_OK', 'TIM_ACOMPANHAMENTO')).toEqual({
      resultado: 'EXCECAO',
      pendencias: ['matriculaSappdv', 'sistemaTimVendas', 'compraChip', 'treinamento'],
    });
  });
  it('4 → 5 exige matrícula', () => {
    expect(av('TIM_CRED_OK', 'TIM_POS_CRED')).toEqual({ resultado: 'EXCECAO', pendencias: ['matriculaSappdv'] });
    expect(av('TIM_CRED_OK', 'TIM_POS_CRED', comMatricula)).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
  });
  it('5 → 6 exige pronto', () => {
    expect(av('TIM_POS_CRED', 'TIM_VENDA_LIBERADA')).toEqual({
      resultado: 'EXCECAO',
      pendencias: ['sistemaTimVendas', 'compraChip', 'treinamento'],
    });
    expect(av('TIM_POS_CRED', 'TIM_VENDA_LIBERADA', { ...vazio, compraChip: 'CONCLUIDO' }).resultado).toBe('EXCECAO');
    expect(av('TIM_POS_CRED', 'TIM_VENDA_LIBERADA', pronto)).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
  });
  it('6 → 7 é manual e livre', () => {
    expect(av('TIM_VENDA_LIBERADA', 'TIM_ACOMPANHAMENTO')).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
  });
  it('voltar etapa é correção com justificativa', () => {
    expect(av('TIM_CRED_ANDAMENTO', 'TIM_DOCUMENTACAO')).toEqual({ resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' });
    expect(av('TIM_ACOMPANHAMENTO', 'TIM_NEGOCIACAO')).toEqual({ resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' });
  });
  it('mesma etapa é proibido', () => {
    expect(av('TIM_POS_CRED', 'TIM_POS_CRED')).toEqual({ resultado: 'PROIBIDO', motivo: 'O parceiro já está nesta etapa' });
  });
  it('desistência só das etapas 1–3, com motivo', () => {
    expect(av('TIM_DOCUMENTACAO', 'TIM_DESISTENCIA')).toEqual({ resultado: 'LIVRE', tipo: 'SAIDA', exigeMotivo: true });
    expect(av('TIM_NEGOCIACAO', 'TIM_DESISTENCIA').resultado).toBe('LIVRE');
    expect(av('TIM_CRED_ANDAMENTO', 'TIM_DESISTENCIA').resultado).toBe('LIVRE');
    expect(av('TIM_CRED_OK', 'TIM_DESISTENCIA').resultado).toBe('PROIBIDO');
  });
  it('descredenciamento só das etapas 4–7, com motivo', () => {
    expect(av('TIM_POS_CRED', 'TIM_DESCREDENCIADO')).toEqual({ resultado: 'LIVRE', tipo: 'SAIDA', exigeMotivo: true });
    expect(av('TIM_CRED_OK', 'TIM_DESCREDENCIADO').resultado).toBe('LIVRE');
    expect(av('TIM_ACOMPANHAMENTO', 'TIM_DESCREDENCIADO').resultado).toBe('LIVRE');
    expect(av('TIM_DOCUMENTACAO', 'TIM_DESCREDENCIADO').resultado).toBe('PROIBIDO');
  });
  it('reativar desistente volta para a etapa anterior à saída', () => {
    expect(av('TIM_DESISTENCIA', 'TIM_CRED_ANDAMENTO', vazio, { antesDaSaida: 'TIM_CRED_ANDAMENTO' })).toEqual({
      resultado: 'LIVRE',
      tipo: 'REATIVACAO',
    });
  });
  it('desistente para outra etapa é exceção', () => {
    expect(av('TIM_DESISTENCIA', 'TIM_NEGOCIACAO', vazio, { antesDaSaida: 'TIM_CRED_ANDAMENTO' }).resultado).toBe('EXCECAO');
    expect(av('TIM_DESISTENCIA', 'TIM_NEGOCIACAO').resultado).toBe('EXCECAO');
  });
  it('sair de descredenciado: só ADMIN, como correção', () => {
    expect(av('TIM_DESCREDENCIADO', 'TIM_POS_CRED', vazio, { perfil: 'ADMIN' })).toEqual({
      resultado: 'JUSTIFICATIVA',
      tipo: 'CORRECAO',
    });
    expect(av('TIM_DESCREDENCIADO', 'TIM_POS_CRED', vazio, { perfil: 'SUPERVISOR' }).resultado).toBe('PROIBIDO');
  });
});

describe('efeitosDeEntradaTim', () => {
  it('carimba dataCredenciamento ao entrar em CRED_OK, sem sobrescrever', () => {
    expect(efeitosDeEntradaTim('TIM_CRED_OK', vazio, agora)).toEqual({ dataCredenciamento: agora });
    const antiga = new Date('2026-01-01');
    expect(efeitosDeEntradaTim('TIM_CRED_OK', { ...vazio, dataCredenciamento: antiga }, agora)).toEqual({});
  });
  it('POS_CRED define promoStatus e tipoCarteira só se vazios', () => {
    expect(efeitosDeEntradaTim('TIM_POS_CRED', vazio, agora)).toEqual({ promoStatus: 'promovido', tipoCarteira: 'recem-entrada' });
    expect(efeitosDeEntradaTim('TIM_POS_CRED', { ...vazio, promoStatus: 'x', tipoCarteira: 'y' }, agora)).toEqual({});
  });
  it('define statusParceria nas etapas finais', () => {
    expect(efeitosDeEntradaTim('TIM_ACOMPANHAMENTO', vazio, agora)).toEqual({ statusParceria: 'ATIVO' });
    expect(efeitosDeEntradaTim('TIM_DESISTENCIA', vazio, agora)).toEqual({ statusParceria: 'DESISTENTE' });
    expect(efeitosDeEntradaTim('TIM_DESCREDENCIADO', vazio, agora)).toEqual({ statusParceria: 'DESCREDENCIADO' });
  });
  it('reativação para etapa anterior à 7 limpa statusParceria', () => {
    expect(efeitosDeEntradaTim('TIM_DOCUMENTACAO', { ...vazio, statusParceria: 'DESISTENTE' }, agora)).toEqual({ statusParceria: null });
    expect(efeitosDeEntradaTim('TIM_DOCUMENTACAO', vazio, agora)).toEqual({});
  });
});

describe('deveLiberarVenda', () => {
  it('só em POS_CRED com pronto', () => {
    expect(deveLiberarVenda('TIM_POS_CRED', pronto)).toBe(true);
    expect(deveLiberarVenda('TIM_POS_CRED', vazio)).toBe(false);
    expect(deveLiberarVenda('TIM_CRED_OK', pronto)).toBe(false);
  });
});

describe('pendenciasDeCamposTim', () => {
  it('sistema passando a Sim sem vendedor ativo pende', () => {
    expect(pendenciasDeCamposTim(vazio, { ...vazio, sistemaGn: true }, 0)).toEqual(['vendedorAtivo']);
    expect(pendenciasDeCamposTim(vazio, { ...vazio, sistemaGn: true }, 1)).toEqual([]);
  });
  it('sem mudança para Sim não pende', () => {
    expect(pendenciasDeCamposTim({ ...vazio, sistemaGn: true }, { ...vazio, sistemaGn: true }, 0)).toEqual([]);
    expect(pendenciasDeCamposTim({ ...vazio, sistemaGn: true }, { ...vazio, sistemaGn: false }, 0)).toEqual([]);
  });
});
