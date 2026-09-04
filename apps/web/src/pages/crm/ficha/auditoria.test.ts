import { describe, expect, it } from 'vitest';
import type { EventoAuditoria } from '../../../lib/types';
import { descreverValor, fraseDoEvento, rotuloDoEvento } from './auditoria';

const evento = (campos: Partial<EventoAuditoria>): EventoAuditoria => ({
  id: 'e1',
  tipo: 'CAMPO',
  campo: 'TITULO',
  de: null,
  para: null,
  autor: null,
  ocorridoEm: '2026-09-03T12:00:00Z',
  ...campos,
});

describe('descreverValor', () => {
  it('nulo vira travessao, nunca zero', () => {
    // A regra vale para a plataforma toda: `moeda(null)` daria "R$ 0,00" e
    // afirmaria um preco que ninguem escreveu.
    expect(descreverValor('VALOR_INFORMADO', null)).toBe('—');
    expect(descreverValor('ITENS', null)).toBe('—');
    expect(descreverValor(null, null)).toBe('—');
  });

  it('zero em dinheiro e zero, nao travessao', () => {
    expect(descreverValor('VALOR_INFORMADO', 0)).toContain('0,00');
  });

  it('valor informado sai como moeda', () => {
    expect(descreverValor('VALOR_INFORMADO', 1500)).toContain('1.500,00');
  });

  it('referencia a usuario sai como o nome', () => {
    expect(descreverValor('RESPONSAVEL', { id: 'u1', nome: 'Maria' })).toBe('Maria');
  });

  it('proposta diz quantidade e total', () => {
    const texto = descreverValor('ITENS', { quantidade: 3, total: 1000 });
    expect(texto).toContain('3 item(ns)');
    expect(texto).toContain('1.000,00');
  });

  it('um mes no singular', () => {
    // Detalhe pequeno com efeito grande: "1 meses" e o tipo de coisa que faz
    // quem le desconfiar do resto do registro.
    expect(descreverValor('MESES_RECORRENCIA', 1)).toBe('1 mes');
    expect(descreverValor('MESES_RECORRENCIA', 12)).toBe('12 meses');
  });

  it('a alcada usa o vocabulario da tela', () => {
    expect(descreverValor('APROVACAO_DESCONTO', 'PENDENTE')).toBe('Aguardando aprovacao');
    expect(descreverValor('APROVACAO_DESCONTO', 'NAO_REQUER')).toBe('Dentro da alcada');
  });

  it('valor desconhecido na alcada nao vira vazio', () => {
    // Se a API ganhar um estado novo antes da tela, mostrar o codigo cru e melhor
    // que mostrar nada — a linha continua legivel e o defeito fica visivel.
    expect(descreverValor('APROVACAO_DESCONTO', 'ALGO_NOVO')).toBe('ALGO_NOVO');
  });
});

describe('rotuloDoEvento', () => {
  it('campo usa o nome do campo', () => {
    expect(rotuloDoEvento(evento({ campo: 'VALOR_INFORMADO' }))).toBe('Valor informado');
  });

  it('campo que a tela ainda nao conhece mostra o codigo, nao vazio', () => {
    /*
     * Defeito real, achado pelo teste de navegador: a uniao no front e sempre
     * mais estreita que o enum da API, e o TypeScript nao avisa. Quando condicao
     * de pagamento entrou, a linha apareceu como ": — → 10 dias uteis", sem dizer
     * de que campo falava.
     */
    const rotulo = rotuloDoEvento(evento({ campo: 'CAMPO_NOVO_DA_API' as never }));
    expect(rotulo).toBe('CAMPO_NOVO_DA_API');
  });

  it('os campos da proposta impressa tem rotulo', () => {
    expect(rotuloDoEvento(evento({ campo: 'CONDICAO_PAGAMENTO' }))).toBe('Condicao de pagamento');
    expect(rotuloDoEvento(evento({ campo: 'PRAZO_ENTREGA' }))).toBe('Prazo de entrega');
  });

  it('etapa tem rotulo proprio', () => {
    expect(rotuloDoEvento(evento({ tipo: 'ETAPA', campo: null }))).toBe('Etapa');
  });
});

describe('fraseDoEvento', () => {
  it('entrada no funil nao e "de travessao para X"', () => {
    /*
     * O primeiro registro do historico nasce sem estagio de origem, de proposito.
     * Escrever "— → Prospeccao" faria parecer que alguem mexeu em algo que nao
     * existia.
     */
    expect(fraseDoEvento(evento({ tipo: 'ETAPA', campo: null, de: null, para: 'Prospeccao' }))).toBe(
      'entrou em Prospeccao',
    );
  });

  it('mudanca de etapa mostra os dois lados', () => {
    expect(
      fraseDoEvento(evento({ tipo: 'ETAPA', campo: null, de: 'Prospeccao', para: 'Proposta' })),
    ).toBe('Prospeccao → Proposta');
  });

  it('campo mostra de e para', () => {
    expect(fraseDoEvento(evento({ campo: 'TITULO', de: 'Antes', para: 'Depois' }))).toBe('Antes → Depois');
  });

  it('campo esvaziado mostra o travessao no destino', () => {
    expect(fraseDoEvento(evento({ campo: 'RESPONSAVEL', de: { id: 'u1', nome: 'Joao' }, para: null }))).toBe(
      'Joao → —',
    );
  });
});
