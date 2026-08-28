import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import {
  ORGANIZACAO_INICIAL,
  comOrganizacao,
  contextoAtual,
  organizacaoAtual,
  organizacaoAtualOuNula,
  semOrganizacao,
} from './tenant';

/**
 * O contrato do contexto de organizacao.
 *
 * A regra que sustenta o isolamento inteiro esta no primeiro teste: **ausencia de
 * contexto lanca**. O modo de falha classico de multi-tenancy e um filtro
 * opcional que, sem valor, vira "sem filtro" e devolve a base inteira. Aqui a
 * pergunta nem chega ao banco.
 *
 * Estes testes nao tocam o banco de proposito: o comportamento verificado e o do
 * contexto, e um teste que precisa de Postresql para provar que uma funcao lanca
 * so acrescenta motivo para falhar por outra razao.
 */
describe('contexto de organizacao', () => {
  it('sem contexto, organizacaoAtual lanca', () => {
    expect(() => organizacaoAtual()).toThrowError(AppError);
    expect(() => organizacaoAtual()).toThrowError(/organizacao/i);
  });

  it('sem contexto, a variante que "nao lanca" tambem lanca', () => {
    // `organizacaoAtualOuNula` devolve nulo em contexto IRRESTRITO, nao na
    // ausencia de contexto. A diferenca importa: irrestrito e uma decisao
    // declarada; ausencia e esquecimento.
    expect(() => organizacaoAtualOuNula()).toThrowError(/organizacao/i);
  });

  it('dentro do contexto, devolve a organizacao', () => {
    const visto = comOrganizacao(ORGANIZACAO_INICIAL, () => organizacaoAtual());
    expect(visto).toBe(ORGANIZACAO_INICIAL);
  });

  it('o contexto sobrevive a await', async () => {
    const visto = await comOrganizacao(ORGANIZACAO_INICIAL, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return organizacaoAtual();
    });
    expect(visto).toBe(ORGANIZACAO_INICIAL);
  });

  it('contextos aninhados nao se misturam', () => {
    const outra = '11111111-1111-1111-1111-111111111111';
    const resultado = comOrganizacao(ORGANIZACAO_INICIAL, () => {
      const dentro = comOrganizacao(outra, () => organizacaoAtual());
      return [dentro, organizacaoAtual()];
    });
    expect(resultado).toEqual([outra, ORGANIZACAO_INICIAL]);
  });

  it('irrestrito nao entrega organizacao nenhuma', () => {
    semOrganizacao('teste', () => {
      // Quem precisa do id nao pode estar num trecho que atravessa organizacoes:
      // devolver um valor aqui seria escolher uma empresa por acidente.
      expect(() => organizacaoAtual()).toThrowError(/irrestrito/i);
      expect(organizacaoAtualOuNula()).toBeNull();
      expect(contextoAtual()?.irrestrito).toBe(true);
    });
  });

  it('irrestrito guarda o motivo, para o erro dizer de onde veio', () => {
    semOrganizacao('login: resolve o usuario pelo e-mail', () => {
      expect(() => organizacaoAtual()).toThrowError(/login: resolve o usuario/);
    });
  });

  it('o contexto nao vaza para fora do bloco', () => {
    comOrganizacao(ORGANIZACAO_INICIAL, () => organizacaoAtual());
    expect(() => organizacaoAtual()).toThrowError(/organizacao/i);
  });

  it('recusa abrir contexto com id vazio', () => {
    expect(() => comOrganizacao('', () => null)).toThrowError(/vazio/i);
  });
});
