import { describe, expect, it } from 'vitest';
import type { ConversaResumo } from '../../lib/types';
import { parametrosDaVisao, pertenceALista, pertenceAVisao } from './visao';

/**
 * Fase 11.3 — as tres visoes da Inbox (Minhas / Nao atribuidas / Todas) sao
 * so uma camada de UI sobre os dois parametros que `GET /conversas` ja
 * aceitava (`status`, `minhas`). Estes testes cobrem exatamente essa
 * traducao — nunca reimplementam a politica de visibilidade, que continua
 * sendo autoridade exclusiva do backend (`politicaConversas.filtro`).
 */
describe('parametrosDaVisao', () => {
  it('1. Minhas envia minhas=true, sem status — API devolve qualquer status atribuído a mim', () => {
    expect(parametrosDaVisao('MINHAS')).toEqual({ minhas: true });
  });

  it('2. Não atribuídas envia status=EM_ESPERA, sem minhas', () => {
    expect(parametrosDaVisao('NAO_ATRIBUIDAS')).toEqual({ status: 'EM_ESPERA' });
  });

  it('3. Todas não envia nenhum parametro extra — não reimplementa nem afrouxa a política de visibilidade do backend', () => {
    expect(parametrosDaVisao('TODAS')).toEqual({});
  });
});

const base = (
  overrides: Partial<Pick<ConversaResumo, 'status' | 'agente'>>,
): Pick<ConversaResumo, 'status' | 'agente'> => ({
  status: 'EM_ESPERA',
  agente: null,
  ...overrides,
});

describe('pertenceAVisao', () => {
  it('6. conversa EM_ESPERA (sem agente) pertence a Não atribuídas', () => {
    const conversa = base({ status: 'EM_ESPERA', agente: null });
    expect(pertenceAVisao(conversa, 'NAO_ATRIBUIDAS', 'user-1')).toBe(true);
    expect(pertenceAVisao(conversa, 'MINHAS', 'user-1')).toBe(false);
    expect(pertenceAVisao(conversa, 'TODAS', 'user-1')).toBe(true);
  });

  it('7. conversa atribuída ao usuário atual pertence a Minhas, não a Não atribuídas', () => {
    const conversa = base({ status: 'ATRIBUIDO', agente: { id: 'user-1', nome: 'Fulano' } });
    expect(pertenceAVisao(conversa, 'MINHAS', 'user-1')).toBe(true);
    expect(pertenceAVisao(conversa, 'NAO_ATRIBUIDAS', 'user-1')).toBe(false);
    expect(pertenceAVisao(conversa, 'TODAS', 'user-1')).toBe(true);
  });

  it('conversa atribuída a OUTRO agente não aparece em Minhas', () => {
    const conversa = base({ status: 'EM_ATENDIMENTO', agente: { id: 'user-2', nome: 'Outra pessoa' } });
    expect(pertenceAVisao(conversa, 'MINHAS', 'user-1')).toBe(false);
    expect(pertenceAVisao(conversa, 'TODAS', 'user-1')).toBe(true);
  });

  it('sem usuário logado (meuUsuarioId nulo), Minhas nunca casa com nada', () => {
    const conversa = base({ status: 'ATRIBUIDO', agente: { id: 'user-1', nome: 'Fulano' } });
    expect(pertenceAVisao(conversa, 'MINHAS', null)).toBe(false);
  });

  it('Todas aceita qualquer status/agente — inclusive finalizado', () => {
    const conversa = base({ status: 'FINALIZADO', agente: { id: 'user-9', nome: 'Alguém' } });
    expect(pertenceAVisao(conversa, 'TODAS', 'user-1')).toBe(true);
  });
});

/**
 * Fase 11.9-B — `pertenceALista` e o que o handler de eventos de socket usa
 * de verdade (nao `pertenceAVisao` sozinho): arquivada sai das tres visoes,
 * sempre, antes de qualquer outra regra.
 */
const comArquivada = (
  overrides: Partial<Pick<ConversaResumo, 'status' | 'agente' | 'arquivada'>>,
): Pick<ConversaResumo, 'status' | 'agente' | 'arquivada'> => ({
  status: 'EM_ESPERA',
  agente: null,
  arquivada: false,
  ...overrides,
});

describe('pertenceALista', () => {
  it('Minhas: conversa arquivada nunca aparece, mesmo atribuída ao usuário atual', () => {
    const conversa = comArquivada({ status: 'ATRIBUIDO', agente: { id: 'user-1', nome: 'Fulano' }, arquivada: true });
    expect(pertenceALista(conversa, 'MINHAS', 'user-1')).toBe(false);
  });

  it('Não atribuídas: conversa arquivada nunca aparece, mesmo EM_ESPERA', () => {
    const conversa = comArquivada({ status: 'EM_ESPERA', agente: null, arquivada: true });
    expect(pertenceALista(conversa, 'NAO_ATRIBUIDAS', 'user-1')).toBe(false);
  });

  it('Todas: conversa arquivada nunca aparece, mesmo dentro do escopo de visibilidade', () => {
    const conversa = comArquivada({ status: 'EM_ATENDIMENTO', agente: { id: 'user-1', nome: 'Fulano' }, arquivada: true });
    expect(pertenceALista(conversa, 'TODAS', 'user-1')).toBe(false);
  });

  it('conversa não arquivada continua seguindo exatamente a regra de pertenceAVisao, nas três visões', () => {
    const minha = comArquivada({ status: 'ATRIBUIDO', agente: { id: 'user-1', nome: 'Fulano' }, arquivada: false });
    expect(pertenceALista(minha, 'MINHAS', 'user-1')).toBe(true);
    expect(pertenceALista(minha, 'NAO_ATRIBUIDAS', 'user-1')).toBe(false);
    expect(pertenceALista(minha, 'TODAS', 'user-1')).toBe(true);

    const emEspera = comArquivada({ status: 'EM_ESPERA', agente: null, arquivada: false });
    expect(pertenceALista(emEspera, 'NAO_ATRIBUIDAS', 'user-1')).toBe(true);
  });
});
