import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { colidiuNoVinculoDeCredenciamento } from '../../lib/erros-prisma';
import { chaveDoVinculo, pertenceAoVinculo, whereDoVinculo } from './vinculo';

describe('whereDoVinculo', () => {
  it('com conta: a conta identifica o parceiro (qualquer contato dela)', () => {
    expect(whereDoVinculo({ operacao: 'TIM', contaId: 'conta-1', contatoId: 'contato-1' })).toEqual({
      operacao: 'TIM',
      arquivadoEm: null,
      contaId: 'conta-1',
    });
  });
  it('sem conta: o contato identifica, entre os cards sem conta', () => {
    expect(whereDoVinculo({ operacao: 'STARLINK', contaId: null, contatoId: 'contato-1' })).toEqual({
      operacao: 'STARLINK',
      arquivadoEm: null,
      contaId: null,
      contatoId: 'contato-1',
    });
  });
  it('nao filtra situacao de excecao: card em excecao ainda e o vinculo', () => {
    expect(whereDoVinculo({ operacao: 'TIM', contaId: null, contatoId: 'c' })).not.toHaveProperty('situacaoExcecao');
  });
});

describe('pertenceAoVinculo (mesmo criterio, em memoria)', () => {
  const card = {
    operacao: 'TIM' as const,
    contaId: 'conta-1' as string | null,
    contatoId: 'contato-9',
    arquivadoEm: null as Date | null,
    situacaoExcecao: null as 'CANCELADO' | null,
  };
  it('com conta: outro contato da mesma conta e o mesmo vinculo', () => {
    expect(pertenceAoVinculo(card, { operacao: 'TIM', contaId: 'conta-1', contatoId: 'contato-1' })).toBe(true);
  });
  it('outra operacao nao e o mesmo vinculo', () => {
    expect(pertenceAoVinculo(card, { operacao: 'STARLINK', contaId: 'conta-1', contatoId: 'contato-1' })).toBe(false);
  });
  it('sem conta: casa pelo contato e so com card sem conta', () => {
    const semConta = { ...card, contaId: null, contatoId: 'contato-1' };
    expect(pertenceAoVinculo(semConta, { operacao: 'TIM', contaId: null, contatoId: 'contato-1' })).toBe(true);
    expect(pertenceAoVinculo(card, { operacao: 'TIM', contaId: null, contatoId: 'contato-9' })).toBe(false);
  });
  it('card arquivado nao conta', () => {
    expect(
      pertenceAoVinculo({ ...card, arquivadoEm: new Date() }, { operacao: 'TIM', contaId: 'conta-1', contatoId: 'x' }),
    ).toBe(false);
  });
  it('card em excecao conta como existente', () => {
    // Variavel (e nao literal) para passar o card inteiro, com a situacao, sem excesso de propriedade.
    const emExcecao = { ...card, situacaoExcecao: 'CANCELADO' as const };
    expect(pertenceAoVinculo(emExcecao, { operacao: 'TIM', contaId: 'conta-1', contatoId: 'x' })).toBe(true);
  });
});

describe('chaveDoVinculo', () => {
  it('igual para dois contatos da mesma conta; diferente entre operacoes', () => {
    expect(chaveDoVinculo({ operacao: 'TIM', contaId: 'k', contatoId: 'a' })).toBe(
      chaveDoVinculo({ operacao: 'TIM', contaId: 'k', contatoId: 'b' }),
    );
    expect(chaveDoVinculo({ operacao: 'TIM', contaId: 'k', contatoId: 'a' })).not.toBe(
      chaveDoVinculo({ operacao: 'STARLINK', contaId: 'k', contatoId: 'a' }),
    );
  });
  it('conta e contato com o mesmo id nao colidem', () => {
    expect(chaveDoVinculo({ operacao: 'TIM', contaId: 'x', contatoId: 'y' })).not.toBe(
      chaveDoVinculo({ operacao: 'TIM', contaId: null, contatoId: 'x' }),
    );
  });
});

describe('colidiuNoVinculoDeCredenciamento', () => {
  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'teste',
      meta: { target },
    });
  it('reconhece os indices parciais pelo nome ou pelas colunas', () => {
    expect(colidiuNoVinculoDeCredenciamento(p2002('credenciamentos_vinculo_conta_key'))).toBe(true);
    expect(colidiuNoVinculoDeCredenciamento(p2002('credenciamentos_vinculo_contato_key'))).toBe(true);
    expect(colidiuNoVinculoDeCredenciamento(p2002(['organizacao_id', 'operacao', 'conta_id']))).toBe(true);
    expect(colidiuNoVinculoDeCredenciamento(p2002(['organizacao_id', 'operacao', 'contato_id']))).toBe(true);
  });
  it('nao mascara outro conflito nem outro erro', () => {
    expect(colidiuNoVinculoDeCredenciamento(p2002(['id']))).toBe(false);
    expect(colidiuNoVinculoDeCredenciamento(p2002('funil_estagios_funil_id_chave_key'))).toBe(false);
    expect(colidiuNoVinculoDeCredenciamento(new Error('x'))).toBe(false);
  });
});
