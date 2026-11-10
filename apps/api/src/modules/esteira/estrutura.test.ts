import { describe, expect, it } from 'vitest';
import { ETAPAS } from './catalogo';
import { ordensFinais, planoDeSincronizacao, type EtapaExistente } from './estrutura';

/** Funil TIM de hoje (spec 3), com as chaves que a migration de dados aplica. */
const timAtual: EtapaExistente[] = [
  { id: 'neg', nome: 'Em negociação', ordem: 1, chave: 'TIM_NEGOCIACAO' },
  { id: 'and', nome: 'Credenciamento em andamento', ordem: 2, chave: 'TIM_CRED_ANDAMENTO' },
  { id: 'doc', nome: 'Documentação', ordem: 3, chave: 'TIM_DOCUMENTACAO' },
  { id: 'ok', nome: 'Credenciamento OK', ordem: 4, chave: 'TIM_CRED_OK' },
  { id: 'apto', nome: 'Apto para venda', ordem: 5, chave: 'TIM_VENDA_LIBERADA' },
];

describe('planoDeSincronizacao', () => {
  it('funil TIM atual: cria as etapas que faltam e reordena documentacao/andamento', () => {
    const plano = planoDeSincronizacao(timAtual, ETAPAS.TIM);
    expect(plano.criar.map((e) => e.chave)).toEqual([
      'TIM_POS_CRED',
      'TIM_ACOMPANHAMENTO',
      'TIM_DESISTENCIA',
      'TIM_DESCREDENCIADO',
    ]);
    expect(plano.atualizar).toContainEqual({ id: 'doc', chave: 'TIM_DOCUMENTACAO', ordem: 2, tipo: 'NORMAL' });
    expect(plano.atualizar).toContainEqual({ id: 'and', chave: 'TIM_CRED_ANDAMENTO', ordem: 3, tipo: 'NORMAL' });
    expect(plano.atualizar).toContainEqual({ id: 'apto', chave: 'TIM_VENDA_LIBERADA', ordem: 6, tipo: 'NORMAL' });
    expect(plano.desativar).toEqual([]);
  });

  it('etapa ja na ordem, chave e tipo certos nao entra em atualizar', () => {
    const plano = planoDeSincronizacao(timAtual, ETAPAS.TIM);
    expect(plano.atualizar.map((a) => a.id)).not.toContain('neg');
    expect(plano.atualizar.map((a) => a.id)).not.toContain('ok');
  });

  it('etapa sem chave e sem correspondencia vai para desativar (nunca apagada)', () => {
    const plano = planoDeSincronizacao(
      [...timAtual, { id: 'velha', nome: 'Novo cadastro', ordem: 6, chave: null }],
      ETAPAS.TIM,
    );
    expect(plano.desativar).toEqual(['velha']);
  });

  it('etapa ja desativada nao entra de novo em desativar', () => {
    const plano = planoDeSincronizacao(
      [{ id: 'velha', nome: 'Novo cadastro', ordem: 20, chave: null, ativa: false }],
      ETAPAS.TIM,
    );
    expect(plano.desativar).toEqual([]);
  });

  it('etapa com chave fora do catalogo tambem e desativada', () => {
    const plano = planoDeSincronizacao([{ id: 'x', nome: 'Qualquer', ordem: 1, chave: 'SL_MEI' }], ETAPAS.TIM);
    expect(plano.desativar).toEqual(['x']);
  });

  it('etapa sem chave com nome antigo conhecido recebe a chave (migration ainda nao rodou)', () => {
    const plano = planoDeSincronizacao(
      [{ id: 'vsm', nome: 'Preencher o VSM', ordem: 1, chave: null }],
      ETAPAS.STARLINK,
    );
    expect(plano.atualizar).toContainEqual({ id: 'vsm', chave: 'SL_CREDENCIAMENTO', ordem: 3, tipo: 'NORMAL' });
    expect(plano.criar.map((e) => e.chave)).not.toContain('SL_CREDENCIAMENTO');
    expect(plano.desativar).toEqual([]);
  });

  it('renomeacao do ADMIN e preservada: nome nunca aparece em atualizar', () => {
    const renomeada = timAtual.map((e) => (e.id === 'doc' ? { ...e, nome: 'Docs pendentes' } : e));
    const plano = planoDeSincronizacao(renomeada, ETAPAS.TIM);
    const doc = plano.atualizar.find((a) => a.id === 'doc');
    expect(doc).toEqual({ id: 'doc', chave: 'TIM_DOCUMENTACAO', ordem: 2, tipo: 'NORMAL' });
  });

  it('tipo diferente do catalogo ou etapa inativa com chave entram em atualizar', () => {
    const plano = planoDeSincronizacao(
      [
        { id: 'neg', nome: 'Em negociação', ordem: 1, chave: 'TIM_NEGOCIACAO', tipoEtapa: 'DESVIO' },
        { id: 'ok', nome: 'Credenciamento OK', ordem: 4, chave: 'TIM_CRED_OK', ativa: false },
      ],
      ETAPAS.TIM,
    );
    expect(plano.atualizar.map((a) => a.id).sort()).toEqual(['neg', 'ok']);
  });

  it('funil vazio: cria o catalogo inteiro', () => {
    const plano = planoDeSincronizacao([], ETAPAS.STARLINK);
    expect(plano.criar).toEqual(ETAPAS.STARLINK);
    expect(plano.atualizar).toEqual([]);
  });

  it('funil ja sincronizado: plano vazio (idempotente)', () => {
    const sincronizado: EtapaExistente[] = ETAPAS.TIM.map((e) => ({
      id: e.chave,
      nome: e.nome,
      ordem: e.ordem,
      chave: e.chave,
      tipoEtapa: e.tipo,
      ativa: true,
    }));
    expect(planoDeSincronizacao(sincronizado, ETAPAS.TIM)).toEqual({ criar: [], atualizar: [], desativar: [] });
  });
});

describe('ordensFinais', () => {
  it('etapas do catalogo na ordem do catalogo; as sem correspondencia vao para o fim, na ordem antiga', () => {
    const ordens = ordensFinais(
      [
        { id: 'b', nome: 'Pendencia', ordem: 2, chave: null },
        { id: 'a', nome: 'Novo cadastro', ordem: 1, chave: null },
        { id: 'doc', nome: 'Documentação', ordem: 3, chave: 'TIM_DOCUMENTACAO' },
      ],
      ETAPAS.TIM,
    );
    expect(ordens.get('doc')).toBe(2);
    expect(ordens.get('a')).toBe(ETAPAS.TIM.length + 1);
    expect(ordens.get('b')).toBe(ETAPAS.TIM.length + 2);
  });
});
