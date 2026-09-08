import { describe, expect, it } from 'vitest';
import { comandosDeNavegacao, montarPaleta, moverSelecao } from './paleta';

/**
 * Paleta de comando (item 6.2).
 *
 * O que erra em silencio aqui e o escopo: oferecer uma tela que o perfil nao
 * abre — e a pessoa descobre com um 403 — ou nao oferecer a que ele abre.
 */

describe('comandosDeNavegacao', () => {
  it('o agente nao recebe comando para tela que nao e dele', () => {
    const rotas = comandosDeNavegacao('AGENTE', '').map((c) => c.rota);
    expect(rotas).toContain('/atendimento');
    expect(rotas).toContain('/crm');
    // Gestao, campanhas e configuracoes recusam AGENTE por perfil.
    expect(rotas).not.toContain('/gestao');
    expect(rotas).not.toContain('/campanhas');
    expect(rotas).not.toContain('/configuracoes');
  });

  it('o comercial recebe o CRM e o atendimento', () => {
    // Vendedor com WhatsApp proprio atende o cliente direto no painel — por
    // isso COMERCIAL passou a ver /atendimento junto com /crm.
    const rotas = comandosDeNavegacao('COMERCIAL', '').map((c) => c.rota);
    expect(rotas).toContain('/crm');
    expect(rotas).toContain('/atendimento');
  });

  it('o admin recebe tudo', () => {
    // O contraponto dos dois acima: sem ele, os testes passariam com a lista
    // vazia — "nao ve o que nao e dele" tambem e satisfeito por nao ver nada.
    const rotas = comandosDeNavegacao('ADMIN', '').map((c) => c.rota);
    expect(rotas).toContain('/configuracoes');
    expect(rotas.length).toBeGreaterThan(8);
  });

  it('filtra pelo termo, sem diferenciar caixa', () => {
    expect(comandosDeNavegacao('ADMIN', 'crm').map((c) => c.rota)).toEqual(['/crm']);
    expect(comandosDeNavegacao('ADMIN', 'CRM').map((c) => c.rota)).toEqual(['/crm']);
  });

  it('termo que nao casa com tela nenhuma devolve vazio', () => {
    expect(comandosDeNavegacao('ADMIN', 'zzzz')).toEqual([]);
  });
});

describe('montarPaleta', () => {
  const registro = {
    tipo: 'CONTATO' as const,
    rota: '/contatos/c1',
    titulo: 'Acougue Central',
    detalhe: 'Mercado Central',
  };

  it('comando vem antes de registro', () => {
    /*
     * Nao e estetica: comando e previsivel, registro e achado. "Ir para CRM"
     * acima de um contato chamado "CRM Teste" e o palpite certo.
     */
    const itens = montarPaleta('ADMIN', 'crm', [{ ...registro, titulo: 'CRM Teste' }]);
    expect(itens[0]?.tipo).toBe('NAVEGAR');
  });

  it('sem termo, so os comandos aparecem', () => {
    // A busca de registro so responde a partir de duas letras, entao com o campo
    // vazio nao existe registro para mostrar.
    const itens = montarPaleta('ADMIN', '', []);
    expect(itens.every((i) => i.tipo === 'NAVEGAR')).toBe(true);
  });

  it('o registro conserva rota e detalhe', () => {
    const itens = montarPaleta('ADMIN', 'acougue', [registro]);
    const contato = itens.find((i) => i.tipo === 'CONTATO');
    expect(contato?.rota).toBe('/contatos/c1');
    expect(contato && 'detalhe' in contato ? contato.detalhe : null).toBe('Mercado Central');
  });
});

describe('moverSelecao', () => {
  it('desce e sobe dentro da lista', () => {
    expect(moverSelecao(0, 5, 1)).toBe(1);
    expect(moverSelecao(3, 5, -1)).toBe(2);
  });

  it('nao circula nas pontas', () => {
    /*
     * Circular do fim para o comeco faz a selecao pular para longe do olhar, e a
     * tecla que a pessoa usa para voltar e a seta de cima — nao mais uma para
     * baixo.
     */
    expect(moverSelecao(4, 5, 1)).toBe(4);
    expect(moverSelecao(0, 5, -1)).toBe(0);
  });

  it('lista vazia devolve zero, e nao -1', () => {
    // O indice destaca a linha; -1 destacaria a ultima.
    expect(moverSelecao(0, 0, 1)).toBe(0);
    expect(moverSelecao(3, 0, -1)).toBe(0);
  });
});
