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
const DO_MEU_NUMERO = { id: 'c-meu', donoId: 'u-eu', nome: 'Minha linha' };
const DO_LEANDRO = { id: 'c-leandro', donoId: 'u-leandro', nome: 'Linha do Leandro' };
const DA_EMPRESA = { id: 'c-empresa', donoId: null, nome: 'Empresa' };

describe('visoesDisponiveis', () => {
  it('Acompanhar so para quem pode acompanhar', () => {
    expect(visoesDisponiveis(true)).toEqual(['MINHAS', 'ATRIBUIDAS', 'ACOMPANHAR']);
    expect(visoesDisponiveis(false)).toEqual(['MINHAS', 'ATRIBUIDAS']);
  });
});

describe('parametrosDaVisao', () => {
  it('manda a aba, e o seletor so em Acompanhar', () => {
    expect(parametrosDaVisao('ATRIBUIDAS', { donoId: 'u-x', canalConfigId: 'c-x' })).toEqual({ visao: 'ATRIBUIDAS' });
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
    expect(pertenceAVisao(c, 'ATRIBUIDAS', EU)).toBe(false);
    expect(pertenceAVisao(c, 'ACOMPANHAR', EU)).toBe(false);
  });

  it('Fila: transferida para mim de outro numero', () => {
    const c = conversa({ linha: DO_LEANDRO, agente: { id: 'u-eu', nome: 'Eu' } });
    expect(pertenceAVisao(c, 'ATRIBUIDAS', EU)).toBe(true);
    expect(pertenceAVisao(c, 'MINHAS', EU)).toBe(false);
  });

  it('Atribuídas não inclui conversas em espera da equipe', () => {
    const naMinha = conversa({ status: 'EM_ESPERA', linha: DA_EMPRESA, fila: { id: 'f-comercial', nome: 'Comercial' } });
    const naOutra = conversa({ status: 'EM_ESPERA', linha: DA_EMPRESA, fila: { id: 'f-suporte', nome: 'Suporte' } });
    expect(pertenceAVisao(naMinha, 'ATRIBUIDAS', EU)).toBe(false);
    expect(pertenceAVisao(naOutra, 'ATRIBUIDAS', EU)).toBe(false);
  });

  it('Acompanhar: nunca o meu numero; respeita usuario, Numero da empresa e numero', () => {
    const doLeandro = conversa({ linha: DO_LEANDRO });
    const daEmpresa = conversa({ linha: DA_EMPRESA });
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
    const c = conversa({ linha: { id: 'c', donoId: 'u-eu', nome: 'Minha linha' } });
    expect(pertenceAVisao(c, 'MINHAS', { ...EU, meuUsuarioId: null })).toBe(false);
  });
});

describe('pertenceALista', () => {
  it('arquivada sai de todas as abas', () => {
    const c = conversa({ linha: DO_MEU_NUMERO, arquivada: true });
    for (const v of ['MINHAS', 'ATRIBUIDAS', 'ACOMPANHAR'] as const) expect(pertenceALista(c, v, EU)).toBe(false);
  });
});
