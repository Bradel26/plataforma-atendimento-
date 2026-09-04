import { totaisDaOportunidade, type ItemParaTotal } from './valores';

/**
 * A proposta comercial em papel (item 2.2 do plano em ANALISE-CRM.md).
 *
 * Este arquivo monta o **documento**: que blocos existem, em que ordem, com que
 * texto. O desenho em PDF fica em `proposta.pdf.ts`, e a separacao e o que
 * permite testar a proposta sem abrir um PDF — a parte que erra em silencio e a
 * do conteudo, nao a do traco.
 *
 * A proposta e o unico artefato da plataforma que **o cliente le**. Um numero
 * errado aqui nao vira um grafico estranho: vira um preco que a empresa vai ter
 * de honrar. Por isso ela nao recalcula nada por conta propria — soma os itens
 * com a mesma funcao que grava o total (`totaisDaOportunidade`), para o papel e o
 * funil nunca discordarem.
 */

export type ItemDaProposta = {
  descricao: string;
  sku: string | null;
  quantidade: number;
  precoUnitario: number;
  acrescimo: number;
  desconto: number;
  recorrencia: 'UNICO' | 'MENSAL';
  bruto: number;
  liquido: number;
};

export type Proposta = {
  /** Nome de quem emite, nao da plataforma: e a marca da organizacao. */
  emissor: string;
  cliente: string;
  titulo: string;
  numero: string;
  emitidaEm: Date;
  /** Nulo quando a oportunidade nao tem previsao — validade inventada nao entra. */
  validaAte: Date | null;
  responsavel: string | null;
  /** Como se paga e quando chega. Nulos quando ninguem preencheu. */
  condicaoPagamento: string | null;
  prazoEntrega: string | null;
  itens: ItemDaProposta[];
  totais: {
    bruto: number;
    desconto: number;
    unico: number;
    mensal: number;
    mesesRecorrencia: number;
    total: number;
  };
  /** Linhas de rodape, na ordem em que aparecem. */
  observacoes: string[];
};

type Entrada = {
  id: string;
  titulo: string;
  criadoEm: Date;
  previsaoFechamento: Date | null;
  mesesRecorrencia: number;
  condicaoPagamento: string | null;
  prazoEntrega: string | null;
  conta: { nome: string };
  responsavel: { nome: string } | null;
  itens: Array<
    ItemParaTotal & {
      produto: { nome: string; sku: string | null };
    }
  >;
};

/**
 * Numero da proposta: os oito primeiros caracteres do id, em maiusculo.
 *
 * Nao ha sequencia por organizacao, e a ausencia e deliberada: um contador exige
 * unicidade transacional e, num sistema com varias organizacoes, ou vira gargalo
 * ou vira numero repetido. O id ja e unico e o cliente so precisa de algo curto
 * para citar ao telefone. Se um dia a empresa precisar de numeracao fiscal, ela
 * nao vem daqui — vem do ERP.
 */
export const numeroDaProposta = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase();

/** Bruto e liquido de uma linha, para a coluna "de / por". */
function linha(item: Entrada['itens'][number]): ItemDaProposta {
  const bruto = item.quantidade * item.precoUnitario;
  return {
    descricao: item.produto.nome,
    sku: item.produto.sku,
    quantidade: item.quantidade,
    precoUnitario: item.precoUnitario,
    acrescimo: item.acrescimo,
    desconto: item.desconto,
    recorrencia: item.recorrencia,
    bruto,
    liquido: bruto + item.acrescimo - item.desconto,
  };
}

/**
 * Monta a proposta a partir da oportunidade.
 *
 * `agora` entra por parametro para o teste nao depender do relogio — e para duas
 * geracoes do mesmo documento no mesmo segundo saírem iguais.
 */
export function montarProposta(o: Entrada, emissor: string, agora: Date): Proposta {
  const itens = o.itens.map(linha);
  const totais = totaisDaOportunidade(o.itens, o.mesesRecorrencia);

  const observacoes: string[] = [];

  /*
   * O horizonte da recorrencia e dito por extenso, sempre que houver parte
   * mensal.
   *
   * Sem essa linha, o cliente le "Total: R$ 12.400" ao lado de "Mensal: R$
   * 1.000" e nao tem como saber que o total ja embute doze meses — e vai
   * entender que o mensal e cobrado *alem* do total. E a confusao mais cara que
   * este documento pode causar.
   */
  if (totais.valorMensal > 0) {
    observacoes.push(
      `O valor total considera ${o.mesesRecorrencia} ${o.mesesRecorrencia === 1 ? 'mes' : 'meses'} ` +
        'de recorrencia, somados a parte de cobranca unica.',
    );
  }

  if (totais.descontoTotal > 0) {
    observacoes.push('Os descontos indicados constam de cada linha e ja estao aplicados nos totais.');
  }

  return {
    emissor,
    cliente: o.conta.nome,
    titulo: o.titulo,
    numero: numeroDaProposta(o.id),
    emitidaEm: agora,
    /*
     * A validade sai da previsao de fechamento, e so existe se ela existir.
     *
     * Escrever "valida por 15 dias" quando ninguem definiu prazo seria a
     * plataforma assumindo um compromisso comercial no lugar da empresa — num
     * documento que vai para o cliente e pode ser cobrado.
     */
    validaAte: o.previsaoFechamento,
    responsavel: o.responsavel?.nome ?? null,
    /*
     * Sem invencao: nao preenchido sai do documento inteiro, e nao como
     * "a combinar".
     *
     * "Condicao de pagamento: a combinar" impresso e uma frase que a empresa nao
     * escreveu e que o cliente pode cobrar depois. Campo ausente e honesto — a
     * conversa continua fora do papel, que e onde ela esta de verdade.
     */
    condicaoPagamento: o.condicaoPagamento?.trim() || null,
    prazoEntrega: o.prazoEntrega?.trim() || null,
    itens,
    totais: {
      bruto: totais.bruto,
      desconto: totais.descontoTotal,
      unico: totais.valorUnico,
      mensal: totais.valorMensal,
      mesesRecorrencia: o.mesesRecorrencia,
      total: totais.valor,
    },
    observacoes,
  };
}
