import { describe, expect, it } from 'vitest';
import type { ConversaResumo } from '../../lib/types';
import {
  SEM_FILTRO_ACOMPANHAR,
  parametrosDaVisao,
  pertenceALista,
  pertenceAVisao,
  visoesDisponiveis,
  type ContextoDaVisao,
} from './visao';

/**
 * As abas so decidem EM QUAL ABA uma conversa entra (2026-10-05). Quem pode
 * ve-la ja foi decidido pelo servidor (politica na lista, salas no socket).
 */
type Campos = Pick<ConversaResumo, 'status' | 'agente' | 'fila' | 'linha' | 'arquivada'>;
const conversa = (o: Partial<Campos>): Campos => ({
  status: 'ATRIBUIDO',
  agente: null,
  fila: null,
  linha: null,
  arquivada: false,
  ...o,
});
const EU: ContextoDaVisao = { meuUsuarioId: 'u-eu', minhasFilaIds: ['f-comercial'], filtro: SEM_FILTRO_ACOMPANHAR };
const DO_MEU_NUMERO = { id: 'c-meu', donoId: 'u-eu' };
const DO_LEANDRO = { id: 'c-leandro', donoId: 'u-leandro' };
const DA_EMPRESA = { id: 'c-empresa', donoId: null };

describe('visoesDisponiveis', () => {
  it('Acompanhar so para quem pode acompanhar', () => {
    expect(visoesDisponiveis(true)).toEqual(['MINHAS', 'FILA', 'ACOMPANHAR']);
    expect(visoesDisponiveis(false)).toEqual(['MINHAS', 'FILA']);
  });
});

describe('parametrosDaVisao', () => {
  it('manda a aba, e o seletor so em Acompanhar', () => {
    expect(parametrosDaVisao('FILA', { donoId: 'u-x', canalConfigId: 'c-x' })).toEqual({ visao: 'FILA' });
    expect(parametrosDaVisao('ACOMPANHAR', SEM_FILTRO_ACOMPANHAR)).toEqual({ visao: 'ACOMPANHAR' });
    expect(parametrosDaVisao('ACOMPANHAR', { donoId: 'EMPRESA', canalConfigId: null })).toEqual({
      visao: 'ACOMPANHAR',
      donoId: 'EMPRESA',
    });
  });
});

describe('pertenceAVisao', () => {
  it('Minhas = do meu numero, mesmo atribuida a outra pessoa', () => {
    const c = conversa({ linha: DO_MEU_NUMERO, agente: { id: 'u-alessandra', nome: 'Alessandra' } });
    expect(pertenceAVisao(c, 'MINHAS', EU)).toBe(true);
    expect(pertenceAVisao(c, 'FILA', EU)).toBe(false);
    expect(pertenceAVisao(c, 'ACOMPANHAR', EU)).toBe(false);
  });

  it('Fila: transferida para mim de outro numero', () => {
    const c = conversa({ linha: DO_LEANDRO, agente: { id: 'u-eu', nome: 'Eu' } });
    expect(pertenceAVisao(c, 'FILA', EU)).toBe(true);
    expect(pertenceAVisao(c, 'MINHAS', EU)).toBe(false);
  });

  it('Fila: em espera so nas minhas filas', () => {
    const naMinha = conversa({ status: 'EM_ESPERA', linha: DA_EMPRESA, fila: { id: 'f-comercial', nome: 'Comercial' } });
    const naOutra = conversa({ status: 'EM_ESPERA', linha: DA_EMPRESA, fila: { id: 'f-suporte', nome: 'Suporte' } });
    expect(pertenceAVisao(naMinha, 'FILA', EU)).toBe(true);
    expect(pertenceAVisao(naOutra, 'FILA', EU)).toBe(false);
  });

  it('Acompanhar: nunca o meu numero; respeita usuario, Numero da empresa e numero', () => {
    const doLeandro = conversa({ linha: DO_LEANDRO });
    const daEmpresa = conversa({ linha: null });
    const filtroLeandro: ContextoDaVisao = { ...EU, filtro: { donoId: 'u-leandro', canalConfigId: null } };
    const filtroEmpresa: ContextoDaVisao = { ...EU, filtro: { donoId: 'EMPRESA', canalConfigId: null } };
    const outroNumero: ContextoDaVisao = { ...EU, filtro: { donoId: 'u-leandro', canalConfigId: 'c-outro' } };

    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', EU)).toBe(true);
    expect(pertenceAVisao(daEmpresa, 'ACOMPANHAR', EU)).toBe(true);
    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', filtroLeandro)).toBe(true);
    expect(pertenceAVisao(daEmpresa, 'ACOMPANHAR', filtroLeandro)).toBe(false);
    expect(pertenceAVisao(daEmpresa, 'ACOMPANHAR', filtroEmpresa)).toBe(true);
    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', filtroEmpresa)).toBe(false);
    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', outroNumero)).toBe(false);
  });

  it('sem usuario logado nada e "meu"', () => {
    const c = conversa({ linha: { id: 'c', donoId: 'u-eu' } });
    expect(pertenceAVisao(c, 'MINHAS', { ...EU, meuUsuarioId: null })).toBe(false);
  });
});

describe('pertenceALista', () => {
  it('arquivada sai de todas as abas', () => {
    const c = conversa({ linha: DO_MEU_NUMERO, arquivada: true });
    for (const v of ['MINHAS', 'FILA', 'ACOMPANHAR'] as const) expect(pertenceALista(c, v, EU)).toBe(false);
  });
});
