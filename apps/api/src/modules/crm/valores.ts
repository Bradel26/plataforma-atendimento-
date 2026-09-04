/**
 * O valor de uma oportunidade, item por item — item 2.1 do plano em
 * ANALISE-CRM.md.
 *
 * Puro de proposito: nao toca banco, nao conhece Prisma. Aritmetica de dinheiro
 * e o tipo de codigo que erra sem quebrar, e a unica defesa e poder testar cada
 * regra isolada.
 */

export type Recorrencia = 'UNICO' | 'MENSAL';

export type ItemParaTotal = {
  quantidade: number;
  precoUnitario: number;
  acrescimo: number;
  desconto: number;
  recorrencia: Recorrencia;
  /** Nulo = nao informado. Diferente de zero, que afirma "nao custa nada". */
  custoUnitario: number | null;
};

/**
 * Arredonda para centavo, meio para cima.
 *
 * Existe porque a coluna e `Decimal(14,2)` e o calculo acontece em `number`:
 * sem arredondar na borda, `0,1 + 0,2` chega ao banco como `0,30000000000000004`
 * e o Postgres trunca. Uma linha nao muda nada; trinta linhas de proposta
 * acumulam centavos e o total impresso deixa de fechar com a soma das linhas —
 * que e exatamente o que o cliente confere.
 */
export const centavos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type TotalDoItem = {
  /** Quantidade x preco, antes de acrescimo e desconto. */
  bruto: number;
  /** O que efetivamente se cobra por esta linha. */
  liquido: number;
  /** Custo total da linha, ou nulo se o custo nao foi informado. */
  custo: number | null;
  /** Liquido menos custo, ou nulo. */
  margem: number | null;
  /** Margem sobre o liquido, de 0 a 1. Nulo sem custo; nulo se o liquido e 0. */
  margemPercentual: number | null;
};

/**
 * O total de uma linha da proposta.
 *
 * Acrescimo e desconto entram em **valor**, e nao em percentual, porque quem
 * negocia diz "tira duzentos reais". Guardar 6,6667% para reproduzir R$ 200 de
 * R$ 3.000 perde centavo na volta.
 *
 * O liquido pode ser negativo se o desconto passar do bruto — e aqui ele
 * **fica** negativo em vez de ser aparado em zero. Aparar seria esconder um erro
 * de digitacao: uma linha de menos-cem-reais aparece na tela e alguem corrige,
 * enquanto uma linha zerada em silencio produz um total que ninguem entende. Quem
 * recusa e o schema da rota, com 400 e mensagem.
 */
export function totalDoItem(i: ItemParaTotal): TotalDoItem {
  const bruto = centavos(i.quantidade * i.precoUnitario);
  const liquido = centavos(bruto + i.acrescimo - i.desconto);
  const custo = i.custoUnitario === null ? null : centavos(i.quantidade * i.custoUnitario);
  const margem = custo === null ? null : centavos(liquido - custo);

  return {
    bruto,
    liquido,
    custo,
    margem,
    // Percentual sobre o liquido, e nao sobre o custo: "margem de 30%" em venda
    // quer dizer 30% do que o cliente paga. Sobre o custo seria markup, que da
    // numero maior e a tela mentiria para cima.
    //
    // Liquido zero devolve nulo. Zero por cento afirmaria "vendeu sem margem", e
    // a verdade e que nao ha o que dividir.
    margemPercentual: margem === null || liquido === 0 ? null : margem / liquido,
  };
}

export type TotaisDaOportunidade = {
  /** Soma liquida dos itens de cobranca unica. */
  valorUnico: number;
  /** Soma liquida dos itens mensais — o MRR da oportunidade. */
  valorMensal: number;
  /** O numero usado em relatorio, funil e previsao: unico + mensal x meses. */
  valor: number;
  bruto: number;
  descontoTotal: number;
  acrescimoTotal: number;
  /** Nulo se NENHUM item tem custo informado. */
  custoTotal: number | null;
  margem: number | null;
  margemPercentual: number | null;
  /** Quantos itens tem custo informado, de quantos. Diz se a margem e parcial. */
  itensComCusto: number;
  itens: number;
};

/**
 * Os totais da oportunidade.
 *
 * **Unico e mensal nao se somam direto.** R$ 1.000 de equipamento e R$ 500/mes de
 * manutencao sao receitas de natureza diferente; empilhar as duas num campo daria
 * R$ 1.500, que nao e o valor de nada. O total usa o horizonte da propria
 * oportunidade (`mesesRecorrencia`): unico + mensal x meses. Doze e o padrao do
 * modelo por ser o horizonte de meta anual, mas cada negocio pode dizer o seu —
 * contrato de manutencao de 24 meses vale o dobro de um de 12, e essa diferenca e
 * a propria venda.
 *
 * **A margem e parcial quando so parte dos itens tem custo.** Ela e calculada
 * sobre o liquido dos itens que tem custo, e `itensComCusto` diz de quantos —
 * sem isso, uma proposta com custo em 1 de 10 linhas mostraria uma margem que
 * parece ser do todo. Nenhum item com custo devolve nulo, nao zero.
 */
export function totaisDaOportunidade(itens: ItemParaTotal[], mesesRecorrencia: number): TotaisDaOportunidade {
  const totais = itens.map((i) => ({ item: i, total: totalDoItem(i) }));

  const somar = (f: (t: (typeof totais)[number]) => number) => centavos(totais.reduce((a, t) => a + f(t), 0));

  const valorUnico = somar((t) => (t.item.recorrencia === 'UNICO' ? t.total.liquido : 0));
  const valorMensal = somar((t) => (t.item.recorrencia === 'MENSAL' ? t.total.liquido : 0));

  const comCusto = totais.filter((t) => t.total.custo !== null);
  const custoTotal = comCusto.length === 0 ? null : centavos(comCusto.reduce((a, t) => a + (t.total.custo ?? 0), 0));
  // Base da margem: apenas o liquido dos itens que tem custo. Usar o liquido
  // total inflaria a margem com receita cujo custo ninguem informou.
  const liquidoComCusto = centavos(comCusto.reduce((a, t) => a + t.total.liquido, 0));
  const margem = custoTotal === null ? null : centavos(liquidoComCusto - custoTotal);

  return {
    valorUnico,
    valorMensal,
    valor: centavos(valorUnico + valorMensal * mesesRecorrencia),
    bruto: somar((t) => t.total.bruto),
    descontoTotal: somar((t) => t.item.desconto),
    acrescimoTotal: somar((t) => t.item.acrescimo),
    custoTotal,
    margem,
    margemPercentual: margem === null || liquidoComCusto === 0 ? null : margem / liquidoComCusto,
    itensComCusto: comCusto.length,
    itens: itens.length,
  };
}

/**
 * Qual valor manda: o dos itens, ou o digitado a mao.
 *
 * **Havendo item, o item manda.** Era o contrario na decisao 11 — valor
 * explicito vencia — e com desconto na linha isso deixou de funcionar: a
 * proposta impressa soma as linhas, e um total digitado por cima faria o
 * documento discordar de si mesmo na frente do cliente.
 *
 * O digitado nao se perde: vai para `valorInformado` e a tela mostra os dois
 * quando divergem. Apagar em silencio o numero que alguem negociou por telefone
 * seria pior que ignorar.
 *
 * Sem item nenhum, o digitado e a unica fonte — e nesse caso ele vira tambem o
 * `valorUnico`, para que o funil nao mostre R$ 0 numa oportunidade que tem valor.
 */
export function resolverValor(
  totais: TotaisDaOportunidade,
  valorInformado: number | null,
): { valor: number; valorUnico: number; valorMensal: number; valorInformado: number | null } {
  if (totais.itens > 0) {
    return {
      valor: totais.valor,
      valorUnico: totais.valorUnico,
      valorMensal: totais.valorMensal,
      valorInformado,
    };
  }

  const digitado = valorInformado ?? 0;
  return { valor: digitado, valorUnico: digitado, valorMensal: 0, valorInformado };
}

// ---------------------------------------------------------------------------
// Alcada de desconto — item 2.3
// ---------------------------------------------------------------------------

/**
 * Desconto concedido, em fracao do bruto (0 a 1).
 *
 * Base no **bruto**, e nao no liquido: um desconto de R$ 200 sobre R$ 1.000 de
 * tabela e 20%, e dividir pelo liquido (R$ 800) daria 25% — a alcada ficaria
 * mais apertada do que a empresa decidiu, e apertada de um jeito que ninguem
 * consegue explicar.
 *
 * Acrescimo NAO entra na base. Se entrasse, dar um acrescimo aumentaria o teto
 * de desconto disponivel, e seria o caminho obvio para furar a alcada: sobe o
 * preco, desce o desconto, o percentual cai e a aprovacao desaparece.
 *
 * Sem bruto nao ha percentual — devolve nulo, nao zero. Proposta com bruto zero
 * e um caso de dado incompleto, e afirmar "0% de desconto" ali levaria a
 * aprovacao automatica.
 */
export function fracaoDeDesconto(totais: TotaisDaOportunidade): number | null {
  if (totais.bruto <= 0) return null;
  return totais.descontoTotal / totais.bruto;
}

/**
 * O teto de desconto de um perfil, em percentual.
 *
 * Quem aprova nao pede aprovacao a si mesmo: ADMIN, SUPERVISOR e GESTOR passam
 * sem teto. Sobra COMERCIAL, que e quem negocia, e e para quem a regra existe.
 *
 * AGENTE nunca chega aqui — `requireRole` barra antes —, e por isso ele recebe o
 * mesmo teto do comercial em vez de "sem teto": se um dia a rota mudar de perfil
 * por descuido, o padrao seguro e o restritivo.
 */
export function tetoDoPerfil(perfil: string, tetoDaOrganizacao: number): number {
  if (perfil === 'ADMIN' || perfil === 'SUPERVISOR' || perfil === 'GESTOR') return 100;
  return tetoDaOrganizacao;
}

export type SituacaoAlcada = 'NAO_REQUER' | 'PENDENTE';

/**
 * Se a proposta precisa de aprovacao, dado quem a montou.
 *
 * Passa do teto **estritamente**: um teto de 10% aceita exatamente 10% sem
 * aprovacao. Teto e o limite do que se pode conceder sozinho, e recusar o
 * proprio numero da politica confundiria todo mundo.
 *
 * Percentual nulo (sem bruto) NAO vira pendencia: nao ha desconto medido, e
 * mandar para aprovacao uma proposta sem valor daria fila de nada.
 */
export function situacaoDaAlcada(fracao: number | null, tetoPercentual: number): SituacaoAlcada {
  if (fracao === null) return 'NAO_REQUER';
  // Comparacao em percentual inteiro para nao brigar com ponto flutuante: 0,1
  // vezes 100 nao e exatamente 10 em binario, e um desconto de exatamente 10%
  // com teto 10 ficaria pendente por causa de resto binario.
  const percentual = Math.round(fracao * 10_000) / 100;
  return percentual > tetoPercentual ? 'PENDENTE' : 'NAO_REQUER';
}
