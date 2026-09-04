import { describe, expect, it } from 'vitest';
import { montarProposta, numeroDaProposta } from './proposta';

/**
 * A proposta e o unico artefato que o CLIENTE le. Um numero errado aqui nao vira
 * um grafico estranho: vira um preco que a empresa vai ter de honrar.
 */

const AGORA = new Date('2026-09-03T12:00:00Z');

const item = (campos: Partial<Parameters<typeof montarProposta>[0]['itens'][number]> = {}) => ({
  quantidade: 1,
  precoUnitario: 1000,
  acrescimo: 0,
  desconto: 0,
  recorrencia: 'UNICO' as const,
  custoUnitario: null,
  produto: { nome: 'Ar-condicionado 12k', sku: 'AC12' },
  ...campos,
});

const entrada = (campos: Partial<Parameters<typeof montarProposta>[0]> = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  titulo: 'Climatizacao da loja',
  criadoEm: AGORA,
  previsaoFechamento: null,
  mesesRecorrencia: 12,
  condicaoPagamento: null,
  prazoEntrega: null,
  conta: { nome: 'Supermercado Central' },
  responsavel: { nome: 'Maria' },
  itens: [item()],
  ...campos,
});

describe('numeroDaProposta', () => {
  it('oito caracteres, sem hifen, em maiusculo', () => {
    expect(numeroDaProposta('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('AAAAAAAA');
  });

  it('e estavel: o mesmo id da o mesmo numero', () => {
    // O cliente cita este numero ao telefone. Se ele mudasse a cada geracao, uma
    // segunda via nao seria reconhecivel como a mesma proposta.
    const id = '12345678-90ab-cdef-1234-567890abcdef';
    expect(numeroDaProposta(id)).toBe(numeroDaProposta(id));
    expect(numeroDaProposta(id)).toBe('12345678');
  });
});

describe('montarProposta', () => {
  it('o emissor e a marca da organizacao, nao a plataforma', () => {
    const p = montarProposta(entrada(), 'Bradel', AGORA);
    expect(p.emissor).toBe('Bradel');
    expect(p.cliente).toBe('Supermercado Central');
  });

  it('o total e o mesmo que o funil grava', () => {
    // Mesma funcao de soma que `regravarTotais` usa. Recalcular por outro
    // caminho aqui deixaria o papel e o funil discordando, e a discordancia
    // apareceria na frente do cliente.
    const p = montarProposta(
      entrada({ itens: [item({ quantidade: 3, precoUnitario: 100, desconto: 50 })] }),
      'Bradel',
      AGORA,
    );
    expect(p.totais.bruto).toBe(300);
    expect(p.totais.desconto).toBe(50);
    expect(p.totais.total).toBe(250);
  });

  it('cada linha traz bruto e liquido, para o "de / por"', () => {
    const p = montarProposta(
      entrada({ itens: [item({ quantidade: 2, precoUnitario: 500, desconto: 100 })] }),
      'Bradel',
      AGORA,
    );
    expect(p.itens[0]!.bruto).toBe(1000);
    expect(p.itens[0]!.liquido).toBe(900);
  });

  it('o acrescimo entra no liquido da linha', () => {
    const p = montarProposta(
      entrada({ itens: [item({ precoUnitario: 1000, acrescimo: 200 })] }),
      'Bradel',
      AGORA,
    );
    expect(p.itens[0]!.liquido).toBe(1200);
  });

  it('havendo parte mensal, o horizonte e dito por extenso', () => {
    /*
     * Sem essa linha o cliente le "Total: R$ 12.000" ao lado de "Mensal: R$
     * 1.000" e entende que o mensal e cobrado ALEM do total. E a confusao mais
     * cara que este documento pode causar.
     */
    const p = montarProposta(
      entrada({ itens: [item({ recorrencia: 'MENSAL', precoUnitario: 1000 })] }),
      'Bradel',
      AGORA,
    );
    expect(p.totais.mensal).toBe(1000);
    expect(p.totais.total).toBe(12_000);
    expect(p.observacoes.join(' ')).toContain('12 meses');
  });

  it('um mes no singular', () => {
    const p = montarProposta(
      entrada({ mesesRecorrencia: 1, itens: [item({ recorrencia: 'MENSAL', precoUnitario: 500 })] }),
      'Bradel',
      AGORA,
    );
    expect(p.observacoes.join(' ')).toContain('1 mes ');
  });

  it('sem parte mensal nao ha observacao de horizonte', () => {
    // Falar de recorrencia numa proposta de cobranca unica so gera duvida.
    const p = montarProposta(entrada(), 'Bradel', AGORA);
    expect(p.observacoes.join(' ')).not.toContain('recorrencia');
  });

  it('a observacao de desconto aparece so quando ha desconto', () => {
    expect(montarProposta(entrada(), 'Bradel', AGORA).observacoes.join(' ')).not.toContain('descontos');
    const comDesconto = montarProposta(
      entrada({ itens: [item({ desconto: 100 })] }),
      'Bradel',
      AGORA,
    );
    expect(comDesconto.observacoes.join(' ')).toContain('descontos');
  });

  it('validade so existe se a oportunidade tiver previsao', () => {
    /*
     * Escrever "valida por 15 dias" quando ninguem definiu prazo seria a
     * plataforma assumindo um compromisso comercial no lugar da empresa — num
     * documento que o cliente pode cobrar depois.
     */
    expect(montarProposta(entrada(), 'Bradel', AGORA).validaAte).toBeNull();
    const prazo = new Date('2026-10-15T00:00:00Z');
    expect(montarProposta(entrada({ previsaoFechamento: prazo }), 'Bradel', AGORA).validaAte).toEqual(prazo);
  });

  it('sem responsavel o campo fica nulo, nao com o nome de quem gerou', () => {
    // Quem imprime nao e necessariamente quem negocia; por o nome de quem clicou
    // apresentaria ao cliente um contato que nao e dele.
    const p = montarProposta(entrada({ responsavel: null }), 'Bradel', AGORA);
    expect(p.responsavel).toBeNull();
  });

  it('a data de emissao vem do parametro, nao do relogio', () => {
    // Duas geracoes do mesmo documento tem de sair iguais, e o teste nao pode
    // depender do horario da maquina.
    expect(montarProposta(entrada(), 'Bradel', AGORA).emitidaEm).toEqual(AGORA);
  });

  it('item sem sku nao inventa codigo', () => {
    const p = montarProposta(
      entrada({ itens: [item({ produto: { nome: 'Servico de instalacao', sku: null } })] }),
      'Bradel',
      AGORA,
    );
    expect(p.itens[0]!.sku).toBeNull();
  });

  it('unico e mensal na mesma proposta ficam separados', () => {
    const p = montarProposta(
      entrada({
        mesesRecorrencia: 12,
        itens: [
          item({ precoUnitario: 5000 }),
          item({ recorrencia: 'MENSAL', precoUnitario: 300, produto: { nome: 'Manutencao', sku: null } }),
        ],
      }),
      'Bradel',
      AGORA,
    );
    expect(p.totais.unico).toBe(5000);
    expect(p.totais.mensal).toBe(300);
    expect(p.totais.total).toBe(5000 + 300 * 12);
  });

  it('condicao de pagamento e prazo entram quando preenchidos', () => {
    const p = montarProposta(
      entrada({ condicaoPagamento: '30/60/90 dias', prazoEntrega: '15 dias uteis apos aprovacao' }),
      'Bradel',
      AGORA,
    );
    expect(p.condicaoPagamento).toBe('30/60/90 dias');
    expect(p.prazoEntrega).toBe('15 dias uteis apos aprovacao');
  });

  it('nao preenchido sai do documento, e nao como "a combinar"', () => {
    /*
     * "Condicao de pagamento: a combinar" impresso e uma frase que a empresa nao
     * escreveu e que o cliente pode cobrar depois. Campo ausente e honesto — a
     * conversa continua fora do papel, que e onde ela esta de verdade.
     */
    const p = montarProposta(entrada(), 'Bradel', AGORA);
    expect(p.condicaoPagamento).toBeNull();
    expect(p.prazoEntrega).toBeNull();
  });

  it('texto em branco conta como nao preenchido', () => {
    // Espaco em branco vindo do formulario imprimiria o rotulo seguido de nada,
    // o que num documento ao cliente parece campo que ficou faltando.
    const p = montarProposta(entrada({ condicaoPagamento: '   ', prazoEntrega: '' }), 'Bradel', AGORA);
    expect(p.condicaoPagamento).toBeNull();
    expect(p.prazoEntrega).toBeNull();
  });
});