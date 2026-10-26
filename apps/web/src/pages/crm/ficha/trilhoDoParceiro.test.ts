import { describe, expect, it } from 'vitest';
import type { EtapaEsteira } from '../../../lib/esteiraTypes';
import { trilhoDoParceiro } from './trilhoDoParceiro';

type Etapa = Pick<EtapaEsteira, 'chave' | 'nome' | 'tipo' | 'trilho'>;

// Fora de ordem de propósito: o trilho vem do campo `trilho`, não da posição.
// Fixture pura: os tipos não precisam bater com o catálogo real.
const etapas: Etapa[] = [
  { chave: 'TIM_DESISTENCIA', nome: 'Desistência', tipo: 'SAIDA', trilho: null },
  { chave: 'TIM_DOCUMENTACAO', nome: 'Documentação', tipo: 'NORMAL', trilho: 2 },
  { chave: 'TIM_NEGOCIACAO', nome: 'Em negociação', tipo: 'NORMAL', trilho: 1 },
  { chave: 'TIM_CRED_OK', nome: 'Credenciado', tipo: 'NORMAL', trilho: 3 },
  { chave: 'TIM_ACOMPANHAMENTO', nome: 'Acompanhamento', tipo: 'DESVIO', trilho: null },
];

describe('trilhoDoParceiro', () => {
  it('etapas do trilho principal em ordem, com feitas, a atual e as futuras', () => {
    expect(trilhoDoParceiro(etapas, 'TIM_DOCUMENTACAO')).toEqual({
      passos: [
        { chave: 'TIM_NEGOCIACAO', nome: 'Em negociação', estado: 'feito' },
        { chave: 'TIM_DOCUMENTACAO', nome: 'Documentação', estado: 'atual' },
        { chave: 'TIM_CRED_OK', nome: 'Credenciado', estado: 'futuro' },
      ],
      fora: null,
    });
  });

  it('em desvio ou saída: o trilho fica sem atual e a etapa aparece à parte', () => {
    const r = trilhoDoParceiro(etapas, 'TIM_DESISTENCIA');
    expect(r.passos.every((p) => p.estado === 'futuro')).toBe(true);
    expect(r.fora).toEqual({ nome: 'Desistência', tipo: 'SAIDA' });
    expect(trilhoDoParceiro(etapas, 'TIM_ACOMPANHAMENTO').fora).toEqual({ nome: 'Acompanhamento', tipo: 'DESVIO' });
  });

  it('chave nula: só o trilho', () => {
    expect(trilhoDoParceiro(etapas, null).fora).toBeNull();
    expect(trilhoDoParceiro(etapas, null).passos).toHaveLength(3);
  });
});
