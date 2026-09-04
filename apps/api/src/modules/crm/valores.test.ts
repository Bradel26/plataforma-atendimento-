import { describe, expect, it } from 'vitest';
import {
  centavos,
  fracaoDeDesconto,
  resolverValor,
  situacaoDaAlcada,
  tetoDoPerfil,
  totaisDaOportunidade,
  totalDoItem,
  type ItemParaTotal,
} from './valores';

/**
 * Item 2.1 do plano em ANALISE-CRM.md.
 *
 * Aritmetica de dinheiro erra sem quebrar: um total dois centavos menor nao
 * levanta excecao nenhuma, chega na proposta assinada. Cada caso aqui e uma
 * forma de o numero sair errado e ninguem notar.
 */

const item = (campos: Partial<ItemParaTotal>): ItemParaTotal => ({
  quantidade: 1,
  precoUnitario: 0,
  acrescimo: 0,
  desconto: 0,
  recorrencia: 'UNICO',
  custoUnitario: null,
  ...campos,
});

describe('centavos', () => {
  it('arredonda para duas casas, meio para cima', () => {
    expect(centavos(1.005)).toBe(1.01);
    expect(centavos(1.004)).toBe(1.0);
    expect(centavos(2.345)).toBe(2.35);
  });

  it('mata o resto binario que chegaria ao Postgres', () => {
    // 0,1 + 0,2 em ponto flutuante e 0,30000000000000004. Sem arredondar, a
    // coluna Decimal(14,2) trunca e trinta linhas de proposta acumulam centavos.
    expect(centavos(0.1 + 0.2)).toBe(0.3);
  });
});

describe('totalDoItem', () => {
  it('multiplica quantidade por preco', () => {
    const t = totalDoItem(item({ quantidade: 3, precoUnitario: 1200 }));
    expect(t.bruto).toBe(3600);
    expect(t.liquido).toBe(3600);
  });

  it('desconto e acrescimo entram em valor sobre o bruto', () => {
    const t = totalDoItem(item({ quantidade: 2, precoUnitario: 1500, desconto: 200, acrescimo: 50 }));
    expect(t.bruto).toBe(3000);
    expect(t.liquido).toBe(2850);
  });

  it('desconto maior que o bruto deixa o liquido negativo em vez de aparar em zero', () => {
    // Aparar esconderia erro de digitacao: uma linha de menos-cem aparece na
    // tela e alguem corrige; uma linha zerada em silencio produz um total que
    // ninguem entende. Recusar e papel do schema da rota, com 400.
    const t = totalDoItem(item({ quantidade: 1, precoUnitario: 100, desconto: 200 }));
    expect(t.liquido).toBe(-100);
  });

  it('sem custo informado, margem e NULA — nao zero', () => {
    // Zero afirmaria "vendeu sem lucro". A tela do Nectar mostrava "Lucro 100%"
    // porque o custo era zero; e o mesmo erro visto do outro lado.
    const t = totalDoItem(item({ quantidade: 1, precoUnitario: 1000 }));
    expect(t.custo).toBeNull();
    expect(t.margem).toBeNull();
    expect(t.margemPercentual).toBeNull();
  });

  it('custo zero informado e diferente de custo ausente', () => {
    const t = totalDoItem(item({ quantidade: 1, precoUnitario: 1000, custoUnitario: 0 }));
    expect(t.custo).toBe(0);
    expect(t.margem).toBe(1000);
    expect(t.margemPercentual).toBe(1);
  });

  it('margem e sobre o liquido, nao sobre o custo', () => {
    // Sobre o custo seria markup, que da numero maior: 500/500 = 100% em vez de
    // 500/1000 = 50%. A tela mentiria para cima.
    const t = totalDoItem(item({ quantidade: 1, precoUnitario: 1000, custoUnitario: 500 }));
    expect(t.margem).toBe(500);
    expect(t.margemPercentual).toBe(0.5);
  });

  it('desconto reduz a margem, porque incide sobre a receita', () => {
    const t = totalDoItem(item({ quantidade: 1, precoUnitario: 1000, desconto: 200, custoUnitario: 500 }));
    expect(t.liquido).toBe(800);
    expect(t.margem).toBe(300);
    expect(t.margemPercentual).toBeCloseTo(0.375);
  });

  it('custo multiplica pela quantidade, como o preco', () => {
    const t = totalDoItem(item({ quantidade: 4, precoUnitario: 100, custoUnitario: 60 }));
    expect(t.custo).toBe(240);
    expect(t.margem).toBe(160);
  });

  it('liquido zero com custo devolve percentual nulo em vez de dividir por zero', () => {
    const t = totalDoItem(item({ quantidade: 1, precoUnitario: 100, desconto: 100, custoUnitario: 60 }));
    expect(t.liquido).toBe(0);
    expect(t.margem).toBe(-60);
    expect(t.margemPercentual).toBeNull();
  });
});

describe('totaisDaOportunidade', () => {
  it('separa unico de mensal e nao os empilha num campo', () => {
    // Empilhar daria R$ 1.500, que nao e o valor de nada.
    const t = totaisDaOportunidade(
      [
        item({ quantidade: 1, precoUnitario: 1000, recorrencia: 'UNICO' }),
        item({ quantidade: 1, precoUnitario: 500, recorrencia: 'MENSAL' }),
      ],
      12,
    );
    expect(t.valorUnico).toBe(1000);
    expect(t.valorMensal).toBe(500);
  });

  it('o valor total usa o horizonte da propria oportunidade', () => {
    const itens = [
      item({ quantidade: 1, precoUnitario: 1000, recorrencia: 'UNICO' }),
      item({ quantidade: 1, precoUnitario: 500, recorrencia: 'MENSAL' }),
    ];
    // 1.000 + 500 x 12
    expect(totaisDaOportunidade(itens, 12).valor).toBe(7000);
    // Contrato de 24 meses vale mais, e a diferenca e a propria venda.
    expect(totaisDaOportunidade(itens, 24).valor).toBe(13000);
    // Horizonte zero: so o unico entra.
    expect(totaisDaOportunidade(itens, 0).valor).toBe(1000);
  });

  it('soma bruto, desconto e acrescimo para a proposta conferir linha por linha', () => {
    const t = totaisDaOportunidade(
      [
        item({ quantidade: 2, precoUnitario: 1000, desconto: 100 }),
        item({ quantidade: 1, precoUnitario: 500, acrescimo: 50 }),
      ],
      12,
    );
    expect(t.bruto).toBe(2500);
    expect(t.descontoTotal).toBe(100);
    expect(t.acrescimoTotal).toBe(50);
    expect(t.valorUnico).toBe(2450);
    // O total tem de fechar: bruto - desconto + acrescimo.
    expect(t.valorUnico).toBe(t.bruto - t.descontoTotal + t.acrescimoTotal);
  });

  it('nenhum item com custo devolve margem NULA', () => {
    const t = totaisDaOportunidade([item({ quantidade: 1, precoUnitario: 1000 })], 12);
    expect(t.custoTotal).toBeNull();
    expect(t.margem).toBeNull();
    expect(t.itensComCusto).toBe(0);
  });

  it('margem parcial se calcula sobre o liquido de quem TEM custo, e diz de quantos', () => {
    // Se a base fosse o liquido total, a margem apareceria como 900/1900 = 47%,
    // sugerindo que os R$ 900 de lucro vieram de toda a proposta. Eles vieram de
    // uma linha de R$ 1.000. `itensComCusto` e o que permite a tela avisar.
    const t = totaisDaOportunidade(
      [
        item({ quantidade: 1, precoUnitario: 1000, custoUnitario: 100 }),
        item({ quantidade: 1, precoUnitario: 900 }),
      ],
      12,
    );
    expect(t.margem).toBe(900);
    expect(t.margemPercentual).toBeCloseTo(0.9);
    expect(t.itensComCusto).toBe(1);
    expect(t.itens).toBe(2);
  });

  it('proposta vazia devolve zeros e margem nula', () => {
    const t = totaisDaOportunidade([], 12);
    expect(t.valor).toBe(0);
    expect(t.valorUnico).toBe(0);
    expect(t.valorMensal).toBe(0);
    expect(t.margem).toBeNull();
    expect(t.itens).toBe(0);
  });

  it('trinta linhas quebradas somam sem acumular centavo', () => {
    // Uma linha nao mostra o problema; trinta mostram. O total tem de ser
    // exatamente 30 x 33,33.
    const itens = Array.from({ length: 30 }, () => item({ quantidade: 1, precoUnitario: 33.33 }));
    expect(totaisDaOportunidade(itens, 12).valorUnico).toBe(999.9);
  });
});

describe('resolverValor', () => {
  const comItem = totaisDaOportunidade(
    [
      item({ quantidade: 1, precoUnitario: 1000, recorrencia: 'UNICO' }),
      item({ quantidade: 1, precoUnitario: 200, recorrencia: 'MENSAL' }),
    ],
    12,
  );
  const semItem = totaisDaOportunidade([], 12);

  it('havendo item, o item manda', () => {
    const r = resolverValor(comItem, null);
    expect(r.valor).toBe(3400);
    expect(r.valorUnico).toBe(1000);
    expect(r.valorMensal).toBe(200);
  });

  it('o valor digitado nao se perde quando os itens mandam', () => {
    // Apagar em silencio o numero que alguem negociou por telefone seria pior
    // que ignora-lo. A tela mostra os dois quando divergem.
    const r = resolverValor(comItem, 5000);
    expect(r.valor).toBe(3400);
    expect(r.valorInformado).toBe(5000);
  });

  it('sem item, o digitado e a unica fonte e vira tambem o valor unico', () => {
    // Sem isso o funil mostraria R$ 0 numa oportunidade que tem valor.
    const r = resolverValor(semItem, 777);
    expect(r.valor).toBe(777);
    expect(r.valorUnico).toBe(777);
    expect(r.valorMensal).toBe(0);
  });

  it('sem item e sem digitado, o valor e zero', () => {
    const r = resolverValor(semItem, null);
    expect(r.valor).toBe(0);
    expect(r.valorInformado).toBeNull();
  });
});

describe('alcada de desconto (2.3)', () => {
  const comDesconto = (bruto: number, desconto: number) =>
    totaisDaOportunidade([item({ quantidade: 1, precoUnitario: bruto, desconto })], 12);

  it('a fracao de desconto e sobre o bruto, nao sobre o liquido', () => {
    // 200 de 1.000 e 20%. Dividir pelo liquido (800) daria 25% e apertaria a
    // alcada de um jeito que ninguem consegue explicar.
    expect(fracaoDeDesconto(comDesconto(1000, 200))).toBeCloseTo(0.2);
  });

  it('acrescimo nao aumenta a base, senao seria o caminho para furar a alcada', () => {
    // Se o acrescimo entrasse na base, subir o preco e descer o desconto faria o
    // percentual cair e a aprovacao desaparecer.
    const t = totaisDaOportunidade(
      [item({ quantidade: 1, precoUnitario: 1000, acrescimo: 1000, desconto: 200 })],
      12,
    );
    expect(fracaoDeDesconto(t)).toBeCloseTo(0.2);
  });

  it('bruto zero devolve fracao NULA, nao zero', () => {
    // Zero afirmaria "nao houve desconto" e liberaria aprovacao automatica numa
    // proposta que so tem dado incompleto.
    expect(fracaoDeDesconto(totaisDaOportunidade([], 12))).toBeNull();
  });

  it('quem aprova nao tem teto', () => {
    for (const perfil of ['ADMIN', 'SUPERVISOR', 'GESTOR']) {
      expect(tetoDoPerfil(perfil, 10)).toBe(100);
    }
  });

  it('comercial recebe o teto da organizacao', () => {
    expect(tetoDoPerfil('COMERCIAL', 10)).toBe(10);
  });

  it('perfil desconhecido cai no teto restritivo, nao no livre', () => {
    // Se a rota mudar de perfil por descuido, o padrao seguro e o restritivo.
    expect(tetoDoPerfil('AGENTE', 10)).toBe(10);
    expect(tetoDoPerfil('QUALQUER_COISA_NOVA', 10)).toBe(10);
  });

  it('passa do teto estritamente: exatamente o teto nao pede aprovacao', () => {
    // Teto e o limite do que se concede sozinho. Recusar o proprio numero da
    // politica confundiria todo mundo.
    expect(situacaoDaAlcada(0.1, 10)).toBe('NAO_REQUER');
    expect(situacaoDaAlcada(0.1001, 10)).toBe('PENDENTE');
  });

  it('desconto de exatamente 10% com teto 10 nao vira pendencia por resto binario', () => {
    // 0,1 x 100 nao e exatamente 10 em ponto flutuante. Sem o arredondamento em
    // percentual inteiro, este caso ficaria pendente sem motivo — e seria o
    // primeiro que alguem tentaria na vida real.
    const t = comDesconto(1000, 100);
    expect(situacaoDaAlcada(fracaoDeDesconto(t), 10)).toBe('NAO_REQUER');
  });

  it('teto 100 nao restringe nada — e o padrao da organizacao', () => {
    expect(situacaoDaAlcada(1, 100)).toBe('NAO_REQUER');
  });

  it('sem desconto medido nao ha pendencia', () => {
    expect(situacaoDaAlcada(null, 0)).toBe('NAO_REQUER');
  });

  it('teto zero exige aprovacao para qualquer desconto', () => {
    expect(situacaoDaAlcada(0.01, 0)).toBe('PENDENTE');
    expect(situacaoDaAlcada(0, 0)).toBe('NAO_REQUER');
  });
});
